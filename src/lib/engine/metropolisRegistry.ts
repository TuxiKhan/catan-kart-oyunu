import {
  AuthoritativeGameState,
  MetropolisBId,
  MetropolisCard,
  MetropolisFaceMode,
} from '../../types/game';

export type MetropolisBEffectHandler = (
  state: AuthoritativeGameState,
  ownerPlayerId: string,
  card: MetropolisCard
) => AuthoritativeGameState;

interface MetropolisBDefinition {
  bVariantId: MetropolisBId;
  titleTr: string;
  descriptionTr: string;
  onProductionEffect?: MetropolisBEffectHandler;
}

const METROPOLIS_B_REGISTRY: Record<MetropolisBId, MetropolisBDefinition> = {
  metropolis_b_1: {
    bVariantId: 'metropolis_b_1',
    titleTr: 'Büyükşehir (B-1)',
    descriptionTr: 'Aktif turunuzda +1 Kaynak üretir. (Özel B Yüzü Yeteneği Yuvaya Hazır)',
  },
  metropolis_b_2: {
    bVariantId: 'metropolis_b_2',
    titleTr: 'Büyükşehir (B-2)',
    descriptionTr: 'Aktif turunuzda +1 Kaynak üretir. (Özel B Yüzü Yeteneği Yuvaya Hazır)',
  },
  metropolis_b_3: {
    bVariantId: 'metropolis_b_3',
    titleTr: 'Büyükşehir (B-3)',
    descriptionTr: 'Aktif turunuzda +1 Kaynak üretir. (Özel B Yüzü Yeteneği Yuvaya Hazır)',
  },
  metropolis_b_4: {
    bVariantId: 'metropolis_b_4',
    titleTr: 'Büyükşehir (B-4)',
    descriptionTr: 'Aktif turunuzda +1 Kaynak üretir. (Özel B Yüzü Yeteneği Yuvaya Hazır)',
  },
};

/**
 * B yüzü özel yeteneklerini çalışma zamanında veya gelecekteki genişletmelerde
 * oyun motoruna dokunmadan (plug-and-play) kaydetmek için kullanılır.
 */
export function registerMetropolisBEffect(
  bVariantId: MetropolisBId,
  handler: MetropolisBEffectHandler,
  metadata?: { titleTr?: string; descriptionTr?: string }
): void {
  const existing = METROPOLIS_B_REGISTRY[bVariantId];
  METROPOLIS_B_REGISTRY[bVariantId] = {
    ...existing,
    titleTr: metadata?.titleTr ?? existing.titleTr,
    descriptionTr: metadata?.descriptionTr ?? existing.descriptionTr,
    onProductionEffect: handler,
  };
}

export function clearMetropolisBEffect(bVariantId: MetropolisBId): void {
  if (METROPOLIS_B_REGISTRY[bVariantId]) {
    delete METROPOLIS_B_REGISTRY[bVariantId].onProductionEffect;
  }
}

export function getMetropolisBEffect(
  bVariantId: MetropolisBId
): MetropolisBEffectHandler | undefined {
  return METROPOLIS_B_REGISTRY[bVariantId]?.onProductionEffect;
}

/**
 * 4 adet Büyükşehir kartını oda ayarındaki yüz moduna (A veya B) göre oluşturur.
 * A Yüzü: Aktif oyuncuya tur başında +2 Kaynak kazandırır (3 ZP).
 * B Yüzü: Aktif oyuncuya tur başında +1 Kaynak + tanımlı özel B yeteneği kazandırır (3 ZP).
 */
export function createMetropolisDeck(faceMode: MetropolisFaceMode): MetropolisCard[] {
  const bIds: MetropolisBId[] = [
    'metropolis_b_1',
    'metropolis_b_2',
    'metropolis_b_3',
    'metropolis_b_4',
  ];

  return bIds.map((bId, idx) => {
    if (faceMode === 'A') {
      return {
        id: `metropolis_${idx + 1}`,
        face: 'A',
        titleTr: 'Büyükşehir (A Yüzü)',
        descriptionTr: '3 Zafer Puanı. Sıra sizdeyken üretim aşamasında +2 Kaynak kartı çekersiniz.',
        productionBonus: 2,
      };
    }

    const def = METROPOLIS_B_REGISTRY[bId];
    return {
      id: `metropolis_${idx + 1}`,
      face: 'B',
      bVariantId: bId,
      titleTr: def.titleTr,
      descriptionTr: def.descriptionTr,
      productionBonus: 1,
    };
  });
}

/**
 * B yüzü bir Büyükşehir için üretim aşamasında kayıtlı özel yetenek varsa tetikler.
 */
export function triggerMetropolisBProductionHook(
  state: AuthoritativeGameState,
  ownerPlayerId: string,
  card: MetropolisCard
): AuthoritativeGameState {
  if (card.face !== 'B' || !card.bVariantId) {
    return state;
  }
  const handler = getMetropolisBEffect(card.bVariantId);
  if (!handler) {
    return state;
  }
  return handler(state, ownerPlayerId, card);
}
