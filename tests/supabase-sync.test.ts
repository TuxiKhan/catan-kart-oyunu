import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildInitialMetropolisDeck,
  clearMemoryRoomStore,
  createAuthoritativeRoom,
  initiateTrade,
  joinAuthoritativeRoom,
  MultiplayerSyncManager,
  startAuthoritativeGame,
  submitCounterOffer,
} from '../src/lib/multiplayer/syncManager';
import {
  canClientReadDecksDirectly,
  canPlayerReadHand,
  REALTIME_PUBLISHED_TABLES,
  SERVER_ONLY_RESTRICTED_TABLES,
} from '../src/lib/supabase/client';
import {
  type CardMarketRow,
  type Database,
  type DeckRow,
  maskGameStateForPlayer,
  type PlayerHandRow,
  type RoomPlayerRow,
  type RoomRow,
  type TradeRow,
} from '../src/lib/supabase/database.types';
import {
  fetchAuthoritativeRoomFromSupabase,
  fetchMaskedClientGameViewFromSupabase,
  mapStateToCardMarketRow,
  mapStateToDeckRow,
  mapStateToPlayerHandRows,
  mapStateToRoomPlayerRows,
  mapStateToRoomRow,
  mapStateToTradeRow,
  persistRoomToSupabase,
  reconstructAuthoritativeStateFromRows,
  subscribeToSupabaseRoomRealtime,
  syncAuthoritativeStateToSupabase,
  upsertPlayerToSupabase,
} from '../src/lib/supabase/supabaseRoomRepository';
import type { AuthoritativeGameState, RoomSettings } from '../src/types/game';

/**
 * In-Memory Mock Supabase Client
 * Gerçek PostgreSQL tablolarını (`rooms`, `room_players`, `player_hands`, `decks`, `card_market`, `trades`),
 * `get_masked_client_game_view` RPC fonksiyonunu ve Realtime kanal aboneliklerini birebir simüle eder.
 */
