import {
  AuthoritativeGameState,
  BUILDING_COSTS,
  BuildingCardType,
  ClientGameView,
  EventCardType,
  GameLogEntry,
  PendingCharityGive,
  PendingRobberDiscard,
  PublicPlayerState,
  RESOURCE_LABELS_TR,
  ResourceType,
  RoomSettings,
  StructureType,
  VillageSlot,
} from '../../types/game';
import {
  createBuildingDeck,
  createEventDeck,
  createResourceDeck,
  drawResourceCards,
  drawSpecificResourceFromSupply,
  refillCardMarket,
  setupInitialCardMarket,
  shuffleArray,
} from './deck';
import {
  createMetropolisDeck,
  triggerMetropolisBProductionHook,
} from './metropolisRegistry';

export interface CreateInitialGameParams {
  roomId: string;
  roomCode: string;
  players: Array<{ playerId: string; nickname: string }>;
  settings: RoomSettings;
}

export interface PlayerTradeParams {
  activePlayerId: string;
  partnerPlayerId: string;
  giveToPartner: ResourceType[];
  receiveFromPartner: ResourceType[];
}

function createLog(
  type: GameLogEntry['type'],
  messageTr: string
): GameLogEntry {
  return {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    type,
    messageTr,
  };
}

/**
 * Oyuncunun mevcut yapılarına ve özel puan kartlarına göre Zafer Puanını (ZP) hesaplar.
 * - Görünür Köy (upgradedTo === 'none'): 1 ZP
 * - Şehir (upgradedTo === 'city'): 2 ZP (Köy +1, Şehir +1)
 * - Büyükşehir (upgradedTo === 'metropolis'): 3 ZP (Köy +1, Şehir +1, Büyükşehir +1)
 * - En Uzun Yol (hasLongestRoad): 2 ZP
 * - En Güçlü Ordu (hasLargestArmy): 2 ZP
 */
export function calculateVictoryPoints(player: PublicPlayerState): number {
  let vp = 0;
  for (const slot of player.villageSlots) {
    if (slot.upgradedTo === 'none') {
      vp += 1;
    } else if (slot.upgradedTo === 'city') {
      vp += 2;
    } else if (slot.upgradedTo === 'metropolis') {
      vp += 3;
    }
  }
  if (player.hasLongestRoad) {
    vp += 2;
  }
  if (player.hasLargestArmy) {
    vp += 2;
  }
  return vp;
}

/**
 * Yol sayısına göre Liman Etkisi takas oranını döner (İlk Yol sayıya DAHİLDİR!):
 * 1 Yol -> 4:1
 * 2 Yol -> 3:1
 * 3 Yol -> 2:1
 * 4+ Yol -> 1:1
 */
export function getHarborTradeRate(roadsCount: number): number {
  if (roadsCount <= 0) {
    throw new Error('Liman etkisi kullanmak için en az 1 Yol gereklidir.');
  }
  return Math.max(1, 5 - roadsCount);
}

/**
 * Bir oyuncunun elinde istenen kaynakların tamamının bulunup bulunmadığını kontrol eder.
 */
function hasResourcesInHand(
  hand: readonly ResourceType[],
  required: readonly ResourceType[]
): boolean {
  const counts: Record<ResourceType, number> = {
    brick: 0,
    wood: 0,
    wool: 0,
    wheat: 0,
    ore: 0,
  };
  for (const r of hand) {
    counts[r]++;
  }
  for (const req of required) {
    if (counts[req] <= 0) {
      return false;
    }
    counts[req]--;
  }
  return true;
}

/**
 * Oyuncunun elinden belirtilen kaynakları çıkarır ve yeni el dizisini döner.
 */
function removeResourcesFromHand(
  hand: readonly ResourceType[],
  toRemove: readonly ResourceType[]
): ResourceType[] {
  const nextHand = [...hand];
  for (const res of toRemove) {
    const idx = nextHand.indexOf(res);
    if (idx === -1) {
      throw new Error(`Oyuncunun elinde yeterli ${RESOURCE_LABELS_TR[res]} kaynağı yok.`);
    }
    nextHand.splice(idx, 1);
  }
  return nextHand;
}

/**
 * Tüm oyuncuların handCount ve victoryPoints değerlerini günceller.
 * Eğer olay çözümlemesi beklenmiyorsa ve aktif oyuncu 7+ ZP'ye ulaşmışsa oyunu bitirir.
 */
export function syncPlayersAndCheckVictory(
  state: AuthoritativeGameState
): AuthoritativeGameState {
  const updatedPlayers = state.players.map((p) => {
    const handCount = state.hands[p.playerId]?.length ?? 0;
    const updatedPlayer: PublicPlayerState = {
      ...p,
      handCount,
    };
    updatedPlayer.victoryPoints = calculateVictoryPoints(updatedPlayer);
    return updatedPlayer;
  });

  let nextState: AuthoritativeGameState = {
    ...state,
    players: updatedPlayers,
  };

  if (
    nextState.status === 'playing' &&
    nextState.turnPhase !== 'resolving_event'
  ) {
    const activePlayer = nextState.players[nextState.activePlayerIndex];
    if (activePlayer && activePlayer.victoryPoints >= 7) {
      nextState = {
        ...nextState,
        status: 'finished',
        turnPhase: 'game_over',
        winnerPlayerId: activePlayer.playerId,
        logs: [
          ...nextState.logs,
          createLog(
            'victory',
            `${activePlayer.nickname} kendi turunda ${activePlayer.victoryPoints} Zafer Puanına ulaşarak oyunu kazandı!`
          ),
        ],
      };
    }
  }

  return nextState;
}

/**
 * 1. KURULUM (Setup Phase):
 * - Sadece 3 veya 4 oyuncu.
 * - 61 Kaynak kartı karıştırılır, her oyuncuya kapalı 2 Kaynak kartı dağıtılır.
 * - İlk Köy kartları karıştırılıp dağıtılır (3 kişilik oyunda yazısız İlk Köy kartlarından biri çıkarılır).
 *   İşaretli İlk Köy kartını alan oyuncu ilk oyuncu (activePlayerIndex) olur.
 * - Her oyuncuya 1 İlk Yol (roadsCount = 1) ve 1 İlk Köy (1 ZP) açık verilir.
 * - İlk Oyun Modu (useFirstGamePreset) açıksa market: 2 Köy, 1 Şövalye, 1 Yol, 1 Şehir olarak dizilir;
 *   değilse 5 kart açılır ve 5 aynı kart kuralı kontrol edilir.
 */
