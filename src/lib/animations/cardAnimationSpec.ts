/**
 * CATAN KART OYUNU — Dijital Masaüstü Kart Animasyon Spesifikasyonu (60fps GPU-Accelerated)
 * Referanslar: Hearthstone (Arc & Slam), Balatro (Spring Fan & Micro-tilt),
 * Catan Universe (Market Deal & Resource Flight), Marvel Snap (Impact Pulse).
 */

export interface KeyframeTransformStep {
  progress: number; // 0..1
  translateX: number; // px
  translateY: number; // px
  rotateZ: number; // deg
  rotateY?: number; // deg (3D kart çevirme / flip)
  scale: number;
  opacity?: number;
}

export interface ShuffleAnimationSpec {
  totalDurationMs: number;
  riffleCycles: number;
  cardSliceCount: number;
  staggerPerCardMs: number;
  easing: string;
  leftPacketKeyframes: KeyframeTransformStep[];
  rightPacketKeyframes: KeyframeTransformStep[];
  bridgeSettleEasing: string;
}

export interface DealPhaseTimingSpec {
  phase: 'market_building_row' | 'starting_structures' | 'starting_resources';
  startDelayMs: number;
  staggerMs: number;
  flightDurationMs: number;
  flipDurationMs: number;
  arcPeakPx: number;
  easing: string;
  backImageUrl: string;
}

export interface DealAnimationSpec {
  totalOpeningDurationMs: number;
  marketBuildingDeal: DealPhaseTimingSpec & { cardCount: 5 };
  startingStructuresDeal: DealPhaseTimingSpec & { cardsPerPlayer: 2 };
  startingResourcesDeal: DealPhaseTimingSpec & { cardsPerPlayer: 2 };
}

export interface HandFanSpringSpec {
  springBezier: string;
  hoverBezier: string;
  transitionDurationMs: number;
  hoverDurationMs: number;
  overviewMode: {
    maxArcAngleDeg3P: number;
    maxArcAngleDeg4P: number;
    cardSpacingPx3P: number;
    cardSpacingPx4P: number;
    archDropPerDegPx: number;
    baseScale3P: number;
    baseScale4P: number;
  };
  reviewMode: {
    maxArcAngleDeg: number;
    cardSpacingPx: number;
    archDropPerDegPx: number;
    liftYOffsetPx: number;
    scale: number;
  };
  hoverLift: {
    translateYPx: number;
    scale: number;
    zIndexBoost: number;
  };
}

export interface CardPlaceAnimationSpec {
  totalDurationMs: number;
  liftPhaseMs: number;
  slamPhaseMs: number;
  settlePhaseMs: number;
  peakScale: number;
  impactScale: number;
  finalScale: number;
  arcLiftYPx: number;
  liftEasing: string;
  slamEasing: string;
  settleSpringEasing: string;
  impactRingPulse: {
    durationMs: number;
    initialScale: number;
    finalScale: number;
    borderColor: string;
    glowShadow: string;
  };
  keyframes: KeyframeTransformStep[];
}

export interface HandFanCardTransform {
  translateX: number;
  translateY: number;
  rotateZ: number;
  scale: number;
  zIndex: number;
  cssTransform: string;
  transition: string;
}

export type DealTargetZone =
  | { kind: 'market_slot'; slotIndex: number } // 0..4 (soldan sağa 5 açık inşaat kartı)
  | {
      kind: 'player_corner';
      seatIndex: number;
      playerCount: 3 | 4;
      cardOffsetIndex: number;
      subZone: 'structures' | 'hand';
    };

export interface DealTrajectoryResult {
  delayMs: number;
  durationMs: number;
  startX: number;
  startY: number;
  controlX: number;
  controlY: number;
  endX: number;
  endY: number;
  startRotateZ: number;
  endRotateZ: number;
  flipsFromBack: boolean;
  backImageUrl: string;
  easing: string;
  cssVariables: Record<string, string>;
}

/**
 * 1. KART KARMA (Riffle & Cascade Stack Shuffle)
 * Desteyi sol/sağ iki pakete ayırır, hafif 3B Z-rotasyonu ile iç içe geçirir (interleave) ve hizalar.
 */
