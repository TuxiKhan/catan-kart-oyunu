import { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import {
  ActiveTradeSession,
  AuthoritativeGameState,
  ClientGameView,
  PublicPlayerState,
  ResourceType,
  RoomSettings,
  TradeCounterOffer,
} from '@/types/game';
import {
  createBuildingDeck,
  createEventDeck,
  createResourceDeck,
  drawResourceCards,
  refillCardMarket,
  setupInitialCardMarket,
  shuffleArray,
} from '@/lib/engine/deck';
import {
  hasResourcesInHand,
  removeResourcesFromHand,
  toClientGameView,
} from '@/lib/engine/gameEngine';
import { createMetropolisDeck } from '@/lib/engine/metropolisRegistry';
import {
  createPlayerSupabaseClient,
  isSupabaseConfigured,
} from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';
import {
  fetchAuthoritativeRoomFromSupabase,
  fetchMaskedClientGameViewFromSupabase,
  persistRoomToSupabase,
  subscribeToSupabaseRoomRealtime,
  type SupabaseSyncResult,
  syncAuthoritativeStateToSupabase,
  upsertPlayerToSupabase,
} from '@/lib/supabase/supabaseRoomRepository';

export {
  createResourceDeck as buildInitialResourceDeck,
  createBuildingDeck as buildInitialBuildingDeck,
  createEventDeck as buildInitialEventDeck,
  createMetropolisDeck as buildInitialMetropolisDeck,
  hasResourcesInHand as hasSufficientResources,
  toClientGameView,
};

export interface GuestSession {
  playerId: string;
  nickname: string;
  roomCode?: string;
  updatedAt: string;
}

export interface SyncActionResult {
  ok: boolean;
  error?: string;
  state?: AuthoritativeGameState;
  bonusCardDrawn?: ResourceType | null;
}

const GUEST_STORAGE_KEY = 'catan_guest_session_v1';
const ROOM_STORAGE_PREFIX = 'catan_room_state_v1_';

// In-memory store for Node/Vitest environments and instant same-tab sync
const memoryRoomStore = new Map<string, AuthoritativeGameState>();
let memoryGuestSession: GuestSession | null = null;

function generateId(prefix = 'id'): string {
  const rand = Math.random().toString(36).substring(2, 10);
  const time = Date.now().toString(36).slice(-4);
  return `${prefix}_${time}_${rand}`;
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function createInitialPlayerState(
  playerId: string,
  nickname: string,
  seatIndex: number
): PublicPlayerState {
  const now = new Date().toISOString();
  return {
    playerId,
    nickname: nickname.trim() || `Oyuncu ${seatIndex + 1}`,
    seatIndex,
    isConnected: true,
    lastSeenAt: now,
    handCount: 0,
    roadsCount: 1, // Başlangıçta 1 İlk Yol
    knightsCount: 0,
    villageSlots: [
      {
        id: `village_init_${playerId}`,
        isInitialSettlement: true,
        hasFirstPlayerMarker: seatIndex === 0,
        upgradedTo: 'none',
      },
    ],
    hasLongestRoad: false,
    hasLargestArmy: false,
    victoryPoints: 1, // İlk Köy = 1 ZP
  };
}

/**
 * Misafir Girişi (Takma Ad ile Anında Giriş) Oturum Yönetimi
 */
export function getSavedGuestSession(): GuestSession | null {
  if (typeof window !== 'undefined') {
    try {
      const raw =
        window.sessionStorage.getItem(GUEST_STORAGE_KEY) ||
        window.localStorage.getItem(GUEST_STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw) as GuestSession;
      }
    } catch {
      // Fallback to memory
    }
  }
  return memoryGuestSession;
}

export function saveGuestSession(session: GuestSession): GuestSession {
  const normalized: GuestSession = {
    ...session,
    nickname: session.nickname.trim(),
    updatedAt: new Date().toISOString(),
  };
  memoryGuestSession = normalized;
  if (typeof window !== 'undefined') {
    try {
      const serialized = JSON.stringify(normalized);
      window.sessionStorage.setItem(GUEST_STORAGE_KEY, serialized);
      window.localStorage.setItem(GUEST_STORAGE_KEY, serialized);
    } catch {
      // Ignore storage quota errors
    }
  }
  return normalized;
}

export function createOrUpdateGuestSession(nickname: string, existingPlayerId?: string): GuestSession {
  const saved = getSavedGuestSession();
  const playerId = existingPlayerId || saved?.playerId || generateId('guest');
  return saveGuestSession({
    playerId,
    nickname: nickname.trim() || 'Misafir Oyuncu',
    roomCode: saved?.roomCode,
    updatedAt: new Date().toISOString(),
  });
}

export function clearGuestSession(): void {
  memoryGuestSession = null;
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(GUEST_STORAGE_KEY);
      window.localStorage.removeItem(GUEST_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }
}

/**
 * Yerel / Hafıza Oda Durumu Saklama (BroadcastChannel & Reconnection için)
 */
export function loadRoomStateFromStorage(roomCode: string): AuthoritativeGameState | null {
  const normalizedCode = roomCode.trim().toUpperCase();
  const fromMemory = memoryRoomStore.get(normalizedCode);
  if (fromMemory) {
    return structuredClone(fromMemory);
  }
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(`${ROOM_STORAGE_PREFIX}${normalizedCode}`);
      if (raw) {
        const parsed = JSON.parse(raw) as AuthoritativeGameState;
        memoryRoomStore.set(normalizedCode, parsed);
        return structuredClone(parsed);
      }
    } catch {
      // Ignore parse errors
    }
  }
  return null;
}