export function createInitialGameState(
  params: CreateInitialGameParams,
  rng: () => number = Math.random
): AuthoritativeGameState {
  const { roomId, roomCode, players, settings } = params;

  if (players.length !== 3 && players.length !== 4) {
    throw new Error('Catan Kart Oyunu sadece 3 veya 4 oyuncu ile oynanabilir.');
  }

  let resourceDeck = createResourceDeck(rng);
  const resourceDiscard: ResourceType[] = [];

  // Başlangıç İlk Köy kartları: 1 tanesi işaretli (ilk oyuncuyu belirler), diğerleri yazısız.
  // 3 kişilik oyunda yazısız İlk Köy kartlarından 1 tanesi kutuya geri konur.
  const initialSettlementMarkers: boolean[] = [
    true,
    ...Array(players.length - 1).fill(false),
  ];
  const shuffledMarkers = shuffleArray(initialSettlementMarkers, rng);

  const hands: Record<string, ResourceType[]> = {};
  const publicPlayers: PublicPlayerState[] = [];
  let firstPlayerIndex = 0;
  const nowIso = new Date().toISOString();

  players.forEach((p, idx) => {
    const drawResult = drawResourceCards(resourceDeck, resourceDiscard, 2, rng);
    resourceDeck = drawResult.resourceDeck;
    hands[p.playerId] = drawResult.drawn;

    const hasMarker = shuffledMarkers[idx];
    if (hasMarker) {
      firstPlayerIndex = idx;
    }

    const initialSlot: VillageSlot = {
      id: `initial_village_${idx + 1}`,
      isInitialSettlement: true,
      hasFirstPlayerMarker: hasMarker,
      upgradedTo: 'none',
    };

    const playerState: PublicPlayerState = {
      playerId: p.playerId,
      nickname: p.nickname,
      seatIndex: idx,
      isConnected: true,
      lastSeenAt: nowIso,
      handCount: drawResult.drawn.length,
      roadsCount: 1, // 1 İlk Yol
      knightsCount: 0,
      villageSlots: [initialSlot], // 1 İlk Köy (1 ZP)
      hasLongestRoad: false,
      hasLargestArmy: false,
      victoryPoints: 1,
    };

    publicPlayers.push(playerState);
  });

  const rawBuildingDeck = createBuildingDeck(rng);
  const marketSetup = setupInitialCardMarket(
    rawBuildingDeck,
    settings.useFirstGamePreset,
    rng
  );

  const metropolisDeck = createMetropolisDeck(settings.metropolisFaceMode);
  const eventDeck = createEventDeck(rng);

  const firstPlayer = publicPlayers[firstPlayerIndex];

  return {
    roomId,
    roomCode,
    status: 'playing',
    settings,
    turnNumber: 1,
    activePlayerIndex: firstPlayerIndex,
    turnPhase: 'production',
    turnStartedAt: nowIso,
    hasTradedThisTurn: false,
    hasUsedHarborThisTurn: false,
    players: publicPlayers,
    hands,
    resourceDeck,
    resourceDiscard,
    buildingDeck: marketSetup.buildingDeck,
    cardMarket: marketSetup.cardMarket,
    metropolisDeck,
    eventDeck,
    eventDiscard: [],
    pendingEvent: null,
    activeTrade: null,
    winnerPlayerId: null,
    logs: [
      createLog(
        'setup',
        `Oyun kuruldu. İşaretli İlk Köy kartını alan ${firstPlayer.nickname} oyuna başlıyor.`
      ),
    ],
  };
}

/**
 * 2. AŞAMA 1 - KAYNAK ÜRETİMİ (executeProductionPhase):
 * - Aktif oyuncudan başlayarak saat yönünde herkes 1 Kaynak kartı çeker.
 * - Aktif oyuncu ayrıca önündeki her görünür Şehir (upgradedTo === 'city') için +1,
 *   her Büyükşehir (upgradedTo === 'metropolis') için A yüzünde +2, B yüzünde +1 ve
 *   varsa B yüzü özel yetenek kancasını çalıştırarak kaynak alır.
 */
export function executeProductionPhase(
  state: AuthoritativeGameState,
  playerId?: string,
  rng: () => number = Math.random
): AuthoritativeGameState {
  if (state.status !== 'playing') {
    throw new Error('Oyun aktif değil.');
  }
  if (state.turnPhase !== 'production') {
    throw new Error('Şu anda kaynak üretim aşamasında değilsiniz.');
  }

  const activePlayer = state.players[state.activePlayerIndex];
  if (playerId && playerId !== activePlayer.playerId) {
    throw new Error('Sadece aktif oyuncu üretim aşamasını başlatabilir.');
  }

  let resourceDeck = [...state.resourceDeck];
  let resourceDiscard = [...state.resourceDiscard];
  const hands: Record<string, ResourceType[]> = {};
  for (const p of state.players) {
    hands[p.playerId] = [...(state.hands[p.playerId] ?? [])];
  }

  const playerCount = state.players.length;

  // Aktif oyuncudan başlayarak saat yönünde herkese 1 temel kaynak
  for (let offset = 0; offset < playerCount; offset++) {
    const idx = (state.activePlayerIndex + offset) % playerCount;
    const targetPlayer = state.players[idx];
    const res = drawResourceCards(resourceDeck, resourceDiscard, 1, rng);
    resourceDeck = res.resourceDeck;
    resourceDiscard = res.resourceDiscard;
    hands[targetPlayer.playerId].push(...res.drawn);
  }

  // Aktif oyuncunun görünür Şehir ve Büyükşehir üretim bonusları
  let bonusCount = 0;
  const bFaceMetropolises = [];

  for (const slot of activePlayer.villageSlots) {
    if (slot.upgradedTo === 'city') {
      bonusCount += 1;
    } else if (slot.upgradedTo === 'metropolis') {
      const cardBonus =
        slot.metropolisCard?.productionBonus ??
        (state.settings.metropolisFaceMode === 'A' ? 2 : 1);
      bonusCount += cardBonus;
      if (slot.metropolisCard?.face === 'B') {
        bFaceMetropolises.push(slot.metropolisCard);
      }
    }
  }

  if (bonusCount > 0) {
    const bonusDraw = drawResourceCards(
      resourceDeck,
      resourceDiscard,
      bonusCount,
      rng
    );
    resourceDeck = bonusDraw.resourceDeck;
    resourceDiscard = bonusDraw.resourceDiscard;
    hands[activePlayer.playerId].push(...bonusDraw.drawn);
  }

  let nextState: AuthoritativeGameState = {
    ...state,
    turnPhase: 'action',
    hands,
    resourceDeck,
    resourceDiscard,
    logs: [
      ...state.logs,
      createLog(
        'production',
        `Üretim aşaması tamamlandı: Herkes 1 kaynak çekti${
          bonusCount > 0
            ? `, ${activePlayer.nickname} Şehir/Büyükşehir bonusu olarak +${bonusCount} ek kaynak aldı.`
            : '.'
        }`
      ),
    ],
  };

  // Plug-and-play B yüzü özel yetenek kancalarını çalıştır
  for (const metroCard of bFaceMetropolises) {
    nextState = triggerMetropolisBProductionHook(
      nextState,
      activePlayer.playerId,
      metroCard
    );
  }

  return syncPlayersAndCheckVictory(nextState);
}

