/**
 * CATAN KART OYUNU (120 Kartlık Kutu Oyunu) - Ortak Veri Sözleşmeleri (Shared Contracts)
 * Argon4 Orkestrasyonu tarafından tüm alt ajanların (DB, GameEngine, UI/UX, Multiplayer, QA)
 * senkronize çalışması için tanımlanmıştır.
 */

// 1. KAYNAK KARTLARI (Toplam 61 Adet)
export type ResourceType = 'brick' | 'wood' | 'wool' | 'wheat' | 'ore';

export const INITIAL_RESOURCE_COUNTS: Record<ResourceType, number> = {
  brick: 11, // Tuğla
  wood: 11,  // Odun
  wool: 14,  // Yün
  wheat: 12, // Buğday
  ore: 13,   // Demir
};

export const RESOURCE_LABELS_TR: Record<ResourceType, string> = {
  brick: 'Tuğla',
  wood: 'Odun',
  wool: 'Yün',
  wheat: 'Buğday',
  ore: 'Demir',
};

// 2. İNŞAAT KARTLARI (Toplam 34 Adet) ve BÜYÜKŞEHİR (4 Adet)
export type BuildingCardType = 'road' | 'settlement' | 'city' | 'knight';
export type StructureType = BuildingCardType | 'metropolis';

export const INITIAL_BUILDING_DECK_COUNTS: Record<BuildingCardType, number> = {
  road: 10,       // Yol
  settlement: 11, // Köy
  city: 5,        // Şehir
  knight: 8,      // Şövalye
};