function createMockSupabaseEnvironment() {
  const tables = {
    rooms: new Map<string, RoomRow>(),
    room_players: new Map<string, RoomPlayerRow>(), // key: `${room_id}:${player_id}`
    player_hands: new Map<string, PlayerHandRow>(), // key: `${room_id}:${player_id}`
    decks: new Map<string, DeckRow>(), // key: room_id
    card_market: new Map<string, CardMarketRow>(), // key: room_id
    trades: new Map<string, TradeRow>(), // key: id
  };

  const postgresListeners: Array<{
    table: string;
    filter?: string;
    callback: (payload: { eventType: string; new: Record<string, unknown> }) => void;
  }> = [];

  const broadcastListeners: Array<
    (payload: { payload?: { state?: AuthoritativeGameState } }) => void
  > = [];

  const presenceListeners: Array<() => void> = [];
  const presenceStateRecord: Record<string, Array<{ playerId: string; onlineAt: string }>> = {};

  const reconstructCurrentState = (roomId: string): AuthoritativeGameState | null => {
    const room = tables.rooms.get(roomId);
    if (!room) return null;
    const players = Array.from(tables.room_players.values()).filter((p) => p.room_id === roomId);
    const hands = Array.from(tables.player_hands.values()).filter((h) => h.room_id === roomId);
    const deck = tables.decks.get(roomId);
    const market = tables.card_market.get(roomId);
    const activeTrade =
      Array.from(tables.trades.values()).find(
        (t) => t.room_id === roomId && (t.status === 'open' || t.status === 'offered')
      ) || null;

    if (!deck || !market) return null;
    return reconstructAuthoritativeStateFromRows({
      room,
      players,
      hands,
      deck,
      market,
      activeTrade,
    });
  };

  const client = {
    from(tableName: keyof typeof tables) {
      return {
        upsert: async (payload: unknown) => {
          const rows = Array.isArray(payload) ? payload : [payload];
          for (const row of rows) {
            if (tableName === 'rooms') {
              const r = row as RoomRow;
              tables.rooms.set(r.id, { ...r });
            } else if (tableName === 'room_players') {
              const rp = row as RoomPlayerRow;
              tables.room_players.set(`${rp.room_id}:${rp.player_id}`, {
                ...rp,
                id: rp.id || `rp_${rp.player_id}`,
                created_at: rp.created_at || new Date().toISOString(),
              });
            } else if (tableName === 'player_hands') {
              const ph = row as PlayerHandRow;
              tables.player_hands.set(`${ph.room_id}:${ph.player_id}`, { ...ph });
              // Trigger simulation: sync_player_hand_count
              const existingPlayer = tables.room_players.get(`${ph.room_id}:${ph.player_id}`);
              if (existingPlayer) {
                existingPlayer.hand_count = ph.resources.length;
              }
            } else if (tableName === 'decks') {
              const d = row as DeckRow;
              tables.decks.set(d.room_id, { ...d });
              // Trigger simulation: sync_deck_counts_to_market
              const existingMarket = tables.card_market.get(d.room_id);
              if (existingMarket) {
                existingMarket.resource_deck_count = d.resource_deck.length;
                existingMarket.resource_discard_count = d.resource_discard.length;
                existingMarket.building_deck_count = d.building_deck.length;
                existingMarket.event_deck_count = d.event_deck.length;
                existingMarket.event_discard_count = d.event_discard.length;
              }
            } else if (tableName === 'card_market') {
              const cm = row as CardMarketRow;
              tables.card_market.set(cm.room_id, { ...cm });
            } else if (tableName === 'trades') {
              const tr = row as TradeRow;
              tables.trades.set(tr.id, {
                ...tr,
                created_at: tr.created_at || new Date().toISOString(),
              });
            }
          }
          return { data: rows, error: null };
        },
        update: (patch: Record<string, unknown>) => ({
          eq: (col: string, val: string) => ({
            in: async (_inCol: string, statuses: string[]) => {
              if (tableName === 'trades' && col === 'room_id') {
                for (const [id, tr] of tables.trades.entries()) {
                  if (tr.room_id === val && statuses.includes(tr.status)) {
                    tables.trades.set(id, { ...tr, ...(patch as Partial<TradeRow>) });
                  }
                }
              }
              return { data: null, error: null };
            },
          }),
        }),
        select: () => ({
          eq: (col: string, val: string) => {
            const getMatchingRows = () => {
              if (tableName === 'rooms') {
                return Array.from(tables.rooms.values()).filter((r) =>
                  col === 'id' ? r.id === val : r.room_code === val
                );
              }
              if (tableName === 'room_players') {
                return Array.from(tables.room_players.values()).filter((r) => r.room_id === val);
              }
              if (tableName === 'player_hands') {
                return Array.from(tables.player_hands.values()).filter((r) => r.room_id === val);
              }
              if (tableName === 'decks') {
                const d = tables.decks.get(val);
                return d ? [d] : [];
              }
              if (tableName === 'card_market') {
                const m = tables.card_market.get(val);
                return m ? [m] : [];
              }
              if (tableName === 'trades') {
                return Array.from(tables.trades.values()).filter((t) => t.room_id === val);
              }
              return [];
            };

            const rows = getMatchingRows();
            return {
              data: rows,
              error: null,
              maybeSingle: async () => ({
                data: rows[0] ?? null,
                error: null,
              }),
              in: (_inCol: string, statuses: string[]) => ({
                maybeSingle: async () => {
                  const filtered = (rows as TradeRow[]).filter((t) =>
                    statuses.includes(t.status)
                  );
                  return { data: filtered[0] ?? null, error: null };
                },
              }),
            };
          },
        }),
      };
    },
    rpc: async (fnName: string, args: { p_room_id: string; p_player_id?: string }) => {
      if (fnName === 'get_masked_client_game_view') {
        const state = reconstructCurrentState(args.p_room_id);
        if (!state) {
          return { data: null, error: { message: 'Oda bulunamadı' } };
        }
        const masked = maskGameStateForPlayer(state, args.p_player_id || '');
        return { data: masked, error: null };
      }
      return { data: null, error: { message: 'Unknown RPC' } };
    },
    channel: (_name: string, opts?: { config?: { presence?: { key?: string } } }) => {
      const presenceKey = opts?.config?.presence?.key || 'guest';
      const channelObj = {
        on: (
          type: string,
          filter: { event?: string; table?: string; filter?: string },
          cb: (...args: unknown[]) => void
        ) => {
          if (type === 'broadcast') {
            broadcastListeners.push(
              cb as (payload: { payload?: { state?: AuthoritativeGameState } }) => void
            );
          } else if (type === 'postgres_changes') {
            postgresListeners.push({
              table: filter.table || '',
              filter: filter.filter,
              callback: cb as (payload: {
                eventType: string;
                new: Record<string, unknown>;
              }) => void,
            });
          } else if (type === 'presence') {
            presenceListeners.push(cb as () => void);
          }
          return channelObj;
        },
        subscribe: (cb?: (status: string) => void) => {
          if (cb) {
            void Promise.resolve().then(() => cb('SUBSCRIBED'));
          }
          return channelObj;
        },
        track: async (payload: { playerId: string; onlineAt: string }) => {
          presenceStateRecord[presenceKey] = [payload];
          return 'ok';
        },
        presenceState: () => presenceStateRecord,
        send: async (msg: { type: string; event: string; payload: { state: AuthoritativeGameState } }) => {
          if (msg.type === 'broadcast' && msg.event === 'STATE_SYNC') {
            broadcastListeners.forEach((listener) => listener({ payload: msg.payload }));
          }
          return 'ok';
        },
      };
      return channelObj;
    },
    removeChannel: async () => 'ok',
  };

  return {
    client: client as unknown as SupabaseClient<Database>,
    tables,
    postgresListeners,
    broadcastListeners,
    presenceListeners,
    presenceStateRecord,
  };
}