/**
 * 3. AŞAMA 2 - YOL (LİMAN ETKİSİ) (executeHarborTrade):
 * - İlk Yol sayıya DAHİLDİR: 1 Yol = 4:1, 2 Yol = 3:1, 3 Yol = 2:1, 4+ Yol = 1:1.
 * - Aktif oyuncu turda en fazla 1 kez kullanabilir.
 * - Aynı türden kaynakları ıskartaya atarak desteden (destede yoksa ıskartadan karıştırılarak)
 *   istediği belirli bir kaynak TÜRÜNÜ (requestedResource) seçip alır.
 */
export function executeHarborTrade(
  state: AuthoritativeGameState,
  playerId: string,
  givenResource: ResourceType,
  requestedResource: ResourceType,
  rng: () => number = Math.random
): AuthoritativeGameState {
  if (state.status !== 'playing' || state.turnPhase !== 'action') {
    throw new Error('Liman etkisi sadece aksiyon aşamasında kullanılabilir.');
  }

  const activePlayer = state.players[state.activePlayerIndex];
  if (activePlayer.playerId !== playerId) {
    throw new Error('Liman etkisini sadece sırası gelen aktif oyuncu kullanabilir.');
  }

  if (state.hasUsedHarborThisTurn) {
    throw new Error('Bu turda Yol (Liman etkisi) hakkınızı zaten kullandınız.');
  }

  const rate = getHarborTradeRate(activePlayer.roadsCount);
  const requiredCards = Array<ResourceType>(rate).fill(givenResource);
  const currentHand = state.hands[playerId] ?? [];

  if (!hasResourcesInHand(currentHand, requiredCards)) {
    throw new Error(
      `Liman takası (${rate}:1) için elinizde en az ${rate} adet ${RESOURCE_LABELS_TR[givenResource]} olmalıdır.`
    );
  }

  const handAfterPayment = removeResourcesFromHand(currentHand, requiredCards);

  // Önce desteden (veya destede yoksa mevcut ıskartadan) istenen kaynak kartını çek
  const supplyResult = drawSpecificResourceFromSupply(
    state.resourceDeck,
    state.resourceDiscard,
    requestedResource,
    rng
  );

  if (!supplyResult.drawn) {
    throw new Error(
      `İstenen ${RESOURCE_LABELS_TR[requestedResource]} kaynağı destede veya ıskartada kalmadı.`
    );
  }

  // Oyuncunun ödediği kaynakları ıskartaya ekle ve çekilen kaynağı eline ver
  const updatedDiscard = [...supplyResult.resourceDiscard, ...requiredCards];
  const updatedHand = [...handAfterPayment, supplyResult.drawn];

  const nextState: AuthoritativeGameState = {
    ...state,
    hasUsedHarborThisTurn: true,
    hands: {
      ...state.hands,
      [playerId]: updatedHand,
    },
    resourceDeck: supplyResult.resourceDeck,
    resourceDiscard: updatedDiscard,
    logs: [
      ...state.logs,
      createLog(
        'harbor',
        `${activePlayer.nickname} Liman Etkisi (${rate}:1) kullanarak ${rate} ${RESOURCE_LABELS_TR[givenResource]} verdi ve 1 ${RESOURCE_LABELS_TR[requestedResource]} aldı.`
      ),
    ],
  };

  return syncPlayersAndCheckVictory(nextState);
}

/**
 * 4. AŞAMA 2 - OYUNCU TAKASI (executePlayerTrade):
 * - Aktif oyuncu turda sadece 1 kez başka bir oyuncu ile serbest oranda takas yapabilir.
 * - Takas tamamlandığında aktif olmayan diğer oyuncuya (partnerPlayerId) ödül olarak
 *   kaynak destesinden kapalı 1 Kaynak kartı otomatik çekilir!
 */
