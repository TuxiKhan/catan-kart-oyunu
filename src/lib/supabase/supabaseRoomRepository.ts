/**
 * CATAN KART OYUNU - Supabase PostgreSQL & Realtime Oda Senkronizasyon Katmanı
 *
 * Bu modül; `rooms`, `room_players`, `player_hands`, `decks`, `card_market`, `trades`
 * tabloları ve `get_masked_client_game_view` RPC fonksiyonu ile `AuthoritativeGameState`
 * arasında tam çift yönlü (bi-directional) veritabanı + Realtime senkronizasyonu sağlar.
 */

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type {
  AuthoritativeGameState,
  ClientGameView,
  PublicPlayerState,
  ResourceType,
} from '../../types/game';
import {
  createPlayerSupabaseClient,
  createServiceSupabaseClient,
  getRoomRealtimeChannelName,
  isSupabaseConfigured,
  REALTIME_PUBLISHED_TABLES,
} from './client';
import {
  type CardMarketRow,
  type Database,
  type DeckRow,
  mapRoomPlayerRowToPublicState,
  mapTradeRowToActiveSession,
  type PlayerHandRow,
  type RoomPlayerRow,
  type RoomRow,
  type TradeRow,
} from './database.types';

export interface SupabaseSyncResult {
  ok: boolean;
  error?: string;
  syncedTables?: string[];
}

export interface SupabaseRoomDataBundle {
  room: RoomRow;
  players: RoomPlayerRow[];
  hands: PlayerHandRow[];
  deck: DeckRow;
  market: CardMarketRow;
  activeTrade?: TradeRow | null;
}

export interface SupabaseRealtimeSubscriptionOptions {
  roomId: string;
  roomCode: string;
  viewerPlayerId: string;
  client?: SupabaseClient<Database>;
  onBroadcastState?: (state: AuthoritativeGameState) => void;
  onPostgresChange?: (payload: {
    table: (typeof REALTIME_PUBLISHED_TABLES)[number];
    eventType: string;
    newRecord: Record<string, unknown> | null;
  }) => void;
  onPresenceSync?: (onlinePlayerIds: string[]) => void;
}

/**
 * AuthoritativeGameState -> `rooms` tablosu satır dönüşümü
 */
export function mapStateToRoomRow(
  state: AuthoritativeGameState,
  nowIso: string = new Date().toISOString()
): Database['public']['Tables']['rooms']['Insert'] {
  return {
    id: state.roomId,
    room_code: state.roomCode.trim().toUpperCase(),
    status: state.status,
    max_players: state.settings.maxPlayers,
    settings: { ...state.settings },
    turn_number: state.turnNumber,
    active_player_index: state.activePlayerIndex,
    turn_phase: state.turnPhase,
    turn_started_at: state.turnStartedAt,
    has_traded_this_turn: state.hasTradedThisTurn,
    has_used_harbor_this_turn: state.hasUsedHarborThisTurn,
    winner_player_id: state.winnerPlayerId ?? null,
    logs: [...state.logs],
    updated_at: nowIso,
  };
}

/**
 * AuthoritativeGameState -> `room_players` tablosu satırları dönüşümü
 * (Rakiplerin elindeki kaynak türleri bu tabloda yer almaz, yalnızca hand_count tutulur)
 */
export function mapStateToRoomPlayerRows(
  state: AuthoritativeGameState
): Database['public']['Tables']['room_players']['Insert'][] {
  return state.players.map((p) => ({
    room_id: state.roomId,
    player_id: p.playerId,
    nickname: p.nickname,
    seat_index: p.seatIndex,
    victory_points: p.victoryPoints,
    hand_count: state.hands[p.playerId] ? state.hands[p.playerId].length : p.handCount,
    roads_count: p.roadsCount,
    knights_count: p.knightsCount,
    village_slots: p.villageSlots.map((slot) => ({ ...slot })),
    has_longest_road: p.hasLongestRoad,
    has_largest_army: p.hasLargestArmy,
    is_connected: p.isConnected,
    last_seen_at: p.lastSeenAt,
  }));
}

/**
 * AuthoritativeGameState -> `player_hands` tablosu satırları dönüşümü (RLS Korumalı)
 */