export function saveRoomStateToStorage(state: AuthoritativeGameState): void {
  const normalizedCode = state.roomCode.trim().toUpperCase();
  const cloned = structuredClone(state);
  memoryRoomStore.set(normalizedCode, cloned);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        `${ROOM_STORAGE_PREFIX}${normalizedCode}`,
        JSON.stringify(cloned)
      );
    } catch {
      // Ignore storage errors
    }
  }
}

export function clearMemoryRoomStore(): void {
  memoryRoomStore.clear();
}

/**
 * Yeni Oda Oluşturma (3 veya 4 Kişilik)
 */
export function createAuthoritativeRoom(
  hostSession: { playerId: string; nickname: string },
  settings: RoomSettings,
  customRoomCode?: string
): SyncActionResult {
  if (settings.maxPlayers !== 3 && settings.maxPlayers !== 4) {
    return {
      ok: false,
      error: 'Oda oyuncu sayısı yalnızca 3 veya 4 kişi olabilir.',
    };
  }

  if (![0, 60, 90].includes(settings.turnTimeoutSeconds)) {
    return {
      ok: false,
      error: 'Tur süresi yalnızca Süresiz (0), 60 saniye veya 90 saniye olabilir.',
    };
  }

  const roomCode = (customRoomCode || generateRoomCode()).trim().toUpperCase();
  const roomId = generateUuid();
  const now = new Date().toISOString();

  const hostPlayer = createInitialPlayerState(hostSession.playerId, hostSession.nickname, 0);
  const resourceDeck = createResourceDeck();
  const buildingDeck = createBuildingDeck();
  const eventDeck = createEventDeck();
  const metropolisDeck = createMetropolisDeck(settings.metropolisFaceMode);

  const state: AuthoritativeGameState = {
    roomId,
    roomCode,
    status: 'waiting',
    settings: { ...settings },
    turnNumber: 1,
    activePlayerIndex: 0,
    turnPhase: 'production',
    turnStartedAt: now,
    hasTradedThisTurn: false,
    hasUsedHarborThisTurn: false,
    players: [hostPlayer],
    hands: {
      [hostPlayer.playerId]: [],
    },
    resourceDeck,
    resourceDiscard: [],
    buildingDeck,
    cardMarket: [],
    metropolisDeck,
    eventDeck,
    eventDiscard: [],
    pendingEvent: null,
    activeTrade: null,
    winnerPlayerId: null,
    logs: [
      {
        id: generateId('log'),
        timestamp: now,
        messageTr: `${hostPlayer.nickname} tarafından ${roomCode} kodlu oda kuruldu (${settings.maxPlayers} Kişilik).`,
        type: 'setup',
      },
    ],
  };

  saveRoomStateToStorage(state);
  if (isSupabaseConfigured()) {
    void persistRoomToSupabase(state).catch(() => {});
  }
  return { ok: true, state };
}

/**
 * Odaya Katılma veya Mevcut Oyuncunun Yeniden Bağlanması
 */
export function joinAuthoritativeRoom(
  state: AuthoritativeGameState,
  guest: { playerId: string; nickname: string }
): SyncActionResult {
  const nextState = structuredClone(state);
  const now = new Date().toISOString();

  // Eğer oyuncu zaten odadaysa reconnection olarak işle
  const existingPlayer = nextState.players.find((p) => p.playerId === guest.playerId);
  if (existingPlayer) {
    existingPlayer.isConnected = true;
    existingPlayer.lastSeenAt = now;
    if (guest.nickname.trim()) {
      existingPlayer.nickname = guest.nickname.trim();
    }
    nextState.logs.push({
      id: generateId('log'),
      timestamp: now,
      messageTr: `${existingPlayer.nickname} odaya yeniden bağlandı.`,
      type: 'setup',
    });
    saveRoomStateToStorage(nextState);
    if (isSupabaseConfigured()) {
      void upsertPlayerToSupabase(
        nextState.roomId,
        existingPlayer,
        nextState.hands[existingPlayer.playerId] || []
      ).catch(() => {});
    }
    return { ok: true, state: nextState };
  }

  if (nextState.status !== 'waiting') {
    return {
      ok: false,
      error: 'Oyun zaten başlamış. Yalnızca odadaki mevcut oyuncular yeniden bağlanabilir.',
    };
  }

  if (nextState.players.length >= nextState.settings.maxPlayers) {
    return {
      ok: false,
      error: `Oda dolu (${nextState.settings.maxPlayers}/${nextState.settings.maxPlayers} oyuncu).`,
    };
  }

  const seatIndex = nextState.players.length;
  const newPlayer = createInitialPlayerState(guest.playerId, guest.nickname, seatIndex);
  nextState.players.push(newPlayer);
  nextState.hands[newPlayer.playerId] = [];
  nextState.logs.push({
    id: generateId('log'),
    timestamp: now,
    messageTr: `${newPlayer.nickname} odaya katıldı (${nextState.players.length}/${nextState.settings.maxPlayers}).`,
    type: 'setup',
  });

  saveRoomStateToStorage(nextState);
  if (isSupabaseConfigured()) {
    void syncAuthoritativeStateToSupabase(nextState).catch(() => {});
  }
  return { ok: true, state: nextState };
}

