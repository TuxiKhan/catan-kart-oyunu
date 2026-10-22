/**
 * CATAN KART OYUNU - Supabase Veritabanı Şema Tipleri (TypeScript)
 * 001_initial_schema.sql ve 002_rls_and_realtime.sql ile %100 uyumludur.
 */

import { toClientGameView } from '../engine/gameEngine';
import type {
  ActiveTradeSession,
  AuthoritativeGameState,
  BuildingCardType,
  ClientGameView,
  EventCardType,
  GameLogEntry,
  MetropolisCard,
  PendingEventResolution,
  PublicPlayerState,
  ResourceType,
  RoomSettings,
  RoomStatus,
  TradeCounterOffer,
  TradeStatus,
  TurnPhase,
  VillageSlot,
} from '../../types/game';

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface RoomRow {
  id: string;
  room_code: string;
  status: RoomStatus;
  max_players: 3 | 4;
  settings: RoomSettings;
  turn_number: number;
  active_player_index: number;
  turn_phase: TurnPhase;
  turn_started_at: string;
  has_traded_this_turn: boolean;
  has_used_harbor_this_turn: boolean;
  winner_player_id: string | null;
  logs: GameLogEntry[];
  created_at: string;
  updated_at: string;
}

export interface RoomPlayerRow {
  id: string;
  room_id: string;
  player_id: string;
  nickname: string;
  seat_index: number;
  victory_points: number;
  hand_count: number;
  roads_count: number;
  knights_count: number;
  village_slots: VillageSlot[];
  has_longest_road: boolean;
  has_largest_army: boolean;
  is_connected: boolean;
  last_seen_at: string;
  created_at: string;
}

export interface PlayerHandRow {
  room_id: string;
  player_id: string;
  resources: ResourceType[];
  updated_at: string;
}

export interface DeckRow {
  room_id: string;
  resource_deck: ResourceType[];
  resource_discard: ResourceType[];
  building_deck: BuildingCardType[];
  event_deck: EventCardType[];
  event_discard: EventCardType[];
  updated_at: string;
}

export interface CardMarketRow {
  room_id: string;
  open_building_cards: BuildingCardType[];
  metropolis_deck: MetropolisCard[];
  resource_deck_count: number;
  resource_discard_count: number;
  building_deck_count: number;
  event_deck_count: number;
  event_discard_count: number;
  pending_event: PendingEventResolution | null;
  updated_at: string;
}

export interface TradeRow {
  id: string;
  room_id: string;
  initiator_player_id: string;
  wanted_resources: ResourceType[];
  offered_resources: ResourceType[];
  counter_offers: TradeCounterOffer[];
  status: TradeStatus;
  created_at: string;
  updated_at: string;
}

export interface Database {
  public: {
    Tables: {
      rooms: {
        Row: RoomRow;
        Insert: Partial<Omit<RoomRow, 'id' | 'room_code'>> & {
          id?: string;
          room_code: string;
        };
        Update: Partial<RoomRow>;
      };
      room_players: {
        Row: RoomPlayerRow;
        Insert: Partial<Omit<RoomPlayerRow, 'id' | 'room_id' | 'player_id' | 'nickname' | 'seat_index'>> & {
          id?: string;
          room_id: string;
          player_id: string;
          nickname: string;
          seat_index: number;
        };
        Update: Partial<RoomPlayerRow>;
      };
      player_hands: {
        Row: PlayerHandRow;
        Insert: {
          room_id: string;
          player_id: string;
          resources?: ResourceType[];
          updated_at?: string;
        };
        Update: Partial<PlayerHandRow>;
      };
      decks: {
        Row: DeckRow;
        Insert: {
          room_id: string;
          resource_deck?: ResourceType[];
          resource_discard?: ResourceType[];
          building_deck?: BuildingCardType[];
          event_deck?: EventCardType[];
          event_discard?: EventCardType[];
          updated_at?: string;
        };
        Update: Partial<DeckRow>;
      };
      card_market: {
        Row: CardMarketRow;
        Insert: {
          room_id: string;
          open_building_cards?: BuildingCardType[];
          metropolis_deck?: MetropolisCard[];
          resource_deck_count?: number;
          resource_discard_count?: number;
          building_deck_count?: number;
          event_deck_count?: number;
          event_discard_count?: number;
          pending_event?: PendingEventResolution | null;
          updated_at?: string;
        };
        Update: Partial<CardMarketRow>;
      };
      trades: {
        Row: TradeRow;
        Insert: {
          id?: string;
          room_id: string;
          initiator_player_id: string;
          wanted_resources?: ResourceType[];
          offered_resources?: ResourceType[];
          counter_offers?: TradeCounterOffer[];
          status?: TradeStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<TradeRow>;
      };
    };
    Functions: {
      request_player_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      get_masked_client_game_view: {
        Args: {
          p_room_id: string;
          p_player_id?: string | null;
        };
        Returns: ClientGameView;
      };
      sync_authoritative_room_state: {
        Args: {
          p_state: AuthoritativeGameState;
        };
        Returns: void;
      };
      load_authoritative_room_by_code: {
        Args: {
          p_room_code: string;
        };
        Returns: AuthoritativeGameState | null;
      };
    };
  };
}

/**
 * Veritabanı satırlarını (room_players) PublicPlayerState nesnesine dönüştürür.
 * Rakiplerin elindeki kaynak türlerini içermez, yalnızca handCount içerir.
 */
export function mapRoomPlayerRowToPublicState(row: RoomPlayerRow): PublicPlayerState {
  return {
    playerId: row.player_id,
    nickname: row.nickname,
    seatIndex: row.seat_index,
    isConnected: row.is_connected,
    lastSeenAt: row.last_seen_at,
    handCount: row.hand_count,
    roadsCount: row.roads_count,
    knightsCount: row.knights_count,
    villageSlots: row.village_slots,
    hasLongestRoad: row.has_longest_road,
    hasLargestArmy: row.has_largest_army,
    victoryPoints: row.victory_points,
  };
}

/**
 * Veritabanı trade satırını ActiveTradeSession nesnesine dönüştürür.
 */
export function mapTradeRowToActiveSession(row: TradeRow): ActiveTradeSession {
  return {
    id: row.id,
    roomId: row.room_id,
    initiatorPlayerId: row.initiator_player_id,
    wantedResources: row.wanted_resources,
    offeredResources: row.offered_resources,
    counterOffers: row.counter_offers,
    status: row.status,
  };
}

/**
 * Sunucu tarafındaki tam AuthoritativeGameState durumundan belirli bir oyuncu için
 * RLS kurallarıyla birebir aynı maskelenmiş ClientGameView üretir.
 */
export const maskGameStateForPlayer = toClientGameView;