export function executePlayerTrade(
  state: AuthoritativeGameState,
  params: PlayerTradeParams,
  rng: () => number = Math.random
): AuthoritativeGameState {
  if (state.status !== 'playing' || state.turnPhase !== 'action') {
    throw new Error('Oyuncu takası sadece aksiyon aşamasında yapılabilir.');
  }

  const { activePlayerId, partnerPlayerId, giveToPartner, receiveFromPartner } =
    params;

  const activePlayer = state.players[state.activePlayerIndex];
  if (activePlayer.playerId !== activePlayerId) {
    throw new Error('Takası sadece sırası gelen aktif oyuncu gerçekleştirebilir.');
  }

  if (activePlayerId === partnerPlayerId) {
    throw new Error('Oyuncu kendisiyle takas yapamaz.');
  }

  if (state.hasTradedThisTurn) {
    throw new Error('Bu turda oyuncu takası hakkınızı zaten kullandınız.');
  }

  const partnerPlayer = state.players.find(
    (p) => p.playerId === partnerPlayerId
  );
  if (!partnerPlayer) {
    throw new Error('Takas yapılacak oyuncu bulunamadı.');
  }

  if (giveToPartner.length === 0 || receiveFromPartner.length === 0) {
    throw new Error('Takasta her iki taraf da en az 1 kaynak kartı vermelidir.');
  }

  const activeHand = state.hands[activePlayerId] ?? [];
  const partnerHand = state.hands[partnerPlayerId] ?? [];

  if (!hasResourcesInHand(activeHand, giveToPartner)) {
    throw new Error('Aktif oyuncunun elinde teklif edilen kaynaklar bulunmuyor.');
  }

  if (!hasResourcesInHand(partnerHand, receiveFromPartner)) {
    throw new Error('Diğer oyuncunun elinde istenen kaynaklar bulunmuyor.');
  }

  const nextActiveHand = [
    ...removeResourcesFromHand(activeHand, giveToPartner),
    ...receiveFromPartner,
  ];
  const nextPartnerHand = [
    ...removeResourcesFromHand(partnerHand, receiveFromPartner),
    ...giveToPartner,
  ];

  // Takas yapılan diğer oyuncuya desteden 1 kapalı ödül kaynak kartı çekilir
  const rewardDraw = drawResourceCards(
    state.resourceDeck,
    state.resourceDiscard,
    1,
    rng
  );
  nextPartnerHand.push(...rewardDraw.drawn);

  const nextState: AuthoritativeGameState = {
    ...state,
    hasTradedThisTurn: true,
    activeTrade: null,
    hands: {
      ...state.hands,
      [activePlayerId]: nextActiveHand,
      [partnerPlayerId]: nextPartnerHand,
    },
    resourceDeck: rewardDraw.resourceDeck,
    resourceDiscard: rewardDraw.resourceDiscard,
    logs: [
      ...state.logs,
      createLog(
        'trade',
        `${activePlayer.nickname} ile ${partnerPlayer.nickname} takas yaptı. ${partnerPlayer.nickname} takas ödülü olarak desteden +1 kapalı kaynak kartı kazandı!`
      ),
    ],
  };

  return syncPlayersAndCheckVictory(nextState);
}

/**
 * Olay kartını çeker ve çözümler.
 * Köy inşa edildiğinde pendingMarketRefillAfterEvent = true olarak çağrılır;
 * böylece market ANCAK olay tamamen çözümlendikten sonra 5 karta tamamlanır!
 */
export function drawAndResolveEventCard(
  state: AuthoritativeGameState,
  triggeredByPlayerId: string,
  pendingMarketRefillAfterEvent: boolean,
  rng: () => number = Math.random
): AuthoritativeGameState {
  let eventDeck = [...state.eventDeck];
  let eventDiscard = [...state.eventDiscard];

  if (eventDeck.length === 0 && eventDiscard.length > 0) {
    eventDeck = shuffleArray(eventDiscard, rng);
    eventDiscard = [];
  }

  if (eventDeck.length === 0) {
    eventDeck = createEventDeck(rng);
  }

  const eventType = eventDeck.shift()!;
  return resolveSpecificEventCard(
    {
      ...state,
      eventDeck,
      eventDiscard,
    },
    eventType,
    triggeredByPlayerId,
    pendingMarketRefillAfterEvent,
    rng
  );
}

/**
 * Belirli bir Olay Kartını (Hırsız, Sadaka, Teşvik, Hasat Kutlamaları, Yeni Yıl) çözümler.
 */
