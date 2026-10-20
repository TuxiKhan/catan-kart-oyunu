import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import {
  ActiveTradeSession,
  AuthoritativeGameState,
  BuildingCardType,
  ClientGameView,
  EventCardType,
  GameLogEntry,
  INITIAL_BUILDING_DECK_COUNTS,
  INITIAL_EVENT_DECK_COUNTS,
  INITIAL_RESOURCE_COUNTS,
  MetropolisCard,
  MetropolisFaceMode,
  PublicPlayerState,
  ResourceType,
  RoomSettings,
  TradeCounterOffer,
} from '@/types/game';
import { refillCardMarket, setupInitialCardMarket } from '@/lib/engine/deck';

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

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function buildInitialResourceDeck(): ResourceType[] {
  const deck: ResourceType[] = [];
  (Object.keys(INITIAL_RESOURCE_COUNTS) as ResourceType[]).forEach((res) => {
    const count = INITIAL_RESOURCE_COUNTS[res];
    for (let i = 0; i < count; i++) {
      deck.push(res);
    }
  });
  return shuffleArray(deck);
}

export function buildInitialBuildingDeck(): BuildingCardType[] {
  const deck: BuildingCardType[] = [];
  (Object.keys(INITIAL_BUILDING_DECK_COUNTS) as BuildingCardType[]).forEach((card) => {
    const count = INITIAL_BUILDING_DECK_COUNTS[card];
    for (let i = 0; i < count; i++) {
      deck.push(card);
    }
  });
  return shuffleArray(deck);
}

export function buildInitialEventDeck(): EventCardType[] {
  const deck: EventCardType[] = [];
  (Object.keys(INITIAL_EVENT_DECK_COUNTS) as EventCardType[]).forEach((ev) => {
    const count = INITIAL_EVENT_DECK_COUNTS[ev];
    for (let i = 0; i < count; i++) {
      deck.push(ev);
    }
  });
  return shuffleArray(deck);
}

