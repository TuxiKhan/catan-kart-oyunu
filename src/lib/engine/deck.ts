import {
  BuildingCardType,
  EventCardType,
  INITIAL_BUILDING_DECK_COUNTS,
  INITIAL_EVENT_DECK_COUNTS,
  INITIAL_RESOURCE_COUNTS,
  ResourceType,
} from '../../types/game';

/**
 * Fisher-Yates karıştırma algoritması (Deterministik testler için opsiyonel rng destekler).
 */
export function shuffleArray<T>(
  items: readonly T[],
  rng: () => number = Math.random
): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }
  return copy;
}

/**
 * 61 adet Kaynak kartı destesini oluşturur ve karıştırır:
 * 11 Tuğla, 11 Odun, 14 Yün, 12 Buğday, 13 Demir.
 */
export function createResourceDeck(rng: () => number = Math.random): ResourceType[] {
  const deck: ResourceType[] = [];
  (Object.keys(INITIAL_RESOURCE_COUNTS) as ResourceType[]).forEach((type) => {
    const count = INITIAL_RESOURCE_COUNTS[type];
    for (let i = 0; i < count; i++) {
      deck.push(type);
    }
  });
  return shuffleArray(deck, rng);
}

/**
 * 34 adet İnşaat kartı destesini oluşturur ve karıştırır:
 * 10 Yol, 11 Köy, 5 Şehir, 8 Şövalye.
 */
export function createBuildingDeck(rng: () => number = Math.random): BuildingCardType[] {
  const deck: BuildingCardType[] = [];
  (Object.keys(INITIAL_BUILDING_DECK_COUNTS) as BuildingCardType[]).forEach((type) => {
    const count = INITIAL_BUILDING_DECK_COUNTS[type];
    for (let i = 0; i < count; i++) {
      deck.push(type);
    }
  });
  return shuffleArray(deck, rng);
}

/**
 * 7 adet Olay kartı destesini oluşturur ve karıştırır:
 * 3 Hırsız, 1 Sadaka, 1 Hasat Kutlamaları, 1 Teşvik, 1 Yeni Yıl.
 */
export function createEventDeck(rng: () => number = Math.random): EventCardType[] {
  const deck: EventCardType[] = [];
  (Object.keys(INITIAL_EVENT_DECK_COUNTS) as EventCardType[]).forEach((type) => {
    const count = INITIAL_EVENT_DECK_COUNTS[type];
    for (let i = 0; i < count; i++) {
      deck.push(type);
    }
  });
  return shuffleArray(deck, rng);
}

/**
 * 5 Aynı Kart Kuralı Kontrolü:
 * Açık 5 inşaat kartının 5'i de aynı türdeyse true döner.
 */
export function isAllSameBuildingType(market: readonly BuildingCardType[]): boolean {
  if (market.length < 5) {
    return false;
  }
  const first = market[0];
  return market.every((card) => card === first);
}

/**
 * Kurulum aşamasında ilk 5 açık inşaat kartını (cardMarket) hazırlar.
 * - useFirstGamePreset = true ise: İlk Oyun Modu (2 Köy, 1 Şövalye, 1 Yol, 1 Şehir).
 * - useFirstGamePreset = false ise: Desteden 5 kart açar ve 5 aynı kart kuralını kontrol eder.
 */
export function setupInitialCardMarket(
  initialBuildingDeck: readonly BuildingCardType[],
  useFirstGamePreset: boolean,
  rng: () => number = Math.random
): {
  cardMarket: BuildingCardType[];
  buildingDeck: BuildingCardType[];
  reshuffledFiveOfAKind: boolean;
} {
  if (useFirstGamePreset) {
    const remaining = [...initialBuildingDeck];
    const presetOrder: BuildingCardType[] = [
      'settlement',
      'settlement',
      'knight',
      'road',
      'city',
    ];
    const market: BuildingCardType[] = [];

    for (const target of presetOrder) {
      const idx = remaining.indexOf(target);
      if (idx !== -1) {
        market.push(remaining[idx]);
        remaining.splice(idx, 1);
      }
    }

    return {
      cardMarket: market,
      buildingDeck: shuffleArray(remaining, rng),
      reshuffledFiveOfAKind: false,
    };
  }

  return refillCardMarket([], initialBuildingDeck, rng);
}