export function resolveSpecificEventCard(
  state: AuthoritativeGameState,
  eventType: EventCardType,
  triggeredByPlayerId: string,
  pendingMarketRefillAfterEvent: boolean,
  rng: () => number = Math.random
): AuthoritativeGameState {
  // Önce tüm ZP ve el sayılarını senkronize et (Sadaka vb. güncel ZP kullanır)
  const syncedPlayers = state.players.map((p) => {
    const updated: PublicPlayerState = {
      ...p,
      handCount: state.hands[p.playerId]?.length ?? 0,
    };
    updated.victoryPoints = calculateVictoryPoints(updated);
    return updated;
  });

  let nextState: AuthoritativeGameState = {
    ...state,
    players: syncedPlayers,
  };

  const finalizeEventAndRefillMarket = (
    currentState: AuthoritativeGameState,
    logMessage: string
  ): AuthoritativeGameState => {
    let cardMarket = [...currentState.cardMarket];
    let buildingDeck = [...currentState.buildingDeck];

    if (pendingMarketRefillAfterEvent) {
      const refilled = refillCardMarket(cardMarket, buildingDeck, rng);
      cardMarket = refilled.cardMarket;
      buildingDeck = refilled.buildingDeck;
    }

    return syncPlayersAndCheckVictory({
      ...currentState,
      turnPhase: 'action',
      cardMarket,
      buildingDeck,
      pendingEvent: null,
      logs: [...currentState.logs, createLog('event', logMessage)],
    });
  };

  if (eventType === 'robber') {
    const eventDiscard = [...nextState.eventDiscard, 'robber' as EventCardType];
    const pendingRobberDiscards: PendingRobberDiscard[] = [];

    for (const player of nextState.players) {
      const handLen = (nextState.hands[player.playerId] ?? []).length;
      const limit = 7 + player.knightsCount;
      if (handLen > limit) {
        pendingRobberDiscards.push({
          playerId: player.playerId,
          requiredDiscardCount: Math.floor(handLen / 2),
          completed: false,
        });
      }
    }

    nextState = {
      ...nextState,
      eventDiscard,
    };

    if (pendingRobberDiscards.length === 0) {
      return finalizeEventAndRefillMarket(
        nextState,
        'Olay Kartı [Hırsız]: Hiçbir oyuncunun el sınırı (7 + Şövalye) aşılmadığı için kimse kart atmadı.'
      );
    }

    const summaryLogTr =
      'Olay Kartı [Hırsız]: El sınırı (7 + Şövalye) üzerinde kaynağı olan oyuncular ellerinin yarısını ıskartaya atmalıdır.';

    return syncPlayersAndCheckVictory({
      ...nextState,
      turnPhase: 'resolving_event',
      pendingEvent: {
        eventType: 'robber',
        triggeredByPlayerId,
        pendingRobberDiscards,
        pendingMarketRefillAfterEvent,
        summaryLogTr,
      },
      logs: [...nextState.logs, createLog('event', summaryLogTr)],
    });
  }

  if (eventType === 'charity') {
    const eventDiscard = [...nextState.eventDiscard, 'charity' as EventCardType];
    const maxVp = Math.max(...nextState.players.map((p) => p.victoryPoints));
    const eligibleTargetPlayerIds = nextState.players
      .filter((p) => p.victoryPoints < maxVp)
      .map((p) => p.playerId);

    nextState = {
      ...nextState,
      eventDiscard,
    };

    if (eligibleTargetPlayerIds.length === 0) {
      return finalizeEventAndRefillMarket(
        nextState,
        'Olay Kartı [Sadaka]: Tüm oyuncular eşit Zafer Puanında olduğu için Sadaka olayı pas geçildi.'
      );
    }

    const pendingCharityGives: PendingCharityGive[] = nextState.players
      .filter(
        (p) =>
          p.victoryPoints === maxVp &&
          (nextState.hands[p.playerId]?.length ?? 0) > 0
      )
      .map((leader) => ({
        fromPlayerId: leader.playerId,
        eligibleTargetPlayerIds,
        completed: false,
      }));

    if (pendingCharityGives.length === 0) {
      return finalizeEventAndRefillMarket(
        nextState,
        'Olay Kartı [Sadaka]: En yüksek Zafer Puanına sahip oyuncu(lar)ın elinde kaynak olmadığı için pas geçildi.'
      );
    }

    const summaryLogTr =
      'Olay Kartı [Sadaka]: En yüksek Zafer Puanına sahip oyuncu(lar), daha az puanlı bir oyuncuya 1 kaynak kartı vermelidir.';

    return syncPlayersAndCheckVictory({
      ...nextState,
      turnPhase: 'resolving_event',
      pendingEvent: {
        eventType: 'charity',
        triggeredByPlayerId,
        pendingCharityGives,
        pendingMarketRefillAfterEvent,
        summaryLogTr,
      },
      logs: [...nextState.logs, createLog('event', summaryLogTr)],
    });
  }

  if (eventType === 'incentive') {
    const eventDiscard = [
      ...nextState.eventDiscard,
      'incentive' as EventCardType,
    ];
    let resourceDeck = [...nextState.resourceDeck];
    let resourceDiscard = [...nextState.resourceDiscard];
    const hands: Record<string, ResourceType[]> = {};
    for (const p of nextState.players) {
      hands[p.playerId] = [...(nextState.hands[p.playerId] ?? [])];
    }

    const playerCount = nextState.players.length;
    for (let offset = 0; offset < playerCount; offset++) {
      const idx = (nextState.activePlayerIndex + offset) % playerCount;
      const player = nextState.players[idx];
      if (!player.hasLongestRoad && !player.hasLargestArmy) {
        const drawRes = drawResourceCards(
          resourceDeck,
          resourceDiscard,
          2,
          rng
        );
        resourceDeck = drawRes.resourceDeck;
        resourceDiscard = drawRes.resourceDiscard;
        hands[player.playerId].push(...drawRes.drawn);
      }
    }

    return finalizeEventAndRefillMarket(
      {
        ...nextState,
        hands,
        resourceDeck,
        resourceDiscard,
        eventDiscard,
      },
      'Olay Kartı [Teşvik]: En Uzun Yol ve En Güçlü Ordu kartlarından hiçbirine sahip olmayan oyuncular 2 kaynak çekti.'
    );
  }

  if (eventType === 'harvest_festival') {
    const eventDiscard = [
      ...nextState.eventDiscard,
      'harvest_festival' as EventCardType,
    ];
    let resourceDeck = [...nextState.resourceDeck];
    let resourceDiscard = [...nextState.resourceDiscard];
    const hands: Record<string, ResourceType[]> = {};
    for (const p of nextState.players) {
      hands[p.playerId] = [...(nextState.hands[p.playerId] ?? [])];
    }

    const playerCount = nextState.players.length;
    for (let offset = 0; offset < playerCount; offset++) {
      const idx = (nextState.activePlayerIndex + offset) % playerCount;
      const player = nextState.players[idx];
      const visibleSettlementsCount = player.villageSlots.filter(
        (slot) => slot.upgradedTo === 'none'
      ).length;

      if (visibleSettlementsCount > 0) {
        const drawRes = drawResourceCards(
          resourceDeck,
          resourceDiscard,
          visibleSettlementsCount,
          rng
        );
        resourceDeck = drawRes.resourceDeck;
        resourceDiscard = drawRes.resourceDiscard;
        hands[player.playerId].push(...drawRes.drawn);
      }
    }

    return finalizeEventAndRefillMarket(
      {
        ...nextState,
        hands,
        resourceDeck,
        resourceDiscard,
        eventDiscard,
      },
      'Olay Kartı [Hasat Kutlamaları]: Tüm oyuncular görünür her Köyü için 1 kaynak kartı çekti.'
    );
  }

  // eventType === 'new_year'
  let resourceDeck = [...nextState.resourceDeck];
  let resourceDiscard = [...nextState.resourceDiscard];
  const hands: Record<string, ResourceType[]> = {};
  for (const p of nextState.players) {
    hands[p.playerId] = [...(nextState.hands[p.playerId] ?? [])];
  }

  const playerCount = nextState.players.length;
  for (let offset = 0; offset < playerCount; offset++) {
    const idx = (nextState.activePlayerIndex + offset) % playerCount;
    const player = nextState.players[idx];
    const drawRes = drawResourceCards(resourceDeck, resourceDiscard, 1, rng);
    resourceDeck = drawRes.resourceDeck;
    resourceDiscard = drawRes.resourceDiscard;
    hands[player.playerId].push(...drawRes.drawn);
  }

  // Tüm olay kartları (ıskarta dahil 7 kart) toplanıp karıştırılarak yeni Olay destesi yapılır
  const allEvents: EventCardType[] = [
    ...nextState.eventDeck,
    ...nextState.eventDiscard,
    'new_year',
  ];
  const reshuffledEventDeck = shuffleArray(allEvents, rng);

  return finalizeEventAndRefillMarket(
    {
      ...nextState,
      hands,
      resourceDeck,
      resourceDiscard,
      eventDeck: reshuffledEventDeck,
      eventDiscard: [],
    },
    'Olay Kartı [Yeni Yıl]: Herkes 1 kaynak çekti ve tüm Olay kartları yeniden karıştırıldı.'
  );
}

/**
 * Hırsız (Robber) olayı sırasında el sınırı aşan oyuncunun seçtiği kaynakları ıskartaya atmasını işler.
 * Tüm bekleyen oyuncular tamamladığında (veya Köy inşasından tetiklendiyse) marketi 5 karta tamamlar.
 */