/**
 * Oyuncu Bağlantı Kopması ve Yeniden Bağlanma (Reconnection)
 */
export function setPlayerConnectionState(
  state: AuthoritativeGameState,
  playerId: string,
  isConnected: boolean
): SyncActionResult {
  const nextState = structuredClone(state);
  const player = nextState.players.find((p) => p.playerId === playerId);
  if (!player) {
    return { ok: false, error: 'Oyuncu bu odada bulunamadı.' };
  }

  const now = new Date().toISOString();
  const changed = player.isConnected !== isConnected;
  player.isConnected = isConnected;
  player.lastSeenAt = now;

  if (changed) {
    nextState.logs.push({
      id: generateId('log'),
      timestamp: now,
      messageTr: isConnected
        ? `${player.nickname} tekrar çevrimiçi oldu.`
        : `${player.nickname} bağlantısı koptu (yeniden bağlanması bekleniyor).`,
      type: 'setup',
    });
  }

  saveRoomStateToStorage(nextState);
  return { ok: true, state: nextState };
}

/**
 * Bekleme Odasından Oyunu Başlatma (3 veya 4 oyuncu tamamlandığında veya en az 3 oyuncu varken)
 */
export function startAuthoritativeGame(
  state: AuthoritativeGameState,
  requesterPlayerId: string,
  rng?: () => number
): SyncActionResult {
  const nextState = structuredClone(state);
  if (nextState.status !== 'waiting') {
    return { ok: false, error: 'Oyun zaten başlatılmış.' };
  }

  if (nextState.players[0]?.playerId !== requesterPlayerId) {
    return { ok: false, error: 'Oyunu yalnızca oda kurucusu başlatabilir.' };
  }

  if (nextState.players.length < 3 || nextState.players.length > 4) {
    return {
      ok: false,
      error: 'Oyunun başlaması için odada 3 veya 4 oyuncu bulunmalıdır.',
    };
  }

  const now = new Date().toISOString();

  // Kart marketini (5 açık inşaat kartı) hazırla (5 Aynı Kart Kuralı refillCardMarket ile korunur)
  if (nextState.settings.useFirstGamePreset) {
    const marketSetup = setupInitialCardMarket(nextState.buildingDeck, true, rng);
    nextState.cardMarket = marketSetup.cardMarket;
    nextState.buildingDeck = marketSetup.buildingDeck;
  } else {
    const marketSetup = refillCardMarket([], nextState.buildingDeck, rng);
    nextState.cardMarket = marketSetup.cardMarket;
    nextState.buildingDeck = marketSetup.buildingDeck;
  }

  // Kural Kitapçığı: İlk Köy kartları karıştırılır (3 kişilik oyunda yazısız 1 İlk Köy çıkarılır).
  // İşaretli İlk Köy kartını alan oyuncu ilk oyuncu olur (rng verilirse rastgele karıştırır).
  const initialSettlementMarkers: boolean[] = [
    true,
    ...Array(nextState.players.length - 1).fill(false),
  ];
  const shuffledMarkers = rng
    ? shuffleArray(initialSettlementMarkers, rng)
    : initialSettlementMarkers;

  let firstPlayerIndex = 0;
  nextState.players.forEach((player, idx) => {
    const hasMarker = shuffledMarkers[idx];
    if (hasMarker) {
      firstPlayerIndex = idx;
    }
    if (player.villageSlots[0]) {
      player.villageSlots[0].hasFirstPlayerMarker = hasMarker;
    }
  });

  // Kural Kitapçığı: Her oyuncuya başlangıçta kapalı 2'şer Kaynak kartı dağıtılır!
  for (const player of nextState.players) {
    const drawRes = drawResourceCards(
      nextState.resourceDeck,
      nextState.resourceDiscard,
      2,
      rng
    );
    nextState.resourceDeck = drawRes.resourceDeck;
    nextState.resourceDiscard = drawRes.resourceDiscard;
    nextState.hands[player.playerId] = drawRes.drawn;
    player.handCount = drawRes.drawn.length;
  }

  nextState.status = 'playing';
  nextState.turnNumber = 1;
  nextState.activePlayerIndex = firstPlayerIndex;
  // Kural Kitapçığı: Her tur Aşama 1 (Kaynak Üretimi - 'production') ile başlar!
  nextState.turnPhase = 'production';
  nextState.turnStartedAt = now;
  nextState.hasTradedThisTurn = false;
  nextState.hasUsedHarborThisTurn = false;

  nextState.logs.push({
    id: generateId('log'),
    timestamp: now,
    messageTr: `Oyun başladı! Sıra ${nextState.players[firstPlayerIndex].nickname} oyuncusunda.`,
    type: 'turn',
  });

  saveRoomStateToStorage(nextState);
  return { ok: true, state: nextState };
}