/**
 * Açık inşaat marketini 5 karta tamamlar.
 * "5 Aynı Kart Kuralı": Açılan 5 kartın 5'i de aynı türdeyse (ve toplam havuzda
 * farklı türde kart varsa) market sıfırlanır, inşaat destesiyle birleştirilip karıştırılır
 * ve 5 yeni kart açılır.
 */
export function refillCardMarket(
  currentMarket: readonly BuildingCardType[],
  currentDeck: readonly BuildingCardType[],
  rng: () => number = Math.random
): {
  cardMarket: BuildingCardType[];
  buildingDeck: BuildingCardType[];
  reshuffledFiveOfAKind: boolean;
} {
  let market = [...currentMarket];
  let deck = [...currentDeck];
  let reshuffledFiveOfAKind = false;

  while (market.length < 5 && deck.length > 0) {
    const nextCard = deck.shift()!;
    market.push(nextCard);
  }

  // 5 aynı kart kontrolü
  const combinedPool = [...market, ...deck];
  const distinctTypes = new Set(combinedPool);

  let safetyCounter = 0;
  while (isAllSameBuildingType(market) && distinctTypes.size > 1 && safetyCounter < 50) {
    reshuffledFiveOfAKind = true;
    safetyCounter++;
    const merged = shuffleArray([...market, ...deck], rng);
    market = merged.slice(0, 5);
    deck = merged.slice(5);
  }

  return {
    cardMarket: market,
    buildingDeck: deck,
    reshuffledFiveOfAKind,
  };
}

/**
 * Kaynak destesinden belirtilen sayıda kart çeker.
 * Deste biterse ıskarta yığını (resourceDiscard) karıştırılarak yeni deste yapılır.
 */
export function drawResourceCards(
  resourceDeck: readonly ResourceType[],
  resourceDiscard: readonly ResourceType[],
  count: number,
  rng: () => number = Math.random
): {
  drawn: ResourceType[];
  resourceDeck: ResourceType[];
  resourceDiscard: ResourceType[];
} {
  let deck = [...resourceDeck];
  let discard = [...resourceDiscard];
  const drawn: ResourceType[] = [];

  for (let i = 0; i < count; i++) {
    if (deck.length === 0 && discard.length > 0) {
      deck = shuffleArray(discard, rng);
      discard = [];
    }
    if (deck.length === 0) {
      break;
    }
    const card = deck.shift()!;
    drawn.push(card);
  }

  return {
    drawn,
    resourceDeck: deck,
    resourceDiscard: discard,
  };
}

/**
 * Yol (Liman Etkisi) için kaynak destesinden oyuncunun istediği belirli bir kaynak
 * türünü (requestedResource) bulup çeker. Destede yoksa ve ıskarta yığınında kart varsa
 * ıskarta yığınını karıştırıp desteye ekler ve oradan çeker.
 */
export function drawSpecificResourceFromSupply(
  resourceDeck: readonly ResourceType[],
  resourceDiscard: readonly ResourceType[],
  requestedResource: ResourceType,
  rng: () => number = Math.random
): {
  drawn: ResourceType | null;
  resourceDeck: ResourceType[];
  resourceDiscard: ResourceType[];
} {
  let deck = [...resourceDeck];
  let discard = [...resourceDiscard];

  let idx = deck.indexOf(requestedResource);
  if (idx === -1 && discard.length > 0) {
    deck = [...deck, ...shuffleArray(discard, rng)];
    discard = [];
    idx = deck.indexOf(requestedResource);
  }

  if (idx === -1) {
    return {
      drawn: null,
      resourceDeck: deck,
      resourceDiscard: discard,
    };
  }

  const [drawn] = deck.splice(idx, 1);
  return {
    drawn,
    resourceDeck: deck,
    resourceDiscard: discard,
  };
}