export function mapStateToPlayerHandRows(
  state: AuthoritativeGameState,
  nowIso: string = new Date().toISOString()
): Database['public']['Tables']['player_hands']['Insert'][] {
  return state.players.map((p) => ({
    room_id: state.roomId,
    player_id: p.playerId,
    resources: [...(state.hands[p.playerId] || [])],
    updated_at: nowIso,
  }));
}

/**
 * AuthoritativeGameState -> `decks` tablosu satırı dönüşümü (İstemciye Kapalı)
 */
export function mapStateToDeckRow(
  state: AuthoritativeGameState,
  nowIso: string = new Date().toISOString()
): Database['public']['Tables']['decks']['Insert'] {
  return {
    room_id: state.roomId,
    resource_deck: [...state.resourceDeck],
    resource_discard: [...state.resourceDiscard],
    building_deck: [...state.buildingDeck],
    event_deck: [...state.eventDeck],
    event_discard: [...state.eventDiscard],
    updated_at: nowIso,
  };
}

/**
 * AuthoritativeGameState -> `card_market` tablosu satırı dönüşümü
 */
export function mapStateToCardMarketRow(
  state: AuthoritativeGameState,
  nowIso: string = new Date().toISOString()
): Database['public']['Tables']['card_market']['Insert'] {
  return {
    room_id: state.roomId,
    open_building_cards: [...state.cardMarket],
    metropolis_deck: state.metropolisDeck.map((m) => ({ ...m })),
    resource_deck_count: state.resourceDeck.length,
    resource_discard_count: state.resourceDiscard.length,
    building_deck_count: state.buildingDeck.length,
    event_deck_count: state.eventDeck.length,
    event_discard_count: state.eventDiscard.length,
    pending_event: state.pendingEvent ? { ...state.pendingEvent } : null,
    updated_at: nowIso,
  };
}

/**
 * AuthoritativeGameState -> `trades` tablosu satırı dönüşümü
 */
export function mapStateToTradeRow(
  state: AuthoritativeGameState,
  nowIso: string = new Date().toISOString()
): Database['public']['Tables']['trades']['Insert'] | null {
  if (!state.activeTrade) {
    return null;
  }
  return {
    id: state.activeTrade.id,
    room_id: state.roomId,
    initiator_player_id: state.activeTrade.initiatorPlayerId,
    wanted_resources: [...(state.activeTrade.wantedResources || [])],
    offered_resources: [...(state.activeTrade.offeredResources || [])],
    counter_offers: state.activeTrade.counterOffers.map((o) => ({
      ...o,
      offeredResources: [...o.offeredResources],
      requestedResources: [...o.requestedResources],
    })),
    status: state.activeTrade.status,
    updated_at: nowIso,
  };
}

/**
 * Veritabanı satırlarından (6 tablo) tam `AuthoritativeGameState` nesnesini yeniden inşa eder.
 */
export function reconstructAuthoritativeStateFromRows(
  bundle: SupabaseRoomDataBundle
): AuthoritativeGameState {
  const sortedPlayers = [...bundle.players]
    .sort((a, b) => a.seat_index - b.seat_index)
    .map(mapRoomPlayerRowToPublicState);

  const hands: Record<string, ResourceType[]> = {};
  for (const p of sortedPlayers) {
    hands[p.playerId] = [];
  }
  for (const h of bundle.hands) {
    hands[h.player_id] = [...(h.resources || [])];
  }

  return {
    roomId: bundle.room.id,
    roomCode: bundle.room.room_code,
    status: bundle.room.status,
    settings: { ...bundle.room.settings },
    turnNumber: bundle.room.turn_number,
    activePlayerIndex: bundle.room.active_player_index,
    turnPhase: bundle.room.turn_phase,
    turnStartedAt: bundle.room.turn_started_at,
    hasTradedThisTurn: bundle.room.has_traded_this_turn,
    hasUsedHarborThisTurn: bundle.room.has_used_harbor_this_turn,
    players: sortedPlayers,
    hands,
    resourceDeck: [...(bundle.deck?.resource_deck || [])],
    resourceDiscard: [...(bundle.deck?.resource_discard || [])],
    buildingDeck: [...(bundle.deck?.building_deck || [])],
    cardMarket: [...(bundle.market?.open_building_cards || [])],
    metropolisDeck: [...(bundle.market?.metropolis_deck || [])],
    eventDeck: [...(bundle.deck?.event_deck || [])],
    eventDiscard: [...(bundle.deck?.event_discard || [])],
    pendingEvent: bundle.market?.pending_event ? { ...bundle.market.pending_event } : null,
    activeTrade: bundle.activeTrade ? mapTradeRowToActiveSession(bundle.activeTrade) : null,
    winnerPlayerId: bundle.room.winner_player_id ?? null,
    logs: [...(bundle.room.logs || [])],
  };
}