/**
 * CANLI TİCARET (TAKAS) SİSTEMİ
 * 1. Sadece aktif oyuncu (activePlayerIndex) turunda 1 kez ticaret başlatabilir (initiateTrade).
 * 2. Diğer oyuncular aktif oyuncuya karşı teklif (submitCounterOffer) sunabilir; kendi aralarında ticaret yapamazlar!
 * 3. Takas oranı serbesttir (1:1 zorunluluğu yoktur).
 * 4. Aktif oyuncu teklifi kabul ettiğinde (acceptTradeOffer), kaynaklar el değiştirir ve
 *    aktif oyuncu ile ticaret yapan diğer oyuncuya ödül olarak desteden otomatik 1 kapalı Kaynak kartı çekilir!
 */
export function initiateTrade(
  state: AuthoritativeGameState,
  initiatorPlayerId: string,
  wantedResources: ResourceType[] = [],
  offeredResources: ResourceType[] = []
): SyncActionResult {
  const nextState = structuredClone(state);

  if (nextState.status !== 'playing') {
    return { ok: false, error: 'Ticaret yalnızca aktif oyun sırasında başlatılabilir.' };
  }

  const activePlayer = nextState.players[nextState.activePlayerIndex];
  if (!activePlayer || activePlayer.playerId !== initiatorPlayerId) {
    return {
      ok: false,
      error: 'Sadece sırası gelen aktif oyuncu ticaret başlatabilir! Diğer oyuncular kendi aralarında ticaret yapamaz.',
    };
  }

  if (nextState.hasTradedThisTurn) {
    return {
      ok: false,
      error: 'Bu turda zaten bir oyuncu takası gerçekleştirdiniz (Tur başına en fazla 1 kez).',
    };
  }

  const initiatorHand = nextState.hands[initiatorPlayerId] || [];
  if (offeredResources.length > 0 && !hasResourcesInHand(initiatorHand, offeredResources)) {
    return {
      ok: false,
      error: 'Teklif ettiğiniz kaynaklar elinizde yeterli sayıda bulunmuyor.',
    };
  }

  const now = new Date().toISOString();
  const tradeSession: ActiveTradeSession = {
    id: generateId('trade'),
    roomId: nextState.roomId,
    initiatorPlayerId,
    wantedResources: [...wantedResources],
    offeredResources: [...offeredResources],
    counterOffers: [],
    status: 'open',
  };

  nextState.activeTrade = tradeSession;
  nextState.logs.push({
    id: generateId('log'),
    timestamp: now,
    messageTr: `${activePlayer.nickname} ticaret teklifi başlattı.`,
    type: 'trade',
  });

  saveRoomStateToStorage(nextState);
  return { ok: true, state: nextState };
}

export function submitCounterOffer(
  state: AuthoritativeGameState,
  fromPlayerId: string,
  offeredResources: ResourceType[],
  requestedResources: ResourceType[],
  targetPlayerId?: string
): SyncActionResult {
  const nextState = structuredClone(state);

  if (nextState.status !== 'playing') {
    return { ok: false, error: 'Oyun aktif değil.' };
  }

  const activePlayer = nextState.players[nextState.activePlayerIndex];
  if (!activePlayer) {
    return { ok: false, error: 'Aktif oyuncu bulunamadı.' };
  }

  // Eğer targetPlayerId belirtilmişse ve aktif oyuncu değilse kesin olarak reddet!
  if (targetPlayerId && targetPlayerId !== activePlayer.playerId) {
    return {
      ok: false,
      error: 'Aktif olmayan oyuncular kendi aralarında ticaret yapamazlar! Yalnızca aktif oyuncuya teklif sunulabilir.',
    };
  }

  if (!nextState.activeTrade || !['open', 'offered'].includes(nextState.activeTrade.status)) {
    return {
      ok: false,
      error: 'Şu anda aktif oyuncunun başlattığı açık bir ticaret oturumu yok.',
    };
  }

  if (fromPlayerId === nextState.activeTrade.initiatorPlayerId || fromPlayerId === activePlayer.playerId) {
    return {
      ok: false,
      error: 'Aktif oyuncu kendisine karşı teklif gönderemez.',
    };
  }

  const offeringPlayer = nextState.players.find((p) => p.playerId === fromPlayerId);
  if (!offeringPlayer) {
    return { ok: false, error: 'Teklif veren oyuncu odada bulunamadı.' };
  }

  if (offeredResources.length === 0 || requestedResources.length === 0) {
    return {
      ok: false,
      error: 'Takas teklifinde en az 1 verilen ve en az 1 istenen kaynak seçilmelidir (Oran serbesttir, 1:1 zorunluluğu yoktur).',
    };
  }

  const senderHand = nextState.hands[fromPlayerId] || [];
  if (!hasResourcesInHand(senderHand, offeredResources)) {
    return {
      ok: false,
      error: 'Teklif ettiğiniz kaynaklar elinizde yeterli sayıda bulunmuyor.',
    };
  }

  const now = new Date().toISOString();
  const offer: TradeCounterOffer = {
    id: generateId('offer'),
    fromPlayerId,
    offeredResources: [...offeredResources],
    requestedResources: [...requestedResources],
    createdAt: now,
  };

  // Aynı oyuncunun önceki teklifi varsa güncelle veya yeni ekle
  const existingIdx = nextState.activeTrade.counterOffers.findIndex(
    (o) => o.fromPlayerId === fromPlayerId
  );
  if (existingIdx !== -1) {
    nextState.activeTrade.counterOffers[existingIdx] = offer;
  } else {
    nextState.activeTrade.counterOffers.push(offer);
  }
  nextState.activeTrade.status = 'offered';

  nextState.logs.push({
    id: generateId('log'),
    timestamp: now,
    messageTr: `${offeringPlayer.nickname}, aktif oyuncu ${activePlayer.nickname} için ticaret teklifi sundu (${offeredResources.length} verip ${requestedResources.length} istiyor).`,
    type: 'trade',
  });

  saveRoomStateToStorage(nextState);
  return { ok: true, state: nextState };
}