export function submitRobberDiscard(
  state: AuthoritativeGameState,
  playerId: string,
  discardedResources: ResourceType[],
  rng: () => number = Math.random
): AuthoritativeGameState {
  if (
    state.turnPhase !== 'resolving_event' ||
    !state.pendingEvent ||
    state.pendingEvent.eventType !== 'robber' ||
    !state.pendingEvent.pendingRobberDiscards
  ) {
    throw new Error('Şu anda aktif bir Hırsız kart atma süreci yok.');
  }

  const pendingList = state.pendingEvent.pendingRobberDiscards;
  const targetEntry = pendingList.find(
    (entry) => entry.playerId === playerId && !entry.completed
  );

  if (!targetEntry) {
    throw new Error('Bu oyuncunun bekleyen bir Hırsız kart atma zorunluluğu yok.');
  }

  if (discardedResources.length !== targetEntry.requiredDiscardCount) {
    throw new Error(
      `Tam olarak ${targetEntry.requiredDiscardCount} adet kaynak kartı ıskartaya atmalısınız.`
    );
  }

  const playerHand = state.hands[playerId] ?? [];
  if (!hasResourcesInHand(playerHand, discardedResources)) {
    throw new Error('Seçilen kaynaklar oyuncunun elinde bulunmuyor.');
  }

  const updatedHand = removeResourcesFromHand(playerHand, discardedResources);
  const updatedDiscard = [...state.resourceDiscard, ...discardedResources];
  const updatedPendingList = pendingList.map((entry) =>
    entry.playerId === playerId ? { ...entry, completed: true } : entry
  );

  const allCompleted = updatedPendingList.every((entry) => entry.completed);

  let cardMarket = [...state.cardMarket];
  let buildingDeck = [...state.buildingDeck];
  let nextTurnPhase: AuthoritativeGameState['turnPhase'] = state.turnPhase;
  let nextPendingEvent = {
    ...state.pendingEvent,
    pendingRobberDiscards: updatedPendingList,
  } as AuthoritativeGameState['pendingEvent'];

  if (allCompleted) {
    if (state.pendingEvent.pendingMarketRefillAfterEvent) {
      const refilled = refillCardMarket(cardMarket, buildingDeck, rng);
      cardMarket = refilled.cardMarket;
      buildingDeck = refilled.buildingDeck;
    }
    nextTurnPhase = 'action';
    nextPendingEvent = null;
  }

  const playerObj = state.players.find((p) => p.playerId === playerId);

  return syncPlayersAndCheckVictory({
    ...state,
    turnPhase: nextTurnPhase,
    hands: {
      ...state.hands,
      [playerId]: updatedHand,
    },
    resourceDiscard: updatedDiscard,
    cardMarket,
    buildingDeck,
    pendingEvent: nextPendingEvent,
    logs: [
      ...state.logs,
      createLog(
        'event',
        `${playerObj?.nickname ?? playerId} Hırsız nedeniyle ${discardedResources.length} kaynak kartını ıskartaya attı.`
      ),
    ],
  });
}

/**
 * Sadaka (Charity) olayı sırasında en yüksek ZP'li oyuncunun daha düşük ZP'li bir oyuncuya
 * 1 kaynak kartı vermesini işler.
 */
export function submitCharityGive(
  state: AuthoritativeGameState,
  fromPlayerId: string,
  toPlayerId: string,
  resource: ResourceType,
  rng: () => number = Math.random
): AuthoritativeGameState {
  if (
    state.turnPhase !== 'resolving_event' ||
    !state.pendingEvent ||
    state.pendingEvent.eventType !== 'charity' ||
    !state.pendingEvent.pendingCharityGives
  ) {
    throw new Error('Şu anda aktif bir Sadaka kart verme süreci yok.');
  }

  const pendingList = state.pendingEvent.pendingCharityGives;
  const targetEntry = pendingList.find(
    (entry) => entry.fromPlayerId === fromPlayerId && !entry.completed
  );

  if (!targetEntry) {
    throw new Error('Bu oyuncunun bekleyen bir Sadaka verme zorunluluğu yok.');
  }

  if (!targetEntry.eligibleTargetPlayerIds.includes(toPlayerId)) {
    throw new Error('Sadaka sadece daha düşük Zafer Puanına sahip bir oyuncuya verilebilir.');
  }

  const giverHand = state.hands[fromPlayerId] ?? [];
  if (!hasResourcesInHand(giverHand, [resource])) {
    throw new Error('Seçilen kaynak kartı oyuncunun elinde bulunmuyor.');
  }

  const updatedGiverHand = removeResourcesFromHand(giverHand, [resource]);
  const updatedReceiverHand = [...(state.hands[toPlayerId] ?? []), resource];

  const updatedPendingList = pendingList.map((entry) =>
    entry.fromPlayerId === fromPlayerId ? { ...entry, completed: true } : entry
  );

  const allCompleted = updatedPendingList.every((entry) => entry.completed);

  let cardMarket = [...state.cardMarket];
  let buildingDeck = [...state.buildingDeck];
  let nextTurnPhase: AuthoritativeGameState['turnPhase'] = state.turnPhase;
  let nextPendingEvent = {
    ...state.pendingEvent,
    pendingCharityGives: updatedPendingList,
  } as AuthoritativeGameState['pendingEvent'];

  if (allCompleted) {
    if (state.pendingEvent.pendingMarketRefillAfterEvent) {
      const refilled = refillCardMarket(cardMarket, buildingDeck, rng);
      cardMarket = refilled.cardMarket;
      buildingDeck = refilled.buildingDeck;
    }
    nextTurnPhase = 'action';
    nextPendingEvent = null;
  }

  const giverObj = state.players.find((p) => p.playerId === fromPlayerId);
  const receiverObj = state.players.find((p) => p.playerId === toPlayerId);

  return syncPlayersAndCheckVictory({
    ...state,
    turnPhase: nextTurnPhase,
    hands: {
      ...state.hands,
      [fromPlayerId]: updatedGiverHand,
      [toPlayerId]: updatedReceiverHand,
    },
    cardMarket,
    buildingDeck,
    pendingEvent: nextPendingEvent,
    logs: [
      ...state.logs,
      createLog(
        'event',
        `${giverObj?.nickname ?? fromPlayerId}, Sadaka olarak ${receiverObj?.nickname ?? toPlayerId} oyuncusuna 1 kaynak kartı verdi.`
      ),
    ],
  });
}