export function buildInitialMetropolisDeck(faceMode: MetropolisFaceMode): MetropolisCard[] {
  const bVariants = [
    {
      bVariantId: 'metropolis_b_1' as const,
      titleTr: 'Ticaret Metropolü (B Yüzü)',
      descriptionTr: 'Üretimde +1 kaynak verir. Oyuncu takasında ekstra avantaj sağlar.',
    },
    {
      bVariantId: 'metropolis_b_2' as const,
      titleTr: 'Liman Metropolü (B Yüzü)',
      descriptionTr: 'Üretimde +1 kaynak verir. Liman takasında esneklik sağlar.',
    },
    {
      bVariantId: 'metropolis_b_3' as const,
      titleTr: 'Kale Metropolü (B Yüzü)',
      descriptionTr: 'Üretimde +1 kaynak verir. Hırsız olayına karşı koruma sağlar.',
    },
    {
      bVariantId: 'metropolis_b_4' as const,
      titleTr: 'Bilim Metropolü (B Yüzü)',
      descriptionTr: 'Üretimde +1 kaynak verir. İnşaatta indirim olanağı sunar.',
    },
  ];

  return bVariants.map((variant, idx) => ({
    id: `metropolis_${idx + 1}`,
    face: faceMode,
    bVariantId: faceMode === 'B' ? variant.bVariantId : undefined,
    titleTr: faceMode === 'A' ? 'Büyükşehir (A Yüzü)' : variant.titleTr,
    descriptionTr:
      faceMode === 'A'
        ? 'Bu Büyükşehir üretim aşamasında +2 Kaynak kartı üretir.'
        : variant.descriptionTr,
    productionBonus: faceMode === 'A' ? 2 : 1,
  }));
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
 * İstemciye (Client) gönderilen maskelenmiş/güvenli oyun görünümü (RLS / Hile Korumalı)
 */
export function toClientGameView(
  state: AuthoritativeGameState,
  viewerPlayerId: string
): ClientGameView {
  const myHand = [...(state.hands[viewerPlayerId] || [])];
  const players = state.players.map((p) => ({
    ...p,
    handCount: (state.hands[p.playerId] || []).length,
  }));

  return {
    roomId: state.roomId,
    roomCode: state.roomCode,
    status: state.status,
    settings: { ...state.settings },
    turnNumber: state.turnNumber,
    activePlayerIndex: state.activePlayerIndex,
    turnPhase: state.turnPhase,
    turnStartedAt: state.turnStartedAt,
    hasTradedThisTurn: state.hasTradedThisTurn,
    hasUsedHarborThisTurn: state.hasUsedHarborThisTurn,
    players,
    myPlayerId: viewerPlayerId,
    myHand,
    resourceDeckCount: state.resourceDeck.length,
    resourceDiscardCount: state.resourceDiscard.length,
    buildingDeckCount: state.buildingDeck.length,
    cardMarket: [...state.cardMarket],
    metropolisDeckCount: state.metropolisDeck.length,
    topMetropolisCard: state.metropolisDeck[0] || null,
    eventDeckCount: state.eventDeck.length,
    eventDiscardCount: state.eventDiscard.length,
    pendingEvent: state.pendingEvent ? structuredClone(state.pendingEvent) : null,
    activeTrade: state.activeTrade ? structuredClone(state.activeTrade) : null,
    winnerPlayerId: state.winnerPlayerId ?? null,
    logs: [...state.logs],
  };
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
  const roomId = generateId('room');
  const now = new Date().toISOString();

  const hostPlayer = createInitialPlayerState(hostSession.playerId, hostSession.nickname, 0);
  const resourceDeck = buildInitialResourceDeck();
  const buildingDeck = buildInitialBuildingDeck();
  const eventDeck = buildInitialEventDeck();
  const metropolisDeck = buildInitialMetropolisDeck(settings.metropolisFaceMode);

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
    ? (() => {
        const copy = [...initialSettlementMarkers];
        for (let i = copy.length - 1; i > 0; i--) {
          const j = Math.floor(rng() * (i + 1));
          [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
      })()
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
    const initialCards: ResourceType[] = [];
    for (let i = 0; i < 2; i++) {
      const drawn = drawOneResourceCardInternal(nextState);
      if (drawn) {
        initialCards.push(drawn);
      }
    }
    nextState.hands[player.playerId] = initialCards;
    player.handCount = initialCards.length;
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
 * Desteden 1 Kapalı Kaynak Kartı Çekme Yardımcı Fonksiyonu
 */
function drawOneResourceCardInternal(state: AuthoritativeGameState): ResourceType | null {
  if (state.resourceDeck.length === 0 && state.resourceDiscard.length > 0) {
    state.resourceDeck = shuffleArray(state.resourceDiscard);
    state.resourceDiscard = [];
  }
  if (state.resourceDeck.length === 0) {
    return null;
  }
  return state.resourceDeck.shift() || null;
}

/**
 * Bir oyuncunun elinde belirtilen kaynakların yeterli sayıda olup olmadığını kontrol eder
 */
export function hasSufficientResources(
  hand: ResourceType[],
  required: ResourceType[]
): boolean {
  const counts: Record<ResourceType, number> = {
    brick: 0,
    wood: 0,
    wool: 0,
    wheat: 0,
    ore: 0,
  };
  for (const r of hand) {
    counts[r] = (counts[r] || 0) + 1;
  }
  for (const req of required) {
    if (!counts[req] || counts[req] <= 0) {
      return false;
    }
    counts[req] -= 1;
  }
  return true;
}

/**
 * Oyuncunun elinden kaynakları düşer ve yeni kaynakları ekler
 */
function removeResourcesFromHand(hand: ResourceType[], toRemove: ResourceType[]): ResourceType[] {
  const nextHand = [...hand];
  for (const res of toRemove) {
    const idx = nextHand.indexOf(res);
    if (idx !== -1) {
      nextHand.splice(idx, 1);
    }
  }
  return nextHand;
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
  if (offeredResources.length > 0 && !hasSufficientResources(initiatorHand, offeredResources)) {
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
  if (!hasSufficientResources(senderHand, offeredResources)) {
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

  if (!hasSufficientResources(activeHand, offer.requestedResources)) {
    return {
      ok: false,
      error: 'Karşı teklifte istenen kaynaklar aktif oyuncunun elinde yeterli sayıda yok.',
    };
  }

  if (!hasSufficientResources(partnerHand, offer.offeredResources)) {
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
  const bonusCard = drawOneResourceCardInternal(nextState);
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
  private supabase: SupabaseClient | null = null;
  private realtimeChannel: RealtimeChannel | null = null;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private storageListener: ((e: StorageEvent) => void) | null = null;

  constructor(roomCode: string, viewerPlayerId: string) {
    this.roomCode = roomCode.trim().toUpperCase();
    this.viewerPlayerId = viewerPlayerId;
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

    // 3. Supabase Realtime bağlantısı (.env.local içinde tanımlıysa)
    const supabaseUrl =
      typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_SUPABASE_URL : undefined;
    const supabaseAnonKey =
      typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY : undefined;

    if (supabaseUrl && supabaseAnonKey) {
      try {
        this.supabase = createClient(supabaseUrl, supabaseAnonKey);
        this.realtimeChannel = this.supabase
          .channel(`room:${this.roomCode}`, {
            config: { broadcast: { self: false }, presence: { key: this.viewerPlayerId } },
          })
          .on('broadcast', { event: 'STATE_SYNC' }, (payload) => {
            if (payload.payload?.state) {
              const incoming = payload.payload.state as AuthoritativeGameState;
              saveRoomStateToStorage(incoming);
              this.notifyListeners(incoming);
            }
          })
          .subscribe(async (status) => {
            if (status === 'SUBSCRIBED' && this.realtimeChannel) {
              await this.realtimeChannel.track({
                playerId: this.viewerPlayerId,
                onlineAt: new Date().toISOString(),
              });
            }
          });
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