export function acceptTradeOffer(
  state: AuthoritativeGameState,
  activePlayerId: string,
  offerId: string
): SyncActionResult {
  const nextState = structuredClone(state);

  if (nextState.status !== 'playing') {
    return { ok: false, error: 'Oyun aktif değil.' };
  }

  const activePlayer = nextState.players[nextState.activePlayerIndex];
  if (!activePlayer || activePlayer.playerId !== activePlayerId) {
    return {
      ok: false,
      error: 'Yalnızca sırası gelen aktif oyuncu gelen ticaret teklifini onaylayabilir.',
    };
  }

  if (nextState.hasTradedThisTurn) {
    return {
      ok: false,
      error: 'Bu turda zaten ticaret yapıldı.',
    };
  }

  if (!nextState.activeTrade) {
    return { ok: false, error: 'Açık bir ticaret oturumu bulunamadı.' };
  }

  const offer = nextState.activeTrade.counterOffers.find((o) => o.id === offerId);
  if (!offer) {
    return { ok: false, error: 'Seçilen ticaret teklifi bulunamadı.' };
  }

  const partnerPlayer = nextState.players.find((p) => p.playerId === offer.fromPlayerId);
  if (!partnerPlayer) {
    return { ok: false, error: 'Teklif sahibi oyuncu bulunamadı.' };
  }

  const activeHand = nextState.hands[activePlayerId] || [];
  const partnerHand = nextState.hands[partnerPlayer.playerId] || [];

  if (!hasResourcesInHand(activeHand, offer.requestedResources)) {
    return {
      ok: false,
      error: 'Karşı teklifte istenen kaynaklar aktif oyuncunun elinde yeterli sayıda yok.',
    };
  }

  if (!hasResourcesInHand(partnerHand, offer.offeredResources)) {
    return {
      ok: false,
      error: 'Teklif sahibi oyuncunun elinde vaat ettiği kaynaklar kalmamış.',
    };
  }

  // 1. Kaynakların el değiştirmesi (Serbest oranlı takas)
  const updatedActiveHand = [
    ...removeResourcesFromHand(activeHand, offer.requestedResources),
    ...offer.offeredResources,
  ];
  const updatedPartnerHand = [
    ...removeResourcesFromHand(partnerHand, offer.offeredResources),
    ...offer.requestedResources,
  ];

  // 2. ÖDÜL KURALI: Aktif oyuncu ile ticaret yapan diğer oyuncuya desteden otomatik 1 kapalı Kaynak kartı çekilir!
  const bonusDraw = drawResourceCards(
    nextState.resourceDeck,
    nextState.resourceDiscard,
    1
  );
  nextState.resourceDeck = bonusDraw.resourceDeck;
  nextState.resourceDiscard = bonusDraw.resourceDiscard;
  const bonusCard = bonusDraw.drawn[0] ?? null;
  if (bonusCard) {
    updatedPartnerHand.push(bonusCard);
  }

  nextState.hands[activePlayerId] = updatedActiveHand;
  nextState.hands[partnerPlayer.playerId] = updatedPartnerHand;

  activePlayer.handCount = updatedActiveHand.length;
  partnerPlayer.handCount = updatedPartnerHand.length;

  nextState.hasTradedThisTurn = true;
  nextState.activeTrade = null;

  const now = new Date().toISOString();
  const bonusText = bonusCard
    ? ` Ticaret ödülü olarak ${partnerPlayer.nickname} desteden +1 kapalı Kaynak kartı çekti!`
    : '';
  nextState.logs.push({
    id: generateId('log'),
    timestamp: now,
    messageTr: `${activePlayer.nickname} ve ${partnerPlayer.nickname} arasında takas gerçekleşti (${offer.requestedResources.length} ↔ ${offer.offeredResources.length}).${bonusText}`,
    type: 'trade',
  });

  saveRoomStateToStorage(nextState);
  return { ok: true, state: nextState, bonusCardDrawn: bonusCard };
}

