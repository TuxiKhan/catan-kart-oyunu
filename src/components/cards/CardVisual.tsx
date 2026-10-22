'use client';

import React, { useState } from 'react';
import {
  ResourceType,
  StructureType,
  EventCardType,
  MetropolisFaceMode,
  MetropolisBId,
  RESOURCE_LABELS_TR,
  BUILDING_COSTS,
} from '../../types/game';

export type CardKind =
  | { category: 'resource'; type: ResourceType }
  | {
      category: 'structure';
      type: StructureType;
      isInitial?: boolean;
      hasFirstPlayerMarker?: boolean;
      face?: MetropolisFaceMode;
      bVariantId?: MetropolisBId;
      customTitle?: string;
      customSubtitle?: string;
    }
  | { category: 'event'; type: EventCardType }
  | {
      category: 'special';
      type: 'longest_road' | 'largest_army' | 'rule_summary' | 'rule_summary_back';
    }
  | {
      category: 'back';
      deckType: 'resource' | 'building' | 'event' | 'starting_road' | 'starting_settlement';
    };

/**
 * 120 Kartlık Türkçe Catan Kart Oyunu — Gerçek Kart Görselleri Haritası (31 PNG)
 */
export const CUSTOM_CARD_IMAGE_MAP: Record<string, string> = {
  // Kaynaklar (5)
  'resource:brick': '/cards/resource/resource_brick.png',
  'resource:wood': '/cards/resource/resource_wood.png',
  'resource:wool': '/cards/resource/resource_wool.png',
  'resource:wheat': '/cards/resource/resource_wheat.png',
  'resource:ore': '/cards/resource/resource_ore.png',

  // Deste Arkaları (5)
  'back:resource': '/cards/resource/resource_back.png',
  'back:building': '/cards/building/building_back.png',
  'back:event': '/cards/event/event_back.png',
  'back:starting_road': '/cards/starting/starting_road_back.png',
  'back:starting_settlement': '/cards/starting/starting_settlement_back.png',

  // İnşaat Kartları (4)
  'structure:road': '/cards/building/building_road.png',
  'structure:settlement': '/cards/building/building_settlement.png',
  'structure:city': '/cards/building/building_city.png',
  'structure:knight': '/cards/building/building_knight.png',

  // Başlangıç Yapıları (3)
  'structure:road:initial': '/cards/starting/starting_road_front.png',
  'structure:settlement:initial': '/cards/starting/starting_settlement_front.png',
  'structure:settlement:initial:first_player':
    '/cards/starting/starting_settlement_front_starting_player.png',

  // Büyükşehir A Yüzü ve 4 Farklı B Yüzü (5)
  'structure:metropolis': '/cards/metropolis/metropolis_A.png',
  'structure:metropolis:A': '/cards/metropolis/metropolis_A.png',
  'structure:metropolis:B:metropolis_b_1': '/cards/metropolis/metropolis_B_knights.png',
  'structure:metropolis:B:metropolis_b_2': '/cards/metropolis/metropolis_B_largest_army.png',
  'structure:metropolis:B:metropolis_b_3': '/cards/metropolis/metropolis_B_longest_route.png',
  'structure:metropolis:B:metropolis_b_4': '/cards/metropolis/metropolis_B_roads.png',

  // Olay Kartları (5)
  'event:robber': '/cards/event/event_robber.png',
  'event:charity': '/cards/event/event_charity.png',
  'event:harvest_festival': '/cards/event/event_abundance.png',
  'event:incentive': '/cards/event/event_subsidy.png',
  'event:new_year': '/cards/event/event_solstice.png',

  // Özel Puan & Kural Özeti Kartları (4)
  'special:longest_road': '/cards/bonus/bonus_longest_route.png',
  'special:largest_army': '/cards/bonus/bonus_largest_army.png',
  'special:rule_summary': '/cards/player_aid/player_aid_front_build_costs.png',
  'special:rule_summary_back': '/cards/player_aid/player_aid_back_turn_overview.png',
};

/**
 * Verilen CardKind nesnesi için doğru Türkçe PNG görsel yolunu çözümler.
 */