export const SHUFFLE_ANIMATION_SPEC: ShuffleAnimationSpec = {
  totalDurationMs: 780,
  riffleCycles: 2,
  cardSliceCount: 8,
  staggerPerCardMs: 28,
  easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  bridgeSettleEasing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  leftPacketKeyframes: [
    { progress: 0, translateX: 0, translateY: 0, rotateZ: 0, scale: 1 },
    { progress: 0.32, translateX: -44, translateY: -8, rotateZ: -9, scale: 1.04 },
    { progress: 0.65, translateX: -10, translateY: -14, rotateZ: 4, scale: 1.06 },
    { progress: 1, translateX: 0, translateY: 0, rotateZ: 0, scale: 1 },
  ],
  rightPacketKeyframes: [
    { progress: 0, translateX: 0, translateY: 0, rotateZ: 0, scale: 1 },
    { progress: 0.32, translateX: 44, translateY: -8, rotateZ: 9, scale: 1.04 },
    { progress: 0.65, translateX: 10, translateY: -14, rotateZ: -4, scale: 1.06 },
    { progress: 1, translateX: 0, translateY: 0, rotateZ: 0, scale: 1 },
  ],
};

/**
 * 2. OYUN BAŞI KARTLARIN MASAYA VE KÖŞELERE DAĞITILMASI (Staggered Opening Deal)
 * Sırasıyla:
 *  1) 5 Açık İnşaat Kartı (staggerMs: 90, building_back.png -> açık yüz)
 *  2) Başlangıç Yapıları (Her oyuncuya 1 İlk Köy + 1 İlk Yol)
 *  3) Başlangıç Kaynakları (Sol Kaynak destesinden her oyuncunun el yelpazesine 2 kapalı kaynak)
 */
export const DEAL_ANIMATION_SPEC: DealAnimationSpec = {
  totalOpeningDurationMs: 2150,
  marketBuildingDeal: {
    phase: 'market_building_row',
    cardCount: 5,
    startDelayMs: 120,
    staggerMs: 90,
    flightDurationMs: 420,
    flipDurationMs: 260,
    arcPeakPx: -38,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    backImageUrl: '/cards/building/building_back.png',
  },
  startingStructuresDeal: {
    phase: 'starting_structures',
    cardsPerPlayer: 2,
    startDelayMs: 680,
    staggerMs: 75,
    flightDurationMs: 380,
    flipDurationMs: 220,
    arcPeakPx: -32,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    backImageUrl: '/cards/starting/starting_settlement_back.png',
  },
  startingResourcesDeal: {
    phase: 'starting_resources',
    cardsPerPlayer: 2,
    startDelayMs: 1280,
    staggerMs: 85,
    flightDurationMs: 440,
    flipDurationMs: 240,
    arcPeakPx: -48,
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    backImageUrl: '/cards/resource/resource_back.png',
  },
};

/**
 * 3. ELDEKİ KARTLARI İNCELEME <-> GENEL MASA BAKIŞI YELPAZE GEÇİŞİ (Hand Review <-> Overview Fan)
 * Yay fiziği (cubic-bezier(0.22, 1, 0.36, 1)) ve 3/4 kişilik masa kadranlarına göre ölçekleme.
 */
export const HAND_FAN_SPRING_SPEC: HandFanSpringSpec = {
  springBezier: 'cubic-bezier(0.22, 1, 0.36, 1)',
  hoverBezier: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  transitionDurationMs: 360,
  hoverDurationMs: 190,
  overviewMode: {
    maxArcAngleDeg3P: 28,
    maxArcAngleDeg4P: 22,
    cardSpacingPx3P: 34,
    cardSpacingPx4P: 26,
    archDropPerDegPx: 0.85,
    baseScale3P: 0.88,
    baseScale4P: 0.8,
  },
  reviewMode: {
    maxArcAngleDeg: 18,
    cardSpacingPx: 74,
    archDropPerDegPx: 0.55,
    liftYOffsetPx: -46,
    scale: 1.12,
  },
  hoverLift: {
    translateYPx: -22,
    scale: 1.16,
    zIndexBoost: 50,
  },
};

/**
 * 4. MASAYA KART KOYMA / İNŞA ETME FİZİĞİ (High-Arc Lift & Table-Impact Settle)
 * Kart yüksek bir kavisle kalkar (scale 1.18), oyuncu alanına tok bir darbeyle oturur (scale 1.0)
 * ve altın bir halka dalgası (impactRingPulse) yayar.
 */