export function rejectTradeOffer(
  state: AuthoritativeGameState,
  activePlayerId: string,
  offerId: string
): SyncActionResult {
  const nextState = structuredClone(state);
  const activePlayer = nextState.players[nextState.activePlayerIndex];

  if (!activePlayer || activePlayer.playerId !== activePlayerId) {
    return { ok: false, error: 'Yalnızca aktif oyuncu teklifleri reddedebilir.' };
  }

  if (!nextState.activeTrade) {
    return { ok: false, error: 'Açık ticaret oturumu yok.' };
  }

  nextState.activeTrade.counterOffers = nextState.activeTrade.counterOffers.filter(
    (o) => o.id !== offerId
  );
  if (nextState.activeTrade.counterOffers.length === 0) {
    nextState.activeTrade.status = 'open';
  }

  saveRoomStateToStorage(nextState);
  return { ok: true, state: nextState };
}

export function cancelTrade(
  state: AuthoritativeGameState,
  activePlayerId: string
): SyncActionResult {
  const nextState = structuredClone(state);
  const activePlayer = nextState.players[nextState.activePlayerIndex];

  if (!activePlayer || activePlayer.playerId !== activePlayerId) {
    return { ok: false, error: 'Yalnızca aktif oyuncu ticareti iptal edebilir.' };
  }

  nextState.activeTrade = null;
  saveRoomStateToStorage(nextState);
  return { ok: true, state: nextState };
}

/**
 * TUR SÜRESİ SAYACI (Süresiz: 0, 60sn, 90sn) KONTROLÜ VE OTOMATİK TUR GEÇİŞİ
 */
export function getRemainingTurnSeconds(
  state: Pick<AuthoritativeGameState, 'settings' | 'turnStartedAt' | 'status'>,
  nowMs: number = Date.now()
): number | null {
  if (state.status !== 'playing' || state.settings.turnTimeoutSeconds === 0) {
    return null; // Süresiz
  }
  const startedMs = new Date(state.turnStartedAt).getTime();
  const elapsedSeconds = Math.floor((nowMs - startedMs) / 1000);
  return Math.max(0, state.settings.turnTimeoutSeconds - elapsedSeconds);
}

export function checkAndHandleTurnTimeout(
  state: AuthoritativeGameState,
  nowMs: number = Date.now()
): SyncActionResult {
  if (state.status !== 'playing' || state.settings.turnTimeoutSeconds === 0) {
    return { ok: true, state };
  }

  const remaining = getRemainingTurnSeconds(state, nowMs);
  if (remaining !== null && remaining > 0) {
    return { ok: true, state };
  }

  // Süre doldu -> aktif ticareti kapat ve sıradaki oyuncuya geç
  const nextState = structuredClone(state);
  const previousPlayer = nextState.players[nextState.activePlayerIndex];
  const nextIndex = (nextState.activePlayerIndex + 1) % nextState.players.length;
  const nextPlayer = nextState.players[nextIndex];
  const nowIso = new Date(nowMs).toISOString();

  nextState.activeTrade = null;
  nextState.activePlayerIndex = nextIndex;
  nextState.turnNumber += 1;
  // Kural Kitapçığı: Yeni tur her zaman Aşama 1 (Kaynak Üretimi - 'production') ile başlar!
  nextState.turnPhase = 'production';
  nextState.turnStartedAt = nowIso;
  nextState.hasTradedThisTurn = false;
  nextState.hasUsedHarborThisTurn = false;

  nextState.logs.push({
    id: generateId('log'),
    timestamp: nowIso,
    messageTr: `${previousPlayer?.nickname || 'Aktif oyuncu'} tur süresini (${nextState.settings.turnTimeoutSeconds}sn) doldurduğu için sıra otomatik olarak ${nextPlayer?.nickname || 'diğer oyuncuya'} geçti.`,
    type: 'turn',
  });

  saveRoomStateToStorage(nextState);
  return { ok: true, state: nextState };
}

/**
 * HİBRİT REALTIME SENKRONİZASYON ADAPTÖRÜ (Supabase Realtime + BroadcastChannel + LocalStorage)
 */
export type StateUpdateListener = (
  authoritativeState: AuthoritativeGameState,
  clientView: ClientGameView
) => void;

export class MultiplayerSyncManager {
  private roomCode: string;
  private viewerPlayerId: string;
  private listeners = new Set<StateUpdateListener>();
  private broadcastChannel: BroadcastChannel | null = null;
  private supabase: SupabaseClient<Database> | null = null;
  private realtimeChannel: RealtimeChannel | null = null;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private storageListener: ((e: StorageEvent) => void) | null = null;