export function resolveCardImageUrl(
  card: CardKind,
  customImageUrl?: string
): string | undefined {
  if (customImageUrl) {
    return customImageUrl;
  }

  if (card.category === 'resource') {
    return CUSTOM_CARD_IMAGE_MAP[`resource:${card.type}`];
  }

  if (card.category === 'back') {
    return CUSTOM_CARD_IMAGE_MAP[`back:${card.deckType}`];
  }

  if (card.category === 'event') {
    return CUSTOM_CARD_IMAGE_MAP[`event:${card.type}`];
  }

  if (card.category === 'special') {
    return CUSTOM_CARD_IMAGE_MAP[`special:${card.type}`];
  }

  if (card.category === 'structure') {
    if (card.type === 'road') {
      return card.isInitial
        ? CUSTOM_CARD_IMAGE_MAP['structure:road:initial']
        : CUSTOM_CARD_IMAGE_MAP['structure:road'];
    }

    if (card.type === 'settlement') {
      if (card.isInitial) {
        return card.hasFirstPlayerMarker
          ? CUSTOM_CARD_IMAGE_MAP['structure:settlement:initial:first_player']
          : CUSTOM_CARD_IMAGE_MAP['structure:settlement:initial'];
      }
      return CUSTOM_CARD_IMAGE_MAP['structure:settlement'];
    }

    if (card.type === 'metropolis') {
      if (card.face === 'B') {
        const bKey = `structure:metropolis:B:${card.bVariantId || 'metropolis_b_1'}`;
        return (
          CUSTOM_CARD_IMAGE_MAP[bKey] ||
          CUSTOM_CARD_IMAGE_MAP['structure:metropolis:B:metropolis_b_1']
        );
      }
      return CUSTOM_CARD_IMAGE_MAP['structure:metropolis:A'];
    }

    return CUSTOM_CARD_IMAGE_MAP[`structure:${card.type}`];
  }

  return undefined;
}

export interface CardVisualProps {
  card: CardKind;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  customImageUrl?: string;
  selected?: boolean;
  disabled?: boolean;
  affordable?: boolean;
  countBadge?: number;
  statusBadge?: string;
  onClick?: () => void;
  className?: string;
}

const RESOURCE_THEME: Record<
  ResourceType,
  {
    bg: string;
    border: string;
    headerBg: string;
    accent: string;
    subtitle: string;
  }
> = {
  brick: {
    bg: 'from-amber-900 via-orange-950 to-stone-950',
    border: 'border-orange-500/70',
    headerBg: 'bg-orange-900/90',
    accent: 'text-orange-300',
    subtitle: 'Kil & Tuğla Ocağı',
  },
  wood: {
    bg: 'from-emerald-900 via-green-950 to-stone-950',
    border: 'border-emerald-500/70',
    headerBg: 'bg-emerald-900/90',
    accent: 'text-emerald-300',
    subtitle: 'Derin Orman',
  },
  wool: {
    bg: 'from-lime-800 via-emerald-950 to-stone-950',
    border: 'border-lime-400/70',
    headerBg: 'bg-lime-900/90',
    accent: 'text-lime-200',
    subtitle: 'Yeşil Çayır & Koyun',
  },
  wheat: {
    bg: 'from-yellow-700 via-amber-900 to-stone-950',
    border: 'border-yellow-400/80',
    headerBg: 'bg-yellow-800/90',
    accent: 'text-yellow-200',
    subtitle: 'Altın Başak Tarlası',
  },
  ore: {
    bg: 'from-slate-700 via-slate-900 to-stone-950',
    border: 'border-slate-400/70',
    headerBg: 'bg-slate-800/90',
    accent: 'text-slate-200',
    subtitle: 'Sarp Demir Madeni',
  },
};

const STRUCTURE_META: Record<
  StructureType,
  {
    titleTr: string;
    vp: number;
    effectShortTr: string;
    bg: string;
    border: string;
    headerBg: string;
    accent: string;
  }