export const CARD_PLACE_ANIMATION_SPEC: CardPlaceAnimationSpec = {
  totalDurationMs: 520,
  liftPhaseMs: 210,
  slamPhaseMs: 170,
  settlePhaseMs: 140,
  peakScale: 1.18,
  impactScale: 0.96,
  finalScale: 1.0,
  arcLiftYPx: -42,
  liftEasing: 'cubic-bezier(0.2, 0.85, 0.4, 1)',
  slamEasing: 'cubic-bezier(0.55, 0.055, 0.675, 0.19)',
  settleSpringEasing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  impactRingPulse: {
    durationMs: 460,
    initialScale: 0.82,
    finalScale: 1.48,
    borderColor: 'rgba(251, 191, 36, 0.75)',
    glowShadow: '0 0 28px rgba(245, 158, 11, 0.55)',
  },
  keyframes: [
    { progress: 0, translateX: 0, translateY: 0, rotateZ: 0, scale: 1.0, opacity: 1 },
    { progress: 0.4, translateX: 0, translateY: -42, rotateZ: -3.5, scale: 1.18, opacity: 1 },
    { progress: 0.74, translateX: 0, translateY: 3, rotateZ: 0.8, scale: 0.96, opacity: 1 },
    { progress: 1, translateX: 0, translateY: 0, rotateZ: 0, scale: 1.0, opacity: 1 },
  ],
};

/**
 * Eldeki her bir kart için İnceleme Modu (Review) ve Genel Masa Bakışı (Overview)
 * arasındaki yelpaze (fan) dönüşüm matrisini hesaplar.
 */
export function computeHandFanTransform(
  index: number,
  total: number,
  isReviewOpen: boolean,
  isFourPlayer = false,
  isHovered = false
): HandFanCardTransform {
  const safeTotal = Math.max(1, total);
  const clampedIndex = Math.min(Math.max(0, index), safeTotal - 1);
  const centerIndex = (safeTotal - 1) / 2;
  const relativeOffset = clampedIndex - centerIndex; // -center .. +center

  const { overviewMode, reviewMode, hoverLift, springBezier, hoverBezier, transitionDurationMs, hoverDurationMs } =
    HAND_FAN_SPRING_SPEC;

  const maxArc = isReviewOpen
    ? reviewMode.maxArcAngleDeg
    : isFourPlayer
      ? overviewMode.maxArcAngleDeg4P
      : overviewMode.maxArcAngleDeg3P;

  // Çok kart olduğunda açıyı doyuma ulaştır, az kart olduğunda aşırı açılmasını önle
  const stepAngle = safeTotal <= 1 ? 0 : Math.min(6.5, maxArc / Math.max(1, safeTotal - 1));
  const rotateZ = isHovered ? 0 : Number((relativeOffset * stepAngle).toFixed(2));

  const baseSpacing = isReviewOpen
    ? reviewMode.cardSpacingPx
    : isFourPlayer
      ? overviewMode.cardSpacingPx4P
      : overviewMode.cardSpacingPx3P;

  // Kart sayısı 6'yı geçtiğinde üst üste binme oranını (overlap) kademeli sıkılaştır
  const crowdFactor = safeTotal > 6 ? 6 / safeTotal : 1;
  const translateX = Number((relativeOffset * baseSpacing * crowdFactor).toFixed(1));

  const archDropFactor = isReviewOpen
    ? reviewMode.archDropPerDegPx
    : overviewMode.archDropPerDegPx;

  const archDropY = Math.abs(rotateZ) * archDropFactor * Math.abs(relativeOffset);
  const baseLiftY = isReviewOpen ? reviewMode.liftYOffsetPx : 0;
  const hoverOffsetY = isHovered ? hoverLift.translateYPx : 0;
  const translateY = Number((baseLiftY + archDropY + hoverOffsetY).toFixed(1));

  const baseScale = isReviewOpen
    ? reviewMode.scale
    : isFourPlayer
      ? overviewMode.baseScale4P
      : overviewMode.baseScale3P;
  const scale = isHovered ? hoverLift.scale : baseScale;

  const zIndex = isHovered ? clampedIndex + hoverLift.zIndexBoost : clampedIndex + 1;
  const easing = isHovered ? hoverBezier : springBezier;
  const duration = isHovered ? hoverDurationMs : transitionDurationMs;

  return {
    translateX,
    translateY,
    rotateZ,
    scale,
    zIndex,
    cssTransform: `translate3d(${translateX}px, ${translateY}px, 0) rotateZ(${rotateZ}deg) scale(${scale})`,
    transition: `transform ${duration}ms ${easing}`,
  };
}

/**
 * Görev tanımındaki `getFanCardTransform(index, total, isReviewOpen, isFourPlayer)` imzası için birebir takma ad (alias).
 */
export const getFanCardTransform = computeHandFanTransform;

/**
 * Merkezdeki İnşaat veya Kaynak destesinden hedef market yuvasına veya oyuncu köşesine (3P/4P)
 * uçan kartın parabolik yörüngesini ve kademeli gecikmesini (stagger) hesaplar.
 */