  constructor(
    roomCode: string,
    viewerPlayerId: string,
    customSupabaseClient?: SupabaseClient<Database>
  ) {
    this.roomCode = roomCode.trim().toUpperCase();
    this.viewerPlayerId = viewerPlayerId;
    if (customSupabaseClient) {
      this.supabase = customSupabaseClient;
    }
  }

  public connect(): void {
    // 1. Tarayıcı çoklu sekme BroadcastChannel bağlantısı
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.broadcastChannel = new BroadcastChannel(`catan_sync_${this.roomCode}`);
        this.broadcastChannel.onmessage = (event) => {
          if (event.data && event.data.type === 'STATE_SYNC' && event.data.state) {
            const incoming = event.data.state as AuthoritativeGameState;
            saveRoomStateToStorage(incoming);
            this.notifyListeners(incoming);
          }
        };
      } catch {
        // Ignore BroadcastChannel errors in restricted environments
      }
    }

    // 2. Tarayıcı StorageEvent dinleyicisi (farklı sekmeler arası yedek senkronizasyon)
    if (typeof window !== 'undefined') {
      this.storageListener = (e: StorageEvent) => {
        if (e.key === `${ROOM_STORAGE_PREFIX}${this.roomCode}` && e.newValue) {
          try {
            const parsed = JSON.parse(e.newValue) as AuthoritativeGameState;
            memoryRoomStore.set(this.roomCode, parsed);
            this.notifyListeners(parsed);
          } catch {
            // Ignore
          }
        }
      };
      window.addEventListener('storage', this.storageListener);
    }

    // 3. Supabase PostgreSQL + Realtime bağlantısı (aktifse veya özel client enjekte edildiyse)
    if (this.supabase || isSupabaseConfigured()) {
      try {
        if (!this.supabase) {
          this.supabase = createPlayerSupabaseClient(this.viewerPlayerId);
        }
        const currentRoomId = this.getState()?.roomId || this.roomCode;

        this.realtimeChannel = subscribeToSupabaseRoomRealtime({
          roomId: currentRoomId,
          roomCode: this.roomCode,
          viewerPlayerId: this.viewerPlayerId,
          client: this.supabase,
          onBroadcastState: (incoming) => {
            saveRoomStateToStorage(incoming);
            this.notifyListeners(incoming);
          },
          onPostgresChange: () => {
            void this.fetchFromDatabase();
          },
          onPresenceSync: (onlinePlayerIds) => {
            const current = this.getState();
            if (!current) return;
            let anyChanged = false;
            const nextState = structuredClone(current);
            for (const p of nextState.players) {
              const isOnline = onlinePlayerIds.includes(p.playerId);
              if (p.isConnected !== isOnline) {
                p.isConnected = isOnline;
                p.lastSeenAt = new Date().toISOString();
                anyChanged = true;
              }
            }
            if (anyChanged) {
              saveRoomStateToStorage(nextState);
              this.notifyListeners(nextState);
            }
          },
        });

        // Başlangıçta yerel depoda oda yoksa Supabase'den çek
        if (!this.getState()) {
          void this.fetchFromDatabase();
        }
      } catch {
        // Fallback to local sync silently
      }
    }

    // 4. Tur süresi (Timeout) kontrol döngüsü
    this.timerInterval = setInterval(() => {
      const current = this.getState();
      if (current && current.status === 'playing' && current.settings.turnTimeoutSeconds > 0) {
        const remaining = getRemainingTurnSeconds(current);
        if (remaining !== null && remaining <= 0) {
          const res = checkAndHandleTurnTimeout(current);
          if (res.ok && res.state) {
            this.broadcastState(res.state);
          }
        }
      }
    }, 1000);
  }

  public disconnect(): void {
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }
    if (typeof window !== 'undefined' && this.storageListener) {
      window.removeEventListener('storage', this.storageListener);
      this.storageListener = null;
    }
    if (this.realtimeChannel && this.supabase) {
      this.supabase.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.listeners.clear();
  }

  public subscribe(listener: StateUpdateListener): () => void {
    this.listeners.add(listener);
    const current = this.getState();
    if (current) {
      listener(current, toClientGameView(current, this.viewerPlayerId));
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  public setViewerPlayerId(playerId: string): void {
    this.viewerPlayerId = playerId;
    const current = this.getState();
    if (current) {
      this.notifyListeners(current);
    }
  }

  public getViewerPlayerId(): string {
    return this.viewerPlayerId;
  }

  public getState(): AuthoritativeGameState | null {
    return loadRoomStateFromStorage(this.roomCode);
  }

  public getClientView(): ClientGameView | null {
    const state = this.getState();
    if (!state) return null;
    return toClientGameView(state, this.viewerPlayerId);
  }

  /**
   * Mevcut veya verilen AuthoritativeGameState durumunu Supabase PostgreSQL
   * (`rooms`, `room_players`, `player_hands`, `decks`, `card_market`, `trades`) tablolarına yazar.
   */
  public async syncToDatabase(
    stateOverride?: AuthoritativeGameState
  ): Promise<SupabaseSyncResult> {
    const target = stateOverride || this.getState();
    if (!target) {
      return { ok: false, error: 'Senkronize edilecek oda durumu bulunamadı.' };
    }
    return syncAuthoritativeStateToSupabase(target, this.supabase ?? undefined);
  }

  /**
   * Supabase PostgreSQL tablolarından tam oda durumunu çeker ve yerel önbelleği günceller.
   */
  public async fetchFromDatabase(): Promise<AuthoritativeGameState | null> {
    const remoteState = await fetchAuthoritativeRoomFromSupabase(
      this.roomCode,
      this.supabase ?? undefined
    );
    if (remoteState) {
      saveRoomStateToStorage(remoteState);
      this.notifyListeners(remoteState);
    }
    return remoteState;
  }

  /**
   * Supabase `get_masked_client_game_view` RPC fonksiyonunu çağırarak
   * hile korumalı (RLS uyumlu) istemci görünümünü çeker.
   */
  public async fetchMaskedClientViewFromRpc(
    roomIdOverride?: string
  ): Promise<ClientGameView | null> {
    const roomId = roomIdOverride || this.getState()?.roomId;
    if (!roomId) {
      return null;
    }
    return fetchMaskedClientGameViewFromSupabase(
      roomId,
      this.viewerPlayerId,
      this.supabase ?? undefined
    );
  }

  public broadcastState(nextState: AuthoritativeGameState): void {
    saveRoomStateToStorage(nextState);
    this.notifyListeners(nextState);

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: 'STATE_SYNC',
          state: nextState,
        });
      } catch {
        // Ignore closed channel errors
      }
    }

    if (this.realtimeChannel) {
      this.realtimeChannel
        .send({
          type: 'broadcast',
          event: 'STATE_SYNC',
          payload: { state: nextState },
        })
        .catch(() => {});
    }

    if (this.supabase || isSupabaseConfigured()) {
      void this.syncToDatabase(nextState).catch(() => {});
    }
  }

  private notifyListeners(state: AuthoritativeGameState): void {
    const view = toClientGameView(state, this.viewerPlayerId);
    this.listeners.forEach((listener) => listener(state, view));
  }

  // Yardımcı aksiyon metodları
  public reconnectPlayer(playerId = this.viewerPlayerId): SyncActionResult {
    const state = this.getState();
    if (!state) {
      return { ok: false, error: 'Oda bulunamadı.' };
    }
    const res = setPlayerConnectionState(state, playerId, true);
    if (res.ok && res.state) {
      this.broadcastState(res.state);
    }
    return res;
  }

  public disconnectPlayer(playerId = this.viewerPlayerId): SyncActionResult {
    const state = this.getState();
    if (!state) {
      return { ok: false, error: 'Oda bulunamadı.' };
    }
    const res = setPlayerConnectionState(state, playerId, false);
    if (res.ok && res.state) {
      this.broadcastState(res.state);
    }
    return res;
  }

  public initiateTrade(
    wantedResources: ResourceType[] = [],
    offeredResources: ResourceType[] = [],
    actorPlayerId = this.viewerPlayerId
  ): SyncActionResult {
    const state = this.getState();
    if (!state) return { ok: false, error: 'Oda bulunamadı.' };
    const res = initiateTrade(state, actorPlayerId, wantedResources, offeredResources);
    if (res.ok && res.state) {
      this.broadcastState(res.state);
    }
    return res;
  }

  public submitCounterOffer(
    offeredResources: ResourceType[],
    requestedResources: ResourceType[],
    actorPlayerId = this.viewerPlayerId,
    targetPlayerId?: string
  ): SyncActionResult {
    const state = this.getState();
    if (!state) return { ok: false, error: 'Oda bulunamadı.' };
    const res = submitCounterOffer(
      state,
      actorPlayerId,
      offeredResources,
      requestedResources,
      targetPlayerId
    );
    if (res.ok && res.state) {
      this.broadcastState(res.state);
    }
    return res;
  }

  public acceptTradeOffer(
    offerId: string,
    actorPlayerId = this.viewerPlayerId
  ): SyncActionResult {
    const state = this.getState();
    if (!state) return { ok: false, error: 'Oda bulunamadı.' };
    const res = acceptTradeOffer(state, actorPlayerId, offerId);
    if (res.ok && res.state) {
      this.broadcastState(res.state);
    }
    return res;
  }

  public rejectTradeOffer(
    offerId: string,
    actorPlayerId = this.viewerPlayerId
  ): SyncActionResult {
    const state = this.getState();
    if (!state) return { ok: false, error: 'Oda bulunamadı.' };
    const res = rejectTradeOffer(state, actorPlayerId, offerId);
    if (res.ok && res.state) {
      this.broadcastState(res.state);
    }
    return res;
  }

  public cancelTrade(actorPlayerId = this.viewerPlayerId): SyncActionResult {
    const state = this.getState();
    if (!state) return { ok: false, error: 'Oda bulunamadı.' };
    const res = cancelTrade(state, actorPlayerId);
    if (res.ok && res.state) {
      this.broadcastState(res.state);
    }
    return res;
  }
}