/**
 * Yeni oluşturulan odayı Supabase PostgreSQL tablolarına kaydeder.
 */
export async function persistRoomToSupabase(
  state: AuthoritativeGameState,
  client?: SupabaseClient<Database>
): Promise<SupabaseSyncResult> {
  return syncAuthoritativeStateToSupabase(state, client);
}

/**
 * Odaya katılan veya yeniden bağlanan oyuncuyu `room_players` ve `player_hands` tablolarına yazar.
 */
export async function upsertPlayerToSupabase(
  roomId: string,
  player: PublicPlayerState,
  handResources: ResourceType[] = [],
  client?: SupabaseClient<Database>
): Promise<SupabaseSyncResult> {
  if (!client && !isSupabaseConfigured()) {
    return { ok: true, syncedTables: [] };
  }

  const db = client || createServiceSupabaseClient();
  const nowIso = new Date().toISOString();

  try {
    const playerRow: Database['public']['Tables']['room_players']['Insert'] = {
      room_id: roomId,
      player_id: player.playerId,
      nickname: player.nickname,
      seat_index: player.seatIndex,
      victory_points: player.victoryPoints,
      hand_count: handResources.length,
      roads_count: player.roadsCount,
      knights_count: player.knightsCount,
      village_slots: player.villageSlots.map((s) => ({ ...s })),
      has_longest_road: player.hasLongestRoad,
      has_largest_army: player.hasLargestArmy,
      is_connected: player.isConnected,
      last_seen_at: player.lastSeenAt || nowIso,
    };

    const { error: playerErr } = await db
      .from('room_players')
      .upsert(playerRow as never, { onConflict: 'room_id,player_id' });

    if (playerErr) {
      return { ok: false, error: `room_players upsert hatası: ${playerErr.message}` };
    }

    const handRow: Database['public']['Tables']['player_hands']['Insert'] = {
      room_id: roomId,
      player_id: player.playerId,
      resources: [...handResources],
      updated_at: nowIso,
    };

    const { error: handErr } = await db
      .from('player_hands')
      .upsert(handRow as never, { onConflict: 'room_id,player_id' });

    if (handErr) {
      return { ok: false, error: `player_hands upsert hatası: ${handErr.message}` };
    }

    return { ok: true, syncedTables: ['room_players', 'player_hands'] };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Bilinmeyen Supabase oyuncu kayıt hatası',
    };
  }
}

/**
 * Tam AuthoritativeGameState durumunu 6 Supabase PostgreSQL tablosuna
 * (`rooms`, `room_players`, `player_hands`, `decks`, `card_market`, `trades`)
 * sıralı ve bütünlüklü olarak senkronize eder.
 */