> = {
  road: {
    titleTr: 'Yol',
    vp: 0,
    effectShortTr: 'Liman: 4:1 → 1:1 Takas',
    bg: 'from-stone-800 via-amber-950 to-stone-950',
    border: 'border-amber-500/70',
    headerBg: 'bg-amber-900/95',
    accent: 'text-amber-200',
  },
  settlement: {
    titleTr: 'Köy',
    vp: 1,
    effectShortTr: '1 ZP • Olay Kartı Tetikler',
    bg: 'from-amber-800 via-orange-950 to-stone-950',
    border: 'border-amber-400/80',
    headerBg: 'bg-amber-800/95',
    accent: 'text-amber-100',
  },
  city: {
    titleTr: 'Şehir',
    vp: 2,
    effectShortTr: 'Üretimde +1 Kaynak • Köye Kapanır',
    bg: 'from-indigo-900 via-slate-900 to-stone-950',
    border: 'border-indigo-400/80',
    headerBg: 'bg-indigo-900/95',
    accent: 'text-indigo-200',
  },
  metropolis: {
    titleTr: 'Büyükşehir',
    vp: 3,
    effectShortTr: 'Üretimde +2 Kaynak • Şehre Kapanır',
    bg: 'from-purple-900 via-fuchsia-950 to-stone-950',
    border: 'border-yellow-400/90',
    headerBg: 'bg-purple-900/95',
    accent: 'text-yellow-200',
  },
  knight: {
    titleTr: 'Şövalye',
    vp: 0,
    effectShortTr: 'Hırsız Limiti +1 • Ordu Gücü',
    bg: 'from-rose-900 via-red-950 to-stone-950',
    border: 'border-rose-400/80',
    headerBg: 'bg-rose-900/95',
    accent: 'text-rose-200',
  },
};

const EVENT_META: Record<
  EventCardType,
  {
    titleTr: string;
    subtitleTr: string;
    bg: string;
    border: string;
  }
> = {
  robber: {
    titleTr: 'Hırsız',
    subtitleTr: '>(7+Şövalye) kartı olanlar yarısını atar',
    bg: 'from-red-950 via-stone-900 to-black',
    border: 'border-red-500/80',
  },
  charity: {
    titleTr: 'Sadaka',
    subtitleTr: 'Lider(ler) az puanlıya 1 kaynak verir',
    bg: 'from-teal-900 via-stone-900 to-black',
    border: 'border-teal-400/80',
  },
  harvest_festival: {
    titleTr: 'Hasat Kutlamaları',
    subtitleTr: 'Her görünür Köy için +1 kaynak',
    bg: 'from-amber-800 via-stone-900 to-black',
    border: 'border-amber-400/80',
  },
  incentive: {
    titleTr: 'Teşvik',
    subtitleTr: 'Özel kartı olmayanlara +2 kaynak',
    bg: 'from-cyan-900 via-stone-900 to-black',
    border: 'border-cyan-400/80',
  },
  new_year: {
    titleTr: 'Yeni Yıl',
    subtitleTr: 'Herkese +1 kaynak & Olaylar karışır',
    bg: 'from-violet-900 via-stone-900 to-black',
    border: 'border-violet-400/80',
  },
};

const SIZE_CLASSES: Record<NonNullable<CardVisualProps['size']>, string> = {
  xs: 'w-16 h-24 text-[10px]',
  sm: 'w-22 h-32 text-xs',
  md: 'w-28 h-40 text-xs',
  lg: 'w-36 h-52 text-sm',
};

