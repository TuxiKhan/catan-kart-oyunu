import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canClientReadDecksDirectly,
  canPlayerReadHand,
  createPlayerSupabaseClient,
  getRoomRealtimeChannelName,
  REALTIME_PUBLISHED_TABLES,
  SERVER_ONLY_RESTRICTED_TABLES,
} from '../src/lib/supabase/client';
import {
  mapRoomPlayerRowToPublicState,
  mapTradeRowToActiveSession,
  maskGameStateForPlayer,
  type RoomPlayerRow,
  type TradeRow,
} from '../src/lib/supabase/database.types';
import type { AuthoritativeGameState } from '../src/types/game';

const MIGRATION_001_PATH = path.resolve(
  __dirname,
  '../supabase/migrations/001_initial_schema.sql'
);
const MIGRATION_002_PATH = path.resolve(
  __dirname,
  '../supabase/migrations/002_rls_and_realtime.sql'
);

describe('Supabase PostgreSQL Şema ve RLS Doğrulama Testleri', () => {
  const sql001 = fs.readFileSync(MIGRATION_001_PATH, 'utf-8');
  const sql002 = fs.readFileSync(MIGRATION_002_PATH, 'utf-8');

  it('001_initial_schema.sql tüm 6 ana tabloyu içermelidir', () => {
    expect(sql001).toContain('CREATE TABLE IF NOT EXISTS public.rooms');
    expect(sql001).toContain('CREATE TABLE IF NOT EXISTS public.room_players');
    expect(sql001).toContain('CREATE TABLE IF NOT EXISTS public.player_hands');
    expect(sql001).toContain('CREATE TABLE IF NOT EXISTS public.decks');
    expect(sql001).toContain('CREATE TABLE IF NOT EXISTS public.card_market');
    expect(sql001).toContain('CREATE TABLE IF NOT EXISTS public.trades');
  });

  it('rooms tablosu 3-4 kişi sınırını, tur süresini (0, 60, 90) ve Büyükşehir A/B yüzü ayarlarını kısıtlamalıdır', () => {
    expect(sql001).toContain('CHECK (max_players >= 3 AND max_players <= 4)');
    expect(sql001).toContain("((settings->>'maxPlayers')::int IN (3, 4))");
    expect(sql001).toContain("((settings->>'metropolisFaceMode') IN ('A', 'B'))");
    expect(sql001).toContain("((settings->>'turnTimeoutSeconds')::int IN (0, 60, 90))");
    expect(sql001).toContain('has_traded_this_turn BOOLEAN NOT NULL DEFAULT FALSE');
    expect(sql001).toContain('has_used_harbor_this_turn BOOLEAN NOT NULL DEFAULT FALSE');
  });

  it('room_players, player_hands ve card_market arasındaki senkronizasyon tetikleyicileri tanımlı olmalıdır', () => {
    expect(sql001).toContain('CREATE TRIGGER trg_check_room_player_capacity');
    expect(sql001).toContain('CREATE TRIGGER trg_sync_player_hand_count');
    expect(sql001).toContain('CREATE TRIGGER trg_sync_deck_counts_to_market');
    expect(sql001).toContain('jsonb_array_length(open_building_cards) <= 5');
    expect(sql001).toContain('jsonb_array_length(metropolis_deck) <= 4');
  });

  it('002_rls_and_realtime.sql tüm tablolarda RLS aktif etmeli ve hile korumasını sağlamalıdır', () => {
    expect(sql002).toContain('ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;');
    expect(sql002).toContain('ALTER TABLE public.room_players ENABLE ROW LEVEL SECURITY;');
    expect(sql002).toContain('ALTER TABLE public.player_hands ENABLE ROW LEVEL SECURITY;');
    expect(sql002).toContain('ALTER TABLE public.decks ENABLE ROW LEVEL SECURITY;');
    expect(sql002).toContain('ALTER TABLE public.card_market ENABLE ROW LEVEL SECURITY;');
    expect(sql002).toContain('ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;');

    // player_hands sadece ilgili oyuncuya açık olmalı
    expect(sql002).toContain('CREATE POLICY "player_hands_select_own_only"');
    expect(sql002).toContain("current_setting('request.jwt.claims', true)::json->>'sub'");

    // decks istemciye tamamen kapalı olmalı
    expect(sql002).toContain('CREATE POLICY "decks_deny_all_client_access"');
    expect(sql002).toContain('ON public.decks');
    expect(sql002).toContain('USING (false)');

    // Güvenli RPC fonksiyonu SECURITY DEFINER olmalı
    expect(sql002).toContain('CREATE OR REPLACE FUNCTION public.get_masked_client_game_view');
    expect(sql002).toContain('SECURITY DEFINER');
  });

  it('Supabase Realtime yayınına açık tablolar eklenmeli, kapalı decks tablosu EKLENMEMELİDİR', () => {
    expect(sql002).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;');
    expect(sql002).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE public.room_players;');
    expect(sql002).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE public.card_market;');
    expect(sql002).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE public.trades;');
    expect(sql002).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE public.player_hands;');
    expect(sql002).not.toContain('ALTER PUBLICATION supabase_realtime ADD TABLE public.decks;');

    expect(REALTIME_PUBLISHED_TABLES).toEqual([
      'rooms',
      'room_players',
      'card_market',
      'trades',
      'player_hands',
    ]);
    expect(SERVER_ONLY_RESTRICTED_TABLES).toEqual(['decks']);
  });

  it('RLS doğrulama yardımcıları ve maskGameStateForPlayer hile korumasını eksiksiz uygulamalıdır', () => {
    expect(canPlayerReadHand('player-1', 'player-1')).toBe(true);
    expect(canPlayerReadHand('player-1', 'player-2')).toBe(false);
    expect(canPlayerReadHand('player-1', null)).toBe(false);
    expect(canClientReadDecksDirectly()).toBe(false);
    expect(getRoomRealtimeChannelName('room-abc')).toBe('catan_room:room-abc');

    const client = createPlayerSupabaseClient('guest-player-1');
    expect(client).toBeDefined();

    const mockFullState: AuthoritativeGameState = {
      roomId: 'room-101',
      roomCode: 'CATAN4',
      status: 'playing',
      settings: {
        maxPlayers: 4,
        useFirstGamePreset: true,
        metropolisFaceMode: 'A',
        turnTimeoutSeconds: 60,
      },
      turnNumber: 3,
      activePlayerIndex: 0,
      turnPhase: 'action',
      turnStartedAt: '2026-10-21T00:00:00.000Z',
      hasTradedThisTurn: false,
      hasUsedHarborThisTurn: false,
      players: [
        {
          playerId: 'p1',
          nickname: 'Sina',
          seatIndex: 0,
          isConnected: true,
          lastSeenAt: '2026-10-21T00:00:00.000Z',
          handCount: 3,
          roadsCount: 2,
          knightsCount: 1,
          villageSlots: [
            {
              id: 'v1',
              isInitialSettlement: true,
              hasFirstPlayerMarker: true,
              upgradedTo: 'none',
            },
          ],
          hasLongestRoad: false,
          hasLargestArmy: false,
          victoryPoints: 1,
        },
        {
          playerId: 'p2',
          nickname: 'Rakip',
          seatIndex: 1,
          isConnected: true,
          lastSeenAt: '2026-10-21T00:00:00.000Z',
          handCount: 4,
          roadsCount: 1,
          knightsCount: 0,
          villageSlots: [
            {
              id: 'v2',
              isInitialSettlement: true,
              upgradedTo: 'city',
            },
          ],
          hasLongestRoad: false,
          hasLargestArmy: false,
          victoryPoints: 2,
        },
      ],
      hands: {
        p1: ['brick', 'wood', 'wheat'],
        p2: ['ore', 'ore', 'wool', 'wheat'],
      },
      resourceDeck: ['brick', 'wool', 'ore', 'wood', 'wheat'],
      resourceDiscard: ['brick'],
      buildingDeck: ['road', 'settlement', 'city'],
      cardMarket: ['settlement', 'settlement', 'knight', 'road', 'city'],
      metropolisDeck: [
        {
          id: 'metro-1',
          face: 'A',
          titleTr: 'Büyükşehir',
          descriptionTr: 'Tur başında +2 kaynak üretir.',
          productionBonus: 2,
        },
      ],
      eventDeck: ['robber', 'charity', 'incentive'],
      eventDiscard: ['new_year'],
      pendingEvent: null,
      activeTrade: null,
      winnerPlayerId: null,
      logs: [],
    };

    const p1View = maskGameStateForPlayer(mockFullState, 'p1');
    expect(p1View.myPlayerId).toBe('p1');
    expect(p1View.myHand).toEqual(['brick', 'wood', 'wheat']);
    // Rakibin elindeki kartların türleri ClientGameView'da yer almaz, sadece handCount=4 görünür!
    expect(p1View.players.find((p) => p.playerId === 'p2')?.handCount).toBe(4);
    expect('hands' in p1View).toBe(false);
    expect('resourceDeck' in p1View).toBe(false);
    expect(p1View.resourceDeckCount).toBe(5);
    expect(p1View.buildingDeckCount).toBe(3);
    expect(p1View.eventDeckCount).toBe(3);
  });

  it('Veritabanı satır dönüştürücüleri (mapRoomPlayerRowToPublicState ve mapTradeRowToActiveSession) doğru çalışmalıdır', () => {
    const playerRow: RoomPlayerRow = {
      id: 'row-1',
      room_id: 'room-1',
      player_id: 'p1',
      nickname: 'Oyuncu1',
      seat_index: 0,
      victory_points: 4,
      hand_count: 5,
      roads_count: 3,
      knights_count: 2,
      village_slots: [{ id: 's1', isInitialSettlement: true, upgradedTo: 'city' }],
      has_longest_road: true,
      has_largest_army: true,
      is_connected: true,
      last_seen_at: '2026-10-21T00:00:00.000Z',
      created_at: '2026-10-21T00:00:00.000Z',
    };

    const publicState = mapRoomPlayerRowToPublicState(playerRow);
    expect(publicState.playerId).toBe('p1');
    expect(publicState.handCount).toBe(5);
    expect(publicState.hasLongestRoad).toBe(true);
    expect(publicState.hasLargestArmy).toBe(true);

    const tradeRow: TradeRow = {
      id: 'trade-1',
      room_id: 'room-1',
      initiator_player_id: 'p1',
      wanted_resources: ['ore'],
      offered_resources: ['wood', 'brick'],
      counter_offers: [],
      status: 'open',
      created_at: '2026-10-21T00:00:00.000Z',
      updated_at: '2026-10-21T00:00:00.000Z',
    };

    const tradeSession = mapTradeRowToActiveSession(tradeRow);
    expect(tradeSession.initiatorPlayerId).toBe('p1');
    expect(tradeSession.wantedResources).toEqual(['ore']);
    expect(tradeSession.offeredResources).toEqual(['wood', 'brick']);
  });
});