export async function syncAuthoritativeStateToSupabase(
  state: AuthoritativeGameState,
  client?: SupabaseClient<Database>
): Promise<SupabaseSyncResult> {
  if (!client && !isSupabaseConfigured()) {
    return { ok: true, syncedTables: [] };
  }

  const db = client || createServiceSupabaseClient();
  const nowIso = new Date().toISOString();
  const syncedTables: string[] = [];

  try {
    // 1. rooms tablosu
    const roomRow = mapStateToRoomRow(state, nowIso);
    const { error: roomError } = await db
      .from('rooms')
      .upsert(roomRow as never, { onConflict: 'id' });
    if (roomError) {
      return { ok: false, error: `rooms senkronizasyon hatası: ${roomError.message}` };
    }
    syncedTables.push('rooms');

    // 2. room_players tablosu
    const playerRows = mapStateToRoomPlayerRows(state);
    if (playerRows.length > 0) {
      const { error: playersError } = await db
        .from('room_players')
        .upsert(playerRows as never, { onConflict: 'room_id,player_id' });
      if (playersError) {
        return { ok: false, error: `room_players senkronizasyon hatası: ${playersError.message}` };
      }
      syncedTables.push('room_players');
    }

    // 3. player_hands tablosu (RLS korumalı gizli oyuncu elleri)
    const handRows = mapStateToPlayerHandRows(state, nowIso);
    if (handRows.length > 0) {
      const { error: handsError } = await db
        .from('player_hands')
        .upsert(handRows as never, { onConflict: 'room_id,player_id' });
      if (handsError) {
        return { ok: false, error: `player_hands senkronizasyon hatası: ${handsError.message}` };
      }
      syncedTables.push('player_hands');
    }

    // 4. card_market tablosu (Açık 5 inşaat kartı + Büyükşehir destesi + bekleyen olay)
    const marketRow = mapStateToCardMarketRow(state, nowIso);
    const { error: marketError } = await db
      .from('card_market')
      .upsert(marketRow as never, { onConflict: 'room_id' });
    if (marketError) {
      return { ok: false, error: `card_market senkronizasyon hatası: ${marketError.message}` };
    }
    syncedTables.push('card_market');

    // 5. decks tablosu (Sunucu özel kapalı desteler)
    const deckRow = mapStateToDeckRow(state, nowIso);
    const { error: deckError } = await db
      .from('decks')
      .upsert(deckRow as never, { onConflict: 'room_id' });
    if (deckError) {
      return { ok: false, error: `decks senkronizasyon hatası: ${deckError.message}` };
    }
    syncedTables.push('decks');

    // 6. trades tablosu (Aktif ticaret oturumu varsa upsert et, yoksa açık olanları kapat)
    const tradeRow = mapStateToTradeRow(state, nowIso);
    if (tradeRow) {
      const { error: tradeError } = await db
        .from('trades')
        .upsert(tradeRow as never, { onConflict: 'id' });
      if (tradeError) {
        return { ok: false, error: `trades senkronizasyon hatası: ${tradeError.message}` };
      }
      syncedTables.push('trades');
    } else {
      await db
        .from('trades')
        .update({ status: 'cancelled', updated_at: nowIso } as never)
        .eq('room_id', state.roomId)
        .in('status', ['open', 'offered']);
      syncedTables.push('trades');
    }

    return { ok: true, syncedTables };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Bilinmeyen Supabase senkronizasyon hatası',
    };
  }
}

/**
 * `get_masked_client_game_view` PostgreSQL RPC fonksiyonunu çağırarak
 * oyuncuya özel maskelenmiş (Hile Korumalı / RLS uyumlu) `ClientGameView` döner.
 */
export async function fetchMaskedClientGameViewFromSupabase(
  roomId: string,
  playerId: string,
  client?: SupabaseClient<Database>
): Promise<ClientGameView | null> {
  if (!client && !isSupabaseConfigured()) {
    return null;
  }

  const db = client || createPlayerSupabaseClient(playerId);
  try {
    const { data, error } = await db.rpc('get_masked_client_game_view', {
      p_room_id: roomId,
      p_player_id: playerId,
    } as never);

    if (error || !data) {
      return null;
    }

    return data as unknown as ClientGameView;
  } catch {
    return null;
  }
}

/**
 * Oda koduna veya ID'sine göre Supabase PostgreSQL'den tam `AuthoritativeGameState` çeker.
 */