function renderResourceSvg(type: ResourceType, className = 'w-8 h-8') {
  switch (type) {
    case 'brick':
      return (
        <svg viewBox="0 0 36 36" fill="none" className={className} aria-hidden="true">
          <rect x="4" y="8" width="13" height="7" rx="1.5" className="fill-orange-500 stroke-orange-200" strokeWidth="1.5" />
          <rect x="19" y="8" width="13" height="7" rx="1.5" className="fill-orange-600 stroke-orange-200" strokeWidth="1.5" />
          <rect x="8" y="17" width="14" height="7" rx="1.5" className="fill-orange-500 stroke-orange-200" strokeWidth="1.5" />
          <rect x="24" y="17" width="8" height="7" rx="1.5" className="fill-orange-700 stroke-orange-200" strokeWidth="1.5" />
          <rect x="4" y="26" width="16" height="6" rx="1.5" className="fill-orange-600 stroke-orange-200" strokeWidth="1.5" />
          <rect x="22" y="26" width="10" height="6" rx="1.5" className="fill-orange-500 stroke-orange-200" strokeWidth="1.5" />
        </svg>
      );
    case 'wood':
      return (
        <svg viewBox="0 0 36 36" fill="none" className={className} aria-hidden="true">
          <path d="M18 4L8 16H14L9 25H27L22 16H28L18 4Z" className="fill-emerald-500 stroke-emerald-100" strokeWidth="1.5" />
          <rect x="15" y="25" width="6" height="7" rx="1" className="fill-amber-700 stroke-amber-200" strokeWidth="1.5" />
        </svg>
      );
    case 'wool':
      return (
        <svg viewBox="0 0 36 36" fill="none" className={className} aria-hidden="true">
          <circle cx="14" cy="18" r="6" className="fill-lime-100 stroke-lime-400" strokeWidth="1.5" />
          <circle cx="21" cy="16" r="6.5" className="fill-white stroke-lime-400" strokeWidth="1.5" />
          <circle cx="18" cy="21" r="6" className="fill-lime-50 stroke-lime-400" strokeWidth="1.5" />
          <circle cx="25" cy="19" r="3.5" className="fill-stone-700 stroke-stone-200" strokeWidth="1.5" />
        </svg>
      );
    case 'wheat':
      return (
        <svg viewBox="0 0 36 36" fill="none" className={className} aria-hidden="true">
          <path d="M18 32V8" className="stroke-yellow-300" strokeWidth="2.2" strokeLinecap="round" />
          <ellipse cx="14" cy="12" rx="3" ry="4.5" transform="rotate(-25 14 12)" className="fill-yellow-400 stroke-yellow-100" strokeWidth="1.2" />
          <ellipse cx="22" cy="12" rx="3" ry="4.5" transform="rotate(25 22 12)" className="fill-yellow-400 stroke-yellow-100" strokeWidth="1.2" />
          <ellipse cx="14" cy="19" rx="3" ry="4.5" transform="rotate(-25 14 19)" className="fill-yellow-400 stroke-yellow-100" strokeWidth="1.2" />
          <ellipse cx="22" cy="19" rx="3" ry="4.5" transform="rotate(25 22 19)" className="fill-yellow-400 stroke-yellow-100" strokeWidth="1.2" />
          <ellipse cx="18" cy="7" rx="2.5" ry="4" className="fill-yellow-300 stroke-yellow-100" strokeWidth="1.2" />
        </svg>
      );
    case 'ore':
      return (
        <svg viewBox="0 0 36 36" fill="none" className={className} aria-hidden="true">
          <polygon points="18,5 30,13 26,29 10,29 6,13" className="fill-slate-500 stroke-slate-200" strokeWidth="1.6" />
          <polygon points="18,5 25,15 18,22 11,15" className="fill-slate-400/80" />
          <circle cx="14" cy="16" r="1.5" className="fill-cyan-200" />
          <circle cx="22" cy="20" r="1.5" className="fill-cyan-200" />
        </svg>
      );
  }
}