export const BUILDING_COSTS: Record<StructureType, Partial<Record<ResourceType, number>>> = {
  road: { brick: 1, wood: 1 },
  settlement: { brick: 1, wood: 1, wool: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
  metropolis: { wool: 3, ore: 1 },
  knight: { wool: 1, wheat: 1, ore: 1 },
};

// 3. BÜYÜKŞEHİR MODU (A Yüzü / B Yüzü Plug-and-Play Mimarisi)
export type MetropolisFaceMode = 'A' | 'B';
export type MetropolisBId = 'metropolis_b_1' | 'metropolis_b_2' | 'metropolis_b_3' | 'metropolis_b_4';

export interface MetropolisCard {
  id: string;
  face: MetropolisFaceMode;
  bVariantId?: MetropolisBId;
  titleTr: string;
  descriptionTr: string;
  productionBonus: number; // A yüzü: +2, B yüzü: +1 + özel yetenek
}

// 4. OLAY KARTLARI (Toplam 7 Adet)
export type EventCardType =
  | 'robber'              // Hırsız (3 adet)
  | 'charity'             // Sadaka (1 adet)
  | 'harvest_festival'    // Hasat Kutlamaları (1 adet)
  | 'incentive'           // Teşvik (1 adet)
  | 'new_year';           // Yeni Yıl (1 adet)

export const INITIAL_EVENT_DECK_COUNTS: Record<EventCardType, number> = {
  robber: 3,
  charity: 1,
  harvest_festival: 1,
  incentive: 1,
  new_year: 1,
};

// 5. OYUNCU YAPILARI VE DURUMU
export interface VillageSlot {
  id: string;
  isInitialSettlement: boolean;
  hasFirstPlayerMarker?: boolean;
  upgradedTo: 'none' | 'city' | 'metropolis';
  metropolisCard?: MetropolisCard;
}

export interface PublicPlayerState {
  playerId: string;
  nickname: string;
  seatIndex: number; // 0..2 veya 0..3 (Saat yönü sırası)
  isConnected: boolean;
  lastSeenAt: string;
  handCount: number; // RLS: Rakipler sadece eldeki toplam kaynak kartı sayısını görebilir!
  roadsCount: number; // İlk Yol dahil toplam Yol sayısı (Örn: Başlangıçta 1)
  knightsCount: number; // Şövalye sayısı (Başlangıçta 0)
  villageSlots: VillageSlot[]; // Yan yana dizilen Köyler (üzerine Şehir/Büyükşehir kapatılabilir)
  hasLongestRoad: boolean; // En Uzun Yol (2 ZP) - İlk 3 Yola (İlk Yol dahil) ulaşan alır
  hasLargestArmy: boolean; // En Güçlü Ordu (2 ZP) - İlk 2 Şövalyeye ulaşan alır
  victoryPoints: number; // Hesaplanan toplam Zafer Puanı
}

export interface PrivatePlayerHand {
  playerId: string;
  resources: ResourceType[]; // Sadece oyuncunun kendisi ve sunucu görebilir
}

// 6. OLAY BEKLEME DURUMLARI (İnteraktif Olay Çözümlemeleri: Hırsız & Sadaka)
export interface PendingRobberDiscard {
  playerId: string;
  requiredDiscardCount: number; // floor(handCount / 2)
  completed: boolean;
}

export interface PendingCharityGive {
  fromPlayerId: string; // En yüksek ZP'ye sahip oyuncu(lar)
  eligibleTargetPlayerIds: string[]; // Kendisinden daha az ZP'si olan oyuncular
  completed: boolean;
}

export interface PendingEventResolution {
  eventType: EventCardType;
  triggeredByPlayerId: string;
  pendingRobberDiscards?: PendingRobberDiscard[];
  pendingCharityGives?: PendingCharityGive[];
   pendingMarketRefillAfterEvent: boolean; // Köy alındığında market olay çözümlendikten SONRA 5'e tamamlanır!
  summaryLogTr: string;
}

// 7. TİCARET (TAKAS) SİSTEMİ
export type TradeStatus = 'open' | 'offered' | 'accepted' | 'cancelled' | 'rejected';

export interface TradeCounterOffer {
  id: string;
  fromPlayerId: string; // Teklif veren (aktif olmayan) oyuncu
  offeredResources: ResourceType[]; // Aktif oyuncuya vereceği kaynaklar
  requestedResources: ResourceType[]; // Aktif oyuncudan istediği kaynaklar
  createdAt: string;
}

export interface ActiveTradeSession {
  id: string;
  roomId: string;
  initiatorPlayerId: string; // Sadece aktif oyuncu başlatabilir
  wantedResources?: ResourceType[]; // Opsiyonel: Aktif oyuncunun aradığı kaynaklar
  offeredResources?: ResourceType[]; // Opsiyonel: Aktif oyuncunun teklif ettiği kaynaklar
  counterOffers: TradeCounterOffer[];
  status: TradeStatus;
}

// 8. ODA AYARLARI VE OYUN DURUMU
export type TurnTimeoutOption = 0 | 60 | 90; // 0 = Süresiz, 60sn, 90sn
export type RoomStatus = 'waiting' | 'playing' | 'finished';
export type TurnPhase = 'production' | 'action' | 'resolving_event' | 'game_over';

export interface RoomSettings {
  maxPlayers: 3 | 4;
  useFirstGamePreset: boolean; // İlk oyun dizilimi: 2 Köy, 1 Şövalye, 1 Yol, 1 Şehir
  metropolisFaceMode: MetropolisFaceMode; // A yüzü (aktif) veya B yüzü (plug-and-play)
  turnTimeoutSeconds: TurnTimeoutOption;
}

export interface GameLogEntry {
  id: string;
  timestamp: string;
  messageTr: string;
  type: 'setup' | 'production' | 'trade' | 'harbor' | 'build' | 'event' | 'turn' | 'victory';
}

// Sunucu tarafındaki tam oyun durumu (Full Authoritative State)
export interface AuthoritativeGameState {
  roomId: string;
  roomCode: string;
  status: RoomStatus;
  settings: RoomSettings;
  turnNumber: number;
  activePlayerIndex: number;
  turnPhase: TurnPhase;
  turnStartedAt: string;
  hasTradedThisTurn: boolean; // Aktif oyuncu turda max 1 kez oyuncu takası yapabilir
  hasUsedHarborThisTurn: boolean; // Aktif oyuncu turda max 1 kez Yol (Liman etkisi) kullanabilir
  players: PublicPlayerState[];
  hands: Record<string, ResourceType[]>; // Sunucu/RLS korumalı oyuncu elleri
  resourceDeck: ResourceType[];
  resourceDiscard: ResourceType[];
  buildingDeck: BuildingCardType[];
  cardMarket: BuildingCardType[]; // 5 açık inşaat kartı
  metropolisDeck: MetropolisCard[]; // 4 Büyükşehir kartı
  eventDeck: EventCardType[];
  eventDiscard: EventCardType[];
  pendingEvent?: PendingEventResolution | null;
  activeTrade?: ActiveTradeSession | null;
  winnerPlayerId?: string | null;
  logs: GameLogEntry[];
}

// İstemciye (Client) gönderilen maskelenmiş/güvenli oyun görünümü (Hile Korumalı)
export interface ClientGameView {
  roomId: string;
  roomCode: string;
  status: RoomStatus;
  settings: RoomSettings;
  turnNumber: number;
  activePlayerIndex: number;
  turnPhase: TurnPhase;
  turnStartedAt: string;
  hasTradedThisTurn: boolean;
  hasUsedHarborThisTurn: boolean;
  players: PublicPlayerState[];
  myPlayerId: string;
  myHand: ResourceType[]; // Sadece kendi elindeki kartların türleri!
  resourceDeckCount: number;
  resourceDiscardCount: number;
  buildingDeckCount: number;
  cardMarket: BuildingCardType[]; // 5 açık inşaat kartı
  metropolisDeckCount: number;
  topMetropolisCard?: MetropolisCard | null;
  eventDeckCount: number;
  eventDiscardCount: number;
  pendingEvent?: PendingEventResolution | null;
  activeTrade?: ActiveTradeSession | null;
  winnerPlayerId?: string | null;
  logs: GameLogEntry[];
}