export async function fetchAuthoritativeRoomFromSupabase(
  roomCodeOrId: string,
  client?: SupabaseClient<Database>
): Promise<AuthoritativeGameState | null> {
  if (!client && !isSupabaseConfigured()) {
    return null;
  }

  const db = client || createServiceSupabaseClient();
  const normalized = roomCodeOrId.trim();

  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      normalized
    );

    const roomQuery = db.from('rooms').select('*');
    const { data: roomData, error: roomErr } = isUuid
      ? await roomQuery.eq('id', normalized).maybeSingle()
      : await roomQuery.eq('room_code', normalized.toUpperCase()).maybeSingle();

    if (roomErr || !roomData) {
      return null;
    }

    const room = roomData as unknown as RoomRow;

    const [playersRes, handsRes, deckRes, marketRes, tradeRes] = await Promise.all([
      db.from('room_players').select('*').eq('room_id', room.id),
      db.from('player_hands').select('*').eq('room_id', room.id),
      db.from('decks').select('*').eq('room_id', room.id).maybeSingle(),
      db.from('card_market').select('*').eq('room_id', room.id).maybeSingle(),
      db
        .from('trades')
        .select('*')
        .eq('room_id', room.id)
        .in('status', ['open', 'offered'])
        .maybeSingle(),
    ]);

    const players = (playersRes.data || []) as unknown as RoomPlayerRow[];
    const hands = (handsRes.data || []) as unknown as PlayerHandRow[];
    const deck = (deckRes.data || {
      room_id: room.id,
      resource_deck: [],
      resource_discard: [],
      building_deck: [],
      event_deck: [],
      event_discard: [],
      updated_at: room.updated_at,
    }) as unknown as DeckRow;
    const market = (marketRes.data || {
      room_id: room.id,
      open_building_cards: [],
      metropolis_deck: [],
      resource_deck_count: 0,
      resource_discard_count: 0,
      building_deck_count: 0,
      event_deck_count: 0,
      event_discard_count: 0,
      pending_event: null,
      updated_at: room.updated_at,
    }) as unknown as CardMarketRow;
    const activeTrade = (tradeRes.data || null) as unknown as TradeRow | null;

    return reconstructAuthoritativeStateFromRows({
      room,
      players,
      hands,
      deck,
      market,
      activeTrade,
    });
  } catch {
    return null;
  }
}

/**
 * Supabase Realtime kanalını (`postgres_changes` + `broadcast` + `presence`) yapılandırır ve abone olur.
 * GÜVENLİK: `decks` tablosu kesinlikle dinlenmez ve yayınlanmaz; yalnızca `REALTIME_PUBLISHED_TABLES` dinlenir.
 */
export function subscribeToSupabaseRoomRealtime(
  options: SupabaseRealtimeSubscriptionOptions
): RealtimeChannel {
  const {
    roomId,
    viewerPlayerId,
    client,
    onBroadcastState,
    onPostgresChange,
    onPresenceSync,
  } = options;

  const db = client || createPlayerSupabaseClient(viewerPlayerId);
  const channelName = getRoomRealtimeChannelName(roomId);

  const channel = db.channel(channelName, {
    config: {
      broadcast: { self: false },
      presence: { key: viewerPlayerId },
    },
  });

  // 1. Broadcast (Anlık STATE_SYNC) dinleyicisi
  channel.on('broadcast', { event: 'STATE_SYNC' }, (payload) => {
    const incomingState = payload?.payload?.state as AuthoritativeGameState | undefined;
    if (incomingState && onBroadcastState) {
      onBroadcastState(incomingState);
    }
  });

  // 2. Postgres Changes dinleyicileri (rooms, room_players, card_market, trades, player_hands)
  for (const tableName of REALTIME_PUBLISHED_TABLES) {
    const filterColumn = tableName === 'rooms' ? 'id' : 'room_id';
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: tableName,
        filter: `${filterColumn}=eq.${roomId}`,
      },
      (payload) => {
        if (onPostgresChange) {
          onPostgresChange({
            table: tableName,
            eventType: payload.eventType,
            newRecord: (payload.new as Record<string, unknown>) || null,
          });
        }
      }
    );
  }

  // 3. Presence (Çevrimiçi / Bağlantı durumu) dinleyicisi
  channel.on('presence', { event: 'sync' }, () => {
    if (onPresenceSync) {
      const presenceState = channel.presenceState();
      const onlineIds = Object.keys(presenceState);
      onPresenceSync(onlineIds);
    }
  });

  channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({
        playerId: viewerPlayerId,
        onlineAt: new Date().toISOString(),
      });
    }
  });

  return channel;
}