/**
 * 5. AŞAMA 2 - İNŞAAT (executeBuildStructure):
 * - Yol (1 Tuğla + 1 Odun): roadsCount +1, En Uzun Yol (3+ yol ve mevcut sahibinden fazla) kontrolü.
 * - Şövalye (1 Yün + 1 Buğday + 1 Demir): knightsCount +1, En Güçlü Ordu (2+ şövalye ve mevcut sahibinden fazla) kontrolü.
 * - Şehir (2 Buğday + 3 Demir): Görünür bir Köy (upgradedTo === 'none') üzerine kapatılır (upgradedTo = 'city').
 * - Büyükşehir (3 Yün + 1 Demir): Ortak Büyükşehir destesinden alınır (marketten alınmaz!), görünür bir Şehir üzerine kapatılır (upgradedTo = 'metropolis').
 * - Köy (1 Tuğla + 1 Odun + 1 Yün + 1 Buğday): Yeni VillageSlot açılır (+1 ZP). Market yenilenmeden ÖNCE 1 Olay Kartı çekilir ve çözümlenir!
 */
export function executeBuildStructure(
  state: AuthoritativeGameState,
  playerId: string,
  structureType: StructureType,
  targetVillageSlotId?: string,
  rng: () => number = Math.random
): AuthoritativeGameState {
  if (state.status !== 'playing' || state.turnPhase !== 'action') {
    throw new Error('İnşaat sadece aksiyon aşamasında yapılabilir.');
  }

  const activePlayer = state.players[state.activePlayerIndex];
  if (activePlayer.playerId !== playerId) {
    throw new Error('Sadece sırası gelen aktif oyuncu inşaat yapabilir.');
  }

  // Maliyet listesini oluştur
  const costRecord = BUILDING_COSTS[structureType];
  const costList: ResourceType[] = [];
  (Object.keys(costRecord) as ResourceType[]).forEach((res) => {
    const count = costRecord[res] ?? 0;
    for (let i = 0; i < count; i++) {
      costList.push(res);
    }
  });

  const currentHand = state.hands[playerId] ?? [];
  if (!hasResourcesInHand(currentHand, costList)) {
    throw new Error(`${structureType} inşası için yeterli kaynağınız yok.`);
  }

  // Kart kullanılabilirliği ve hedef slot doğrulaması
  let cardMarket = [...state.cardMarket];
  let buildingDeck = [...state.buildingDeck];
  const metropolisDeck = [...state.metropolisDeck];

  if (structureType === 'metropolis') {
    if (metropolisDeck.length === 0) {
      throw new Error('Büyükşehir destesinde kart kalmadı.');
    }
  } else {
    const marketIdx = cardMarket.indexOf(structureType as BuildingCardType);
    if (marketIdx === -1) {
      throw new Error(`Açık 5 inşaat kartı arasında ${structureType} bulunmuyor.`);
    }
    cardMarket.splice(marketIdx, 1);
  }

  // Kaynakları oyuncunun elinden düş ve ıskartaya at
  const updatedHand = removeResourcesFromHand(currentHand, costList);
  const updatedDiscard = [...state.resourceDiscard, ...costList];
  let updatedPlayers = state.players.map((p) => ({
    ...p,
    villageSlots: p.villageSlots.map((s) => ({ ...s })),
  }));
  const activePlayerCopy = updatedPlayers[state.activePlayerIndex];

  if (structureType === 'road') {
    activePlayerCopy.roadsCount += 1;

    // En Uzun Yol kontrolü: İlk Yol dahil ilk 3 yola ulaşan alır; daha fazla yapan olursa el değiştirir
    if (activePlayerCopy.roadsCount >= 3) {
      const currentHolder = updatedPlayers.find((p) => p.hasLongestRoad);
      if (!currentHolder) {
        activePlayerCopy.hasLongestRoad = true;
      } else if (
        currentHolder.playerId !== activePlayerCopy.playerId &&
        activePlayerCopy.roadsCount > currentHolder.roadsCount
      ) {
        currentHolder.hasLongestRoad = false;
        activePlayerCopy.hasLongestRoad = true;
      }
    }

    const refilled = refillCardMarket(cardMarket, buildingDeck, rng);
    cardMarket = refilled.cardMarket;
    buildingDeck = refilled.buildingDeck;

    return syncPlayersAndCheckVictory({
      ...state,
      players: updatedPlayers,
      hands: {
        ...state.hands,
        [playerId]: updatedHand,
      },
      resourceDiscard: updatedDiscard,
      cardMarket,
      buildingDeck,
      logs: [
        ...state.logs,
        createLog('build', `${activePlayerCopy.nickname} yeni bir Yol inşa etti (Toplam Yol: ${activePlayerCopy.roadsCount}).`),
      ],
    });
  }

  if (structureType === 'knight') {
    activePlayerCopy.knightsCount += 1;

    // En Güçlü Ordu kontrolü: İlk 2 şövalyeye ulaşan alır; daha fazla yapan olursa el değiştirir
    if (activePlayerCopy.knightsCount >= 2) {
      const currentHolder = updatedPlayers.find((p) => p.hasLargestArmy);
      if (!currentHolder) {
        activePlayerCopy.hasLargestArmy = true;
      } else if (
        currentHolder.playerId !== activePlayerCopy.playerId &&
        activePlayerCopy.knightsCount > currentHolder.knightsCount
      ) {
        currentHolder.hasLargestArmy = false;
        activePlayerCopy.hasLargestArmy = true;
      }
    }

    const refilled = refillCardMarket(cardMarket, buildingDeck, rng);
    cardMarket = refilled.cardMarket;
    buildingDeck = refilled.buildingDeck;

    return syncPlayersAndCheckVictory({
      ...state,
      players: updatedPlayers,
      hands: {
        ...state.hands,
        [playerId]: updatedHand,
      },
      resourceDiscard: updatedDiscard,
      cardMarket,
      buildingDeck,
      logs: [
        ...state.logs,
        createLog('build', `${activePlayerCopy.nickname} yeni bir Şövalye işe aldı (Toplam Şövalye: ${activePlayerCopy.knightsCount}).`),
      ],
    });
  }

  if (structureType === 'city') {
    const slotIdx = targetVillageSlotId
      ? activePlayerCopy.villageSlots.findIndex(
          (s) => s.id === targetVillageSlotId && s.upgradedTo === 'none'
        )
      : activePlayerCopy.villageSlots.findIndex((s) => s.upgradedTo === 'none');

    if (slotIdx === -1) {
      throw new Error('Şehir inşa etmek için üzerine kapatılacak görünür bir Köy (upgradedTo === "none") bulunmuyor.');
    }

    activePlayerCopy.villageSlots[slotIdx] = {
      ...activePlayerCopy.villageSlots[slotIdx],
      upgradedTo: 'city',
    };

    const refilled = refillCardMarket(cardMarket, buildingDeck, rng);
    cardMarket = refilled.cardMarket;
    buildingDeck = refilled.buildingDeck;

    return syncPlayersAndCheckVictory({
      ...state,
      players: updatedPlayers,
      hands: {
        ...state.hands,
        [playerId]: updatedHand,
      },
      resourceDiscard: updatedDiscard,
      cardMarket,
      buildingDeck,
      logs: [
        ...state.logs,
        createLog('build', `${activePlayerCopy.nickname} bir Köyünü Şehre dönüştürdü (+1 ZP).`),
      ],
    });
  }

  if (structureType === 'metropolis') {
    const slotIdx = targetVillageSlotId
      ? activePlayerCopy.villageSlots.findIndex(
          (s) => s.id === targetVillageSlotId && s.upgradedTo === 'city'
        )
      : activePlayerCopy.villageSlots.findIndex((s) => s.upgradedTo === 'city');

    if (slotIdx === -1) {
      throw new Error('Büyükşehir inşa etmek için üzerine kapatılacak görünür bir Şehir (upgradedTo === "city") bulunmuyor.');
    }

    const metroCard = metropolisDeck.shift()!;
    activePlayerCopy.villageSlots[slotIdx] = {
      ...activePlayerCopy.villageSlots[slotIdx],
      upgradedTo: 'metropolis',
      metropolisCard: metroCard,
    };

    // Büyükşehir marketten alınmadığı için cardMarket yenilenmez!
    return syncPlayersAndCheckVictory({
      ...state,
      players: updatedPlayers,
      hands: {
        ...state.hands,
        [playerId]: updatedHand,
      },
      resourceDiscard: updatedDiscard,
      metropolisDeck,
      logs: [
        ...state.logs,
        createLog('build', `${activePlayerCopy.nickname} bir Şehrini Büyükşehre dönüştürdü (+1 ZP).`),
      ],
    });
  }

  // structureType === 'settlement' (Köy)
  const newSlot: VillageSlot = {
    id: `village_${state.turnNumber}_${activePlayerCopy.villageSlots.length + 1}`,
    isInitialSettlement: false,
    upgradedTo: 'none',
  };
  activePlayerCopy.villageSlots.push(newSlot);

  // KRİTİK KURAL: Köy inşa edildiği an market yenilenmeden ÖNCE 1 Olay Kartı çekilir ve çözümlenir!
  // Market ANCAK olay tamamen çözümlendikten sonra 5 karta tamamlanır!
  const stateBeforeEvent: AuthoritativeGameState = {
    ...state,
    players: updatedPlayers,
    hands: {
      ...state.hands,
      [playerId]: updatedHand,
    },
    resourceDiscard: updatedDiscard,
    cardMarket, // Şu anda 4 kart var! Olay bitince 5'e tamamlanacak.
    buildingDeck,
    logs: [
      ...state.logs,
      createLog(
        'build',
        `${activePlayerCopy.nickname} yeni bir Köy inşa etti (+1 ZP). Olay kartı çekiliyor...`
      ),
    ],
  };

  return drawAndResolveEventCard(stateBeforeEvent, playerId, true, rng);
}