function renderStructureSvg(type: StructureType, className = 'w-9 h-9') {
  switch (type) {
    case 'road':
      return (
        <svg viewBox="0 0 36 36" fill="none" className={className} aria-hidden="true">
          <path d="M7 30L15 6H21L29 30H7Z" className="fill-stone-700 stroke-amber-300" strokeWidth="1.6" />
          <path d="M18 9V14M18 18V23M18 26V29" className="stroke-amber-200" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'settlement':
      return (
        <svg viewBox="0 0 36 36" fill="none" className={className} aria-hidden="true">
          <path d="M6 18L18 7L30 18V30H6V18Z" className="fill-amber-600 stroke-amber-100" strokeWidth="1.8" />
          <rect x="15" y="21" width="6" height="9" className="fill-amber-950" />
        </svg>
      );
    case 'city':
      return (
        <svg viewBox="0 0 36 36" fill="none" className={className} aria-hidden="true">
          <path d="M4 30V16L11 10L18 16V30H4Z" className="fill-indigo-500 stroke-indigo-100" strokeWidth="1.6" />
          <path d="M18 30V11H23V7H32V30H18Z" className="fill-indigo-600 stroke-indigo-100" strokeWidth="1.6" />
          <rect x="22" y="14" width="3" height="4" className="fill-yellow-300" />
          <rect x="27" y="14" width="3" height="4" className="fill-yellow-300" />
        </svg>
      );
    case 'metropolis':
      return (
        <svg viewBox="0 0 36 36" fill="none" className={className} aria-hidden="true">
          <path d="M4 30H32V18L26 12L18 5L10 12L4 18V30Z" className="fill-purple-600 stroke-yellow-300" strokeWidth="1.8" />
          <circle cx="18" cy="15" r="4" className="fill-yellow-400" />
          <path d="M13 30V22H23V30" className="fill-purple-950 stroke-yellow-300" strokeWidth="1.4" />
        </svg>
      );
    case 'knight':
      return (
        <svg viewBox="0 0 36 36" fill="none" className={className} aria-hidden="true">
          <path d="M18 5L29 10V19C29 25.5 24 29.8 18 32C12 29.8 7 25.5 7 19V10L18 5Z" className="fill-rose-700 stroke-rose-100" strokeWidth="1.8" />
          <path d="M18 9V27M11 17H25" className="stroke-amber-300" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      );
  }
}

export const CardVisual: React.FC<CardVisualProps> = ({
  card,
  size = 'md',
  customImageUrl,
  selected = false,
  disabled = false,
  affordable = false,
  countBadge,
  statusBadge,
  onClick,
  className = '',
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const resolvedImageUrl = resolveCardImageUrl(card, customImageUrl);
  const showImage = Boolean(resolvedImageUrl && !imgFailed);

  const interactiveClasses =
    onClick && !disabled ? 'cursor-pointer hover:-translate-y-1 active:scale-95' : '';
  const selectedClasses = selected
    ? 'ring-2 ring-amber-400 -translate-y-2 shadow-[0_0_16px_rgba(251,191,36,0.5)]'
    : '';
  const affordableClasses =
    affordable && !selected ? 'ring-2 ring-emerald-400/90 shadow-md shadow-emerald-500/20' : '';
  const disabledClasses = disabled ? 'opacity-60 cursor-not-allowed' : '';

  // KART ARKASI GÖRÜNÜMÜ
  if (card.category === 'back') {
    const backMeta = {
      resource: {
        title: 'Kaynak',
        sub: 'Destesi',
        bg: 'from-amber-900 via-stone-900 to-stone-950',
        border: 'border-amber-500/60',
      },
      building: {
        title: 'İnşaat',
        sub: 'Destesi',
        bg: 'from-slate-800 via-stone-900 to-stone-950',
        border: 'border-slate-400/60',
      },
      event: {
        title: 'Olay',
        sub: 'Destesi',
        bg: 'from-red-950 via-stone-900 to-stone-950',
        border: 'border-red-500/60',
      },
      starting_road: {
        title: 'İlk Yol',
        sub: 'Arkası',
        bg: 'from-amber-900 via-stone-900 to-stone-950',
        border: 'border-amber-400/60',
      },
      starting_settlement: {
        title: 'İlk Köy',
        sub: 'Arkası',
        bg: 'from-emerald-900 via-stone-900 to-stone-950',
        border: 'border-emerald-400/60',
      },
    }[card.deckType];

    return (
      <div
        onClick={!disabled ? onClick : undefined}
        className={`relative rounded-xl border bg-gradient-to-b ${backMeta.bg} ${backMeta.border} ${SIZE_CLASSES[size]} flex flex-col items-center justify-between overflow-hidden select-none shadow-md transition-all ${interactiveClasses} ${selectedClasses} ${disabledClasses} ${className}`}
      >
        {showImage ? (
          <img
            src={resolvedImageUrl}
            alt={`${backMeta.title} ${backMeta.sub}`}
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full rounded-lg border border-amber-200/20 flex flex-col items-center justify-center p-1 text-center bg-black/20">
            <div className="w-7 h-7 rounded-full border border-amber-400/50 bg-amber-500/10 flex items-center justify-center mb-1">
              <span className="text-amber-300 font-bold text-xs">C</span>
            </div>
            <span className="font-bold text-amber-100 leading-tight">{backMeta.title}</span>
            <span className="text-[10px] text-amber-300/70">{backMeta.sub}</span>
          </div>
        )}
        {typeof countBadge === 'number' && (
          <span className="absolute top-1 right-1 z-20 bg-amber-500 text-stone-950 font-extrabold text-[10px] px-1.5 py-0.5 rounded-full shadow border border-amber-200">
            {countBadge}
          </span>
        )}
      </div>
    );
  }

  // KAYNAK KARTI GÖRÜNÜMÜ
  if (card.category === 'resource') {
    const theme = RESOURCE_THEME[card.type];
    const labelTr = RESOURCE_LABELS_TR[card.type];

    return (
      <div
        onClick={!disabled ? onClick : undefined}
        className={`relative rounded-xl border bg-gradient-to-b ${theme.bg} ${theme.border} ${SIZE_CLASSES[size]} flex flex-col justify-between overflow-hidden select-none shadow-md transition-all ${interactiveClasses} ${selectedClasses} ${affordableClasses} ${disabledClasses} ${className}`}
      >
        {showImage ? (
          <img
            src={resolvedImageUrl}
            alt={labelTr}
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <>
            <div className={`relative z-10 ${theme.headerBg} px-2 py-1 flex items-center justify-between border-b border-white/15`}>
              <span className="font-bold text-white truncate">{labelTr}</span>
              <span className={`text-[10px] font-semibold ${theme.accent}`}>Kaynak</span>
            </div>
            <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-1">
              {renderResourceSvg(card.type, size === 'xs' ? 'w-7 h-7' : 'w-10 h-10')}
            </div>
            <div className="relative z-10 bg-black/50 px-1.5 py-1 text-center border-t border-white/10">
              <span className="text-[10px] text-stone-300 truncate block">{theme.subtitle}</span>
            </div>
          </>
        )}

        {typeof countBadge === 'number' && (
          <span className="absolute bottom-1 right-1 z-20 bg-yellow-400 text-stone-950 font-black text-[11px] px-1.5 py-0.5 rounded-full shadow border border-stone-900/40">
            x{countBadge}
          </span>
        )}
      </div>
    );
  }

  // YAPI / İNŞAAT KARTI GÖRÜNÜMÜ
  if (card.category === 'structure') {
    const meta = STRUCTURE_META[card.type];
    const costs = BUILDING_COSTS[card.type];
    const title = card.customTitle || (card.isInitial ? `İlk ${meta.titleTr}` : meta.titleTr);

    return (
      <div
        onClick={!disabled ? onClick : undefined}
        className={`relative rounded-xl border bg-gradient-to-b ${meta.bg} ${meta.border} ${SIZE_CLASSES[size]} flex flex-col justify-between overflow-hidden select-none shadow-md transition-all ${interactiveClasses} ${selectedClasses} ${affordableClasses} ${disabledClasses} ${className}`}
      >
        {showImage ? (
          <img
            src={resolvedImageUrl}
            alt={title}
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <>
            <div className={`relative z-10 ${meta.headerBg} px-2 py-1 flex items-center justify-between gap-1 border-b border-white/20`}>
              <span className="font-bold text-white truncate">{title}</span>
              {meta.vp > 0 ? (
                <span className="shrink-0 bg-yellow-400 text-stone-950 font-black text-[10px] px-1.5 py-0.2 rounded-full">
                  {meta.vp} ZP
                </span>
              ) : (
                <span className={`shrink-0 text-[10px] font-semibold ${meta.accent}`}>
                  {card.type === 'road' ? 'Liman' : 'Koruma +1'}
                </span>
              )}
            </div>

            <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-1">
              {renderStructureSvg(card.type, size === 'xs' ? 'w-6 h-6' : 'w-9 h-9')}
              {card.hasFirstPlayerMarker && (
                <span className="mt-0.5 bg-amber-400/90 text-stone-950 font-bold text-[9px] px-1.5 py-0.5 rounded-full">
                  ★ Başlangıç Oyuncusu
                </span>
              )}
              {card.face && (
                <span className="mt-0.5 bg-purple-300 text-purple-950 font-bold text-[9px] px-1.5 py-0.5 rounded">
                  {card.face} Yüzü
                </span>
              )}
            </div>

            <div className="relative z-10 bg-black/65 px-1.5 py-1 border-t border-white/15 flex flex-col gap-0.5">
              {!card.isInitial && (
                <div className="flex flex-wrap items-center justify-center gap-1">
                  {(Object.entries(costs) as [ResourceType, number][]).map(([res, amt]) => (
                    <span
                      key={res}
                      className="text-[9px] font-bold px-1 rounded bg-white/10 text-stone-100 border border-white/15"
                    >
                      {amt} {RESOURCE_LABELS_TR[res].slice(0, 3)}
                    </span>
                  ))}
                </div>
              )}
              <span className="text-[9px] text-amber-200/90 text-center leading-tight truncate">
                {card.customSubtitle || meta.effectShortTr}
              </span>
            </div>
          </>
        )}

        {typeof countBadge === 'number' && (
          <span className="absolute top-1 right-1 z-20 bg-purple-400 text-stone-950 font-black text-[10px] px-1.5 py-0.5 rounded-full shadow">
            x{countBadge}
          </span>
        )}

        {statusBadge && (
          <span className="absolute bottom-1 right-1 z-20 bg-emerald-400 text-stone-950 font-extrabold text-[9px] px-1.5 py-0.5 rounded shadow">
            {statusBadge}
          </span>
        )}
      </div>
    );
  }

  // OLAY KARTI GÖRÜNÜMÜ
  if (card.category === 'event') {
    const meta = EVENT_META[card.type];
    return (
      <div
        onClick={!disabled ? onClick : undefined}
        className={`relative rounded-xl border bg-gradient-to-b ${meta.bg} ${meta.border} ${SIZE_CLASSES[size]} flex flex-col justify-between overflow-hidden select-none shadow-md transition-all ${interactiveClasses} ${selectedClasses} ${disabledClasses} ${className}`}
      >
        {showImage ? (
          <img
            src={resolvedImageUrl}
            alt={meta.titleTr}
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <>
            <div className="bg-black/60 px-2 py-1 border-b border-white/15 flex items-center justify-between">
              <span className="font-bold text-white truncate">{meta.titleTr}</span>
              <span className="text-[9px] text-red-300 font-semibold">Olay</span>
            </div>
            <div className="flex-1 flex items-center justify-center p-2 text-center">
              <span className="text-xs font-medium text-stone-200 leading-snug">{meta.subtitleTr}</span>
            </div>
          </>
        )}
      </div>
    );
  }

  // ÖZEL PUAN KARTLARI (En Uzun Yol, En Güçlü Ordu, Kural Özeti Ön/Arka)
  const specialMeta = {
    longest_road: {
      titleTr: 'En Uzun Yol',
      vpText: '2 ZP',
      descTr: 'En az 3 Yol (İlk Yol dahil)',
      bg: 'from-amber-700 via-yellow-900 to-stone-950',
      border: 'border-yellow-400',
    },
    largest_army: {
      titleTr: 'En Güçlü Ordu',
      vpText: '2 ZP',
      descTr: 'En az 2 Şövalye',
      bg: 'from-rose-800 via-red-950 to-stone-950',
      border: 'border-rose-400',
    },
    rule_summary: {
      titleTr: 'Kural Özeti (Ön)',
      vpText: 'Maliyet',
      descTr: 'Yapı Maliyetleri',
      bg: 'from-stone-700 via-stone-900 to-stone-950',
      border: 'border-amber-300/70',
    },
    rule_summary_back: {
      titleTr: 'Kural Özeti (Arka)',
      vpText: 'Tur Akışı',
      descTr: 'Üretim, Ticaret ve İnşaat',
      bg: 'from-stone-700 via-stone-900 to-stone-950',
      border: 'border-amber-300/70',
    },
  }[card.type];

  return (
    <div
      onClick={!disabled ? onClick : undefined}
      className={`relative rounded-xl border bg-gradient-to-b ${specialMeta.bg} ${specialMeta.border} ${SIZE_CLASSES[size]} flex flex-col justify-between overflow-hidden select-none shadow-md transition-all ${interactiveClasses} ${selectedClasses} ${disabledClasses} ${className}`}
    >
      {showImage ? (
        <img
          src={resolvedImageUrl}
          alt={specialMeta.titleTr}
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover"
          draggable={false}
        />
      ) : (
        <>
          <div className="bg-black/60 px-2 py-1 border-b border-white/15 flex items-center justify-between">
            <span className="font-bold text-yellow-200 truncate">{specialMeta.titleTr}</span>
            <span className="bg-yellow-400 text-stone-950 font-black text-[10px] px-1.5 rounded-full">
              {specialMeta.vpText}
            </span>
          </div>
          <div className="flex-1 flex items-center justify-center p-2 text-center">
            <span className="text-[11px] text-amber-100 leading-tight">{specialMeta.descTr}</span>
          </div>
        </>
      )}
    </div>
  );
};