describe('Supabase PostgreSQL Schema Mappers, RPC & Realtime Synchronization', () => {
  const defaultSettings: RoomSettings = {
    maxPlayers: 4,
    useFirstGamePreset: true,
    metropolisFaceMode: 'B',
    turnTimeoutSeconds: 60,
  };

  beforeEach(() => {
    clearMemoryRoomStore();
  });

  it('1. Büyükşehir B Yüzü destesini 4 gerçek B yüzü kartıyla (Şövalyeler, En Güçlü Ordu, En Uzun Yol, Yollar) oluşturur', () => {
    const bDeck = buildInitialMetropolisDeck('B');
    expect(bDeck).toHaveLength(4);
    expect(bDeck.map((c) => c.bVariantId)).toEqual([
      'metropolis_b_1',
      'metropolis_b_2',
      'metropolis_b_3',
      'metropolis_b_4',
    ]);
    expect(bDeck[0].titleTr).toContain('Şövalyeler');
    expect(bDeck[1].titleTr).toContain('En Güçlü Ordu');
    expect(bDeck[2].titleTr).toContain('En Uzun Yol');
    expect(bDeck[3].titleTr).toContain('Yollar');
    expect(bDeck.every((c) => c.productionBonus === 1 && c.face === 'B')).toBe(true);
  });

  it('2. AuthoritativeGameState nesnesini 6 Supabase tablosuna (rooms, room_players, player_hands, decks, card_market, trades) eksiksiz eşler ve geri oluşturur', () => {
    let state = createAuthoritativeRoom(
      { playerId: 'p1', nickname: 'Fatih' },
      defaultSettings,
      'SUP400'
    ).state!;
    state = joinAuthoritativeRoom(state, { playerId: 'p2', nickname: 'Sinan' }).state!;
    state = joinAuthoritativeRoom(state, { playerId: 'p3', nickname: 'Mimar' }).state!;
    state = startAuthoritativeGame(state, 'p1').state!;
    state.turnPhase = 'action';
    state.hands['p1'] = ['brick', 'wood', 'wheat'];
    state.hands['p2'] = ['ore', 'wool'];
    state.hands['p3'] = ['wheat', 'brick'];

    state = initiateTrade(state, 'p1', ['ore'], ['brick']).state!;
    state = submitCounterOffer(state, 'p2', ['ore'], ['brick']).state!;

    const nowIso = new Date().toISOString();
    const roomRow = mapStateToRoomRow(state, nowIso) as RoomRow;
    const playerRows = mapStateToRoomPlayerRows(state) as RoomPlayerRow[];
    const handRows = mapStateToPlayerHandRows(state, nowIso) as PlayerHandRow[];
    const deckRow = mapStateToDeckRow(state, nowIso) as DeckRow;
    const marketRow = mapStateToCardMarketRow(state, nowIso) as CardMarketRow;
    const tradeRow = mapStateToTradeRow(state, nowIso) as TradeRow;

    expect(roomRow.room_code).toBe('SUP400');
    expect(playerRows).toHaveLength(3);
    expect(playerRows[0].hand_count).toBe(3);
    // room_players tablosunda rakiplerin kaynak türleri bulunmaz!
    expect('resources' in playerRows[0]).toBe(false);
    expect(handRows[0].resources).toEqual(['brick', 'wood', 'wheat']);
    expect(marketRow.open_building_cards).toHaveLength(5);
    expect(marketRow.metropolis_deck).toHaveLength(4);
    expect(tradeRow).not.toBeNull();
    expect(tradeRow.counter_offers).toHaveLength(1);

    const reconstructed = reconstructAuthoritativeStateFromRows({
      room: roomRow,
      players: playerRows,
      hands: handRows,
      deck: deckRow,
      market: marketRow,
      activeTrade: tradeRow,
    });

    expect(reconstructed.roomCode).toBe('SUP400');
    expect(reconstructed.hands['p1']).toEqual(['brick', 'wood', 'wheat']);
    expect(reconstructed.hands['p2']).toEqual(['ore', 'wool']);
    expect(reconstructed.cardMarket).toEqual(state.cardMarket);
    expect(reconstructed.activeTrade?.counterOffers).toHaveLength(1);
  });

  it('3. persistRoomToSupabase, upsertPlayerToSupabase, syncAuthoritativeStateToSupabase ve get_masked_client_game_view RPC fonksiyonlarını doğrular', async () => {
    const mockEnv = createMockSupabaseEnvironment();

    let state = createAuthoritativeRoom(
      { playerId: 'p1', nickname: 'Kurucu' },
      defaultSettings,
      'DBSYNC'
    ).state!;

    // 1. Odayı veritabanına kaydet
    const persistRes = await persistRoomToSupabase(state, mockEnv.client);
    expect(persistRes.ok).toBe(true);
    expect(persistRes.syncedTables).toEqual([
      'rooms',
      'room_players',
      'player_hands',
      'card_market',
      'decks',
      'trades',
    ]);
    expect(mockEnv.tables.rooms.size).toBe(1);

    // 2. Yeni oyuncuları ekle ve senkronize et
    state = joinAuthoritativeRoom(state, { playerId: 'p2', nickname: 'Oyuncu2' }).state!;
    state = joinAuthoritativeRoom(state, { playerId: 'p3', nickname: 'Oyuncu3' }).state!;
    const upsertP2 = await upsertPlayerToSupabase(
      state.roomId,
      state.players[1],
      ['wood', 'brick'],
      mockEnv.client
    );
    expect(upsertP2.ok).toBe(true);

    // 3. Oyunu başlat ve tüm tabloları senkronize et
    state = startAuthoritativeGame(state, 'p1').state!;
    state.hands['p1'] = ['wheat', 'wheat', 'ore'];
    state.hands['p2'] = ['brick', 'wood'];
    state.hands['p3'] = ['wool', 'wool'];

    const syncRes = await syncAuthoritativeStateToSupabase(state, mockEnv.client);
    expect(syncRes.ok).toBe(true);

    // 4. Veritabanından tam AuthoritativeGameState çek
    const fetchedState = await fetchAuthoritativeRoomFromSupabase('DBSYNC', mockEnv.client);
    expect(fetchedState).not.toBeNull();
    expect(fetchedState!.players).toHaveLength(3);
    expect(fetchedState!.hands['p1']).toEqual(['wheat', 'wheat', 'ore']);

    // 5. get_masked_client_game_view RPC ile p2 için maskelenmiş görünümü çek
    // p2 kendi elini ('brick', 'wood') görür; p1'in elindeki kartların türünü GÖREMEZ, sadece handCount=3 görür!
    const p2MaskedView = await fetchMaskedClientGameViewFromSupabase(
      state.roomId,
      'p2',
      mockEnv.client
    );
    expect(p2MaskedView).not.toBeNull();
    expect(p2MaskedView!.myPlayerId).toBe('p2');
    expect(p2MaskedView!.myHand).toEqual(['brick', 'wood']);
    const p1PublicInP2View = p2MaskedView!.players.find((p) => p.playerId === 'p1')!;
    expect(p1PublicInP2View.handCount).toBe(3);
    expect('resources' in p1PublicInP2View).toBe(false);

    // RLS yardımcı doğrulayıcıları kontrol et
    expect(canPlayerReadHand('p2', 'p2')).toBe(true);
    expect(canPlayerReadHand('p1', 'p2')).toBe(false);
    expect(canClientReadDecksDirectly()).toBe(false);
    expect(SERVER_ONLY_RESTRICTED_TABLES).toContain('decks');
    expect(REALTIME_PUBLISHED_TABLES).not.toContain('decks');
  });

  it('4. MultiplayerSyncManager ile Supabase Realtime (postgres_changes, broadcast, presence) ve DB senkronizasyonunu uçtan uca çalıştırır', async () => {
    const mockEnv = createMockSupabaseEnvironment();

    let state = createAuthoritativeRoom(
      { playerId: 'p1', nickname: 'Host' },
      defaultSettings,
      'RT900'
    ).state!;
    state = joinAuthoritativeRoom(state, { playerId: 'p2', nickname: 'Konuk2' }).state!;
    state = joinAuthoritativeRoom(state, { playerId: 'p3', nickname: 'Konuk3' }).state!;
    state = startAuthoritativeGame(state, 'p1').state!;

    const manager = new MultiplayerSyncManager('RT900', 'p1', mockEnv.client);
    manager.connect();

    // Realtime kanalı yalnızca izin verilen 5 tabloyu dinlemeli, 'decks' tablosunu KESİNLİKLE dinlememelidir!
    const subscribedTables = mockEnv.postgresListeners.map((l) => l.table);
    expect(subscribedTables).toEqual([
      'rooms',
      'room_players',
      'card_market',
      'trades',
      'player_hands',
    ]);
    expect(subscribedTables).not.toContain('decks');

    // syncToDatabase çağrısı tüm tabloları günceller
    const dbSync = await manager.syncToDatabase(state);
    expect(dbSync.ok).toBe(true);

    // RPC üzerinden maskelenmiş görünüm alma
    const rpcView = await manager.fetchMaskedClientViewFromRpc(state.roomId);
    expect(rpcView).not.toBeNull();
    expect(rpcView?.roomCode).toBe('RT900');
    expect(rpcView?.myPlayerId).toBe('p1');

    // Uzak veritabanında değişiklik olduğunda (postgres_changes) otomatik senkronizasyon
    const p1Row = mockEnv.tables.room_players.get(`${state.roomId}:p1`)!;
    p1Row.victory_points = 5;
    mockEnv.postgresListeners[0].callback({
      eventType: 'UPDATE',
      new: { id: state.roomId },
    });

    const refreshed = await manager.fetchFromDatabase();
    expect(refreshed?.players[0].victoryPoints).toBe(5);

    manager.disconnect();
  });
});