/**
 * 6. TUR BİTİRME (endTurn):
 * Sırayı saat yönündeki bir sonraki oyuncuya geçirir ve tur aşamasını 'production' yapar.
 */
export function endTurn(
  state: AuthoritativeGameState,
  playerId: string
): AuthoritativeGameState {
  if (state.status !== 'playing') {
    throw new Error('Oyun aktif değil.');
  }
  if (state.turnPhase !== 'action') {
    throw new Error('Tur sadece aksiyon aşamasında ve bekleyen olay yokken bitirilebilir.');
  }

  const activePlayer = state.players[state.activePlayerIndex];
  if (activePlayer.playerId !== playerId) {
    throw new Error('Sadece sırası gelen aktif oyuncu turu bitirebilir.');
  }

  const nextActiveIndex = (state.activePlayerIndex + 1) % state.players.length;
  const nextActivePlayer = state.players[nextActiveIndex];

  const nextState: AuthoritativeGameState = {
    ...state,
    turnNumber: state.turnNumber + 1,
    activePlayerIndex: nextActiveIndex,
    turnPhase: 'production',
    turnStartedAt: new Date().toISOString(),
    hasTradedThisTurn: false,
    hasUsedHarborThisTurn: false,
    activeTrade: null,
    logs: [
      ...state.logs,
      createLog('turn', `${activePlayer.nickname} turunu bitirdi. Sıra ${nextActivePlayer.nickname} oyuncusunda.`),
    ],
  };

  return syncPlayersAndCheckVictory(nextState);
}

/**
 * 7. HİLE KORUMALI İSTEMCİ GÖRÜNÜMÜ (toClientGameView):
 * Rakiplerin elindeki kartların türlerini gizler, sadece el sayılarını (handCount) ve
 * izleyicinin kendi elini (myHand) döner.
 */
export function toClientGameView(
  state: AuthoritativeGameState,
  viewerPlayerId: string
): ClientGameView {
  const maskedPlayers: PublicPlayerState[] = state.players.map((p) => ({
    ...p,
    handCount: state.hands[p.playerId]?.length ?? p.handCount,
    villageSlots: p.villageSlots.map((s) => ({ ...s })),
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
    players: maskedPlayers,
    myPlayerId: viewerPlayerId,
    myHand: [...(state.hands[viewerPlayerId] ?? [])],
    resourceDeckCount: state.resourceDeck.length,
    resourceDiscardCount: state.resourceDiscard.length,
    buildingDeckCount: state.buildingDeck.length,
    cardMarket: [...state.cardMarket],
    metropolisDeckCount: state.metropolisDeck.length,
    topMetropolisCard: state.metropolisDeck[0] ?? null,
    eventDeckCount: state.eventDeck.length,
    eventDiscardCount: state.eventDiscard.length,
    pendingEvent: state.pendingEvent ?? null,
    activeTrade: state.activeTrade ?? null,
    winnerPlayerId: state.winnerPlayerId ?? null,
    logs: [...state.logs],
  };
}