export function computeDealTrajectory(
  target: DealTargetZone,
  originDeck: { x: number; y: number } = { x: 0, y: 0 }
): DealTrajectoryResult {
  if (target.kind === 'market_slot') {
    const spec = DEAL_ANIMATION_SPEC.marketBuildingDeal;
    const slotIndex = Math.max(0, Math.min(4, target.slotIndex));
    const delayMs = spec.startDelayMs + slotIndex * spec.staggerMs;
    // Soldan sağa 5 açık inşaat yuvası (-220px .. +220px)
    const endX = originDeck.x + (slotIndex - 2) * 110;
    const endY = originDeck.y;
    const controlX = (originDeck.x + endX) / 2;
    const controlY = Math.min(originDeck.y, endY) + spec.arcPeakPx;

    return {
      delayMs,
      durationMs: spec.flightDurationMs,
      startX: originDeck.x,
      startY: originDeck.y,
      controlX,
      controlY,
      endX,
      endY,
      startRotateZ: -6,
      endRotateZ: 0,
      flipsFromBack: true,
      backImageUrl: spec.backImageUrl,
      easing: spec.easing,
      cssVariables: {
        '--deal-delay': `${delayMs}ms`,
        '--deal-duration': `${spec.flightDurationMs}ms`,
        '--deal-start-x': `${originDeck.x}px`,
        '--deal-start-y': `${originDeck.y}px`,
        '--deal-end-x': `${endX}px`,
        '--deal-end-y': `${endY}px`,
        '--deal-peak-y': `${spec.arcPeakPx}px`,
      },
    };
  }

  // Oyuncu köşelerine / kadranlarına dağıtım (3 kişilik köşe vs 4 kişilik kadran yerleşimi)
  const isStructures = target.subZone === 'structures';
  const spec = isStructures
    ? DEAL_ANIMATION_SPEC.startingStructuresDeal
    : DEAL_ANIMATION_SPEC.startingResourcesDeal;

  const corners3P: Array<{ x: number; y: number; rot: number }> = [
    { x: 0, y: 240, rot: 0 },     // Koltuk 0: Alt merkez (Yerel oyuncu)
    { x: -320, y: -190, rot: 14 }, // Koltuk 1: Sol-Üst köşe
    { x: 320, y: -190, rot: -14 }, // Koltuk 2: Sağ-Üst köşe
  ];

  const quadrants4P: Array<{ x: number; y: number; rot: number }> = [
    { x: 0, y: 240, rot: 0 },     // Koltuk 0: Alt (Yerel oyuncu)
    { x: -360, y: 0, rot: 90 },   // Koltuk 1: Sol kadran
    { x: 0, y: -230, rot: 180 },  // Koltuk 2: Üst kadran
    { x: 360, y: 0, rot: -90 },   // Koltuk 3: Sağ kadran
  ];

  const layout = target.playerCount === 4 ? quadrants4P : corners3P;
  const normalizedSeat = ((target.seatIndex % layout.length) + layout.length) % layout.length;
  const anchor = layout[normalizedSeat];

  const sequenceIndex = normalizedSeat * spec.cardsPerPlayer + target.cardOffsetIndex;
  const delayMs = spec.startDelayMs + sequenceIndex * spec.staggerMs;

  const spreadX = (target.cardOffsetIndex - 0.5) * 28;
  const endX = anchor.x + spreadX;
  const endY = anchor.y;
  const controlX = (originDeck.x + endX) / 2;
  const controlY = (originDeck.y + endY) / 2 + spec.arcPeakPx;

  return {
    delayMs,
    durationMs: spec.flightDurationMs,
    startX: originDeck.x,
    startY: originDeck.y,
    controlX,
    controlY,
    endX,
    endY,
    startRotateZ: -12,
    endRotateZ: anchor.rot,
    // Yerel oyuncunun (seatIndex === 0) başlangıç kaynakları ve tüm başlangıç yapıları açık yüzüne döner
    flipsFromBack: isStructures || normalizedSeat === 0,
    backImageUrl: spec.backImageUrl,
    easing: spec.easing,
    cssVariables: {
      '--deal-delay': `${delayMs}ms`,
      '--deal-duration': `${spec.flightDurationMs}ms`,
      '--deal-start-x': `${originDeck.x}px`,
      '--deal-start-y': `${originDeck.y}px`,
      '--deal-end-x': `${endX}px`,
      '--deal-end-y': `${endY}px`,
      '--deal-peak-y': `${spec.arcPeakPx}px`,
    },
  };
}
