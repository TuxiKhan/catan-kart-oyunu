'use client';

import React from 'react';
import { PublicPlayerState, StructureType, VillageSlot } from '../../types/game';
import { resolveCardImageUrl } from '../cards/CardVisual';
import { Crown, Shield, Trophy, WifiOff } from 'lucide-react';

export interface InspectCardInfo {
  imageUrl: string;
  title: string;
  subtitle?: string;
  description?: string;
  canBuild?: boolean;
  onBuild?: () => void;
}

export type OpponentCornerPosition = 'top-left' | 'top-right' | 'bottom-left';

export interface OpponentAreaProps {
  opponents: PublicPlayerState[];
  activePlayerId: string;
  onInspectCard?: (info: InspectCardInfo) => void;
  /** Tekil kadran/köşe görünümü için opsiyonel filtre */
  singleOpponent?: PublicPlayerState;
  cornerPosition?: OpponentCornerPosition;
}

export const STRUCTURE_CARD_DESCRIPTIONS: Record<
  StructureType,
  { title: string; subtitle: string; description: string; imageUrl: string }
> = {
  settlement: {
    title: 'KÖY (1 ZP)',
    subtitle: '1 Tuğla • 1 Odun • 1 Yün • 1 Buğday',
    description: '1 Zafer Puanı değerindedir. İnşa edildiğinde 1 Olay Kartı çekilir.',
    imageUrl: '/cards/building/building_settlement.png',
  },
  city: {
    title: 'ŞEHİR (2 ZP)',
    subtitle: '3 Demir • 2 Buğday (Köy Üzerine Kurulur)',
    description: '2 Zafer Puanı değerindedir. Sıra sendeyken üretim aşamasında +1 kaynak kartı kazandırır.',
    imageUrl: '/cards/building/building_city.png',
  },
  metropolis: {
    title: 'BÜYÜKŞEHİR (3 ZP)',
    subtitle: '3 Yün • 1 Demir (Şehir Üzerine Kurulur)',
    description: '3 Zafer Puanı değerindedir. Sıra sendeyken üretim aşamasında +2 kaynak kartı kazandırır.',
    imageUrl: '/cards/metropolis/metropolis_A.png',
  },
  road: {
    title: 'YOL',
    subtitle: '1 Tuğla • 1 Odun',
    description: 'Sıranda 1 kez liman takası oranı sağlar: 1 Yol = 4:1, 2 Yol = 3:1, 3 Yol = 2:1, 4 Yol = 1:1. En az 3 Yol ile En Uzun Yol (2 ZP) alınır.',
    imageUrl: '/cards/building/building_road.png',
  },
  knight: {
    title: 'ŞÖVALYE',
    subtitle: '1 Yün • 1 Buğday • 1 Demir',
    description: 'Hırsız el sınırı korumasını +1 artırır. En az 2 Şövalye ile En Güçlü Ordu (2 ZP) alınır.',
    imageUrl: '/cards/building/building_knight.png',
  },
};

/**
 * Köşelere yerleştirilen kapalı kaynak kartı yelpazesi (resource_back.png)
 */
export const CornerFaceDownFan: React.FC<{
  count: number;
  corner: OpponentCornerPosition;
  nickname?: string;
  onInspectCard?: (info: InspectCardInfo) => void;
}> = ({ count, corner, nickname, onInspectCard }) => {
  const visibleCount = Math.min(Math.max(count, 1), 5);
  const items = Array.from({ length: visibleCount }, (_, i) => i);

  const cornerAnchorClass =
    corner === 'top-left'
      ? '-top-2 -left-2 origin-top-left'
      : corner === 'top-right'
      ? '-top-2 -right-2 origin-top-right'
      : '-bottom-2 -left-2 origin-bottom-left';

  return (
    <button
      type="button"
      onClick={() =>
        onInspectCard?.({
          imageUrl: '/cards/resource/resource_back.png',
          title: `${nickname || 'Rakip'} — Kapalı El Destesi`,
          subtitle: `${count} Kaynak Kartı`,
          description: 'Rakibin elindeki kapalı hammadde kartları.',
        })
      }
      className={`group relative w-20 h-20 sm:w-28 sm:h-28 shrink-0 select-none cursor-pointer ${cornerAnchorClass}`}
      title={`${nickname || 'Rakip'}: ${count} Kapalı Kaynak Kartı`}
    >
      {items.map((idx) => {
        const offset = idx - (visibleCount - 1) / 2;
        const rot =
          corner === 'top-left'
            ? -22 + idx * 10
            : corner === 'top-right'
            ? 22 - idx * 10
            : -18 + idx * 9;
        const tx =
          corner === 'top-right' ? -idx * 7 : idx * 7;
        const ty =
          corner === 'bottom-left' ? -idx * 4 : idx * 4;

        return (
          <img
            key={idx}
            src="/cards/resource/resource_back.png"
            alt="Kapalı Kaynak Kartı"
            draggable={false}
            style={{
              transform: `translate3d(${tx}px, ${ty}px, 0) rotate(${rot}deg)`,
              zIndex: idx + 1,
            }}
            className={`w-12 sm:w-16 md:w-20 aspect-[2.5/3.5] object-cover rounded-lg border border-amber-100/60 shadow-[0_6px_14px_rgba(0,0,0,0.65)] transition-transform group-hover:scale-105 absolute ${
              corner === 'top-right'
                ? 'top-1 right-1'
                : corner === 'bottom-left'
                ? 'bottom-1 left-1'
                : 'top-1 left-1'
            } ${offset === 0 ? '' : ''}`}
          />
        );
      })}
      <span
        className={`absolute z-20 bg-amber-400 text-stone-950 font-black text-[10px] sm:text-xs px-1.5 py-0.5 rounded-full shadow-md border border-stone-900 ${
          corner === 'top-right'
            ? 'bottom-2 right-2'
            : corner === 'bottom-left'
            ? 'top-2 left-2'
            : 'bottom-2 left-2'
        }`}
      >
        {count}
      </span>
    </button>
  );
};

/**
 * Üst üste istiflenen Yol ve Şövalye kartları (kompakt masa boyutu)
 */
export const CascadingStructureStack: React.FC<{
  type: 'road' | 'knight';
  count: number;
  compact?: boolean;
  onInspectCard?: (info: InspectCardInfo) => void;
}> = ({ type, count, compact = false, onInspectCard }) => {
  if (count <= 0) return null;

  const visibleCount = Math.min(count, 4);
  const items = Array.from({ length: visibleCount }, (_, idx) => idx);
  const stepPx = compact ? 12 : 15;
  const meta = STRUCTURE_CARD_DESCRIPTIONS[type];

  return (
    <div
      onClick={() =>
        onInspectCard?.({
          imageUrl: meta.imageUrl,
          title: `${meta.title} (x${count})`,
          subtitle: meta.subtitle,
          description: meta.description,
        })
      }
      className={`relative ${
        compact ? 'w-14 sm:w-18 md:w-20' : 'w-16 sm:w-20 md:w-24'
      } select-none cursor-pointer group shrink-0`}
      style={{
        paddingBottom: `${(visibleCount - 1) * stepPx}px`,
      }}
      title={`${meta.title} (${count} Adet)`}
    >
      <div className="relative w-full aspect-[2.5/3.5]">
        {items.map((idx) => (
          <img
            key={idx}
            src={meta.imageUrl}
            alt={meta.title}
            draggable={false}
            style={{ top: `${idx * stepPx}px`, zIndex: idx + 1 }}
            className="absolute inset-x-0 w-full aspect-[2.5/3.5] object-cover rounded-lg border border-amber-100/50 shadow-[0_6px_14px_rgba(0,0,0,0.65)] transition-transform group-hover:-translate-y-0.5"
          />
        ))}
        {count > 1 && (
          <span
            style={{ zIndex: visibleCount + 2 }}
            className="absolute -top-1.5 -right-1.5 bg-amber-400 text-stone-950 font-black text-[10px] px-1.5 py-0.5 rounded-full shadow border border-stone-900"
          >
            x{count}
          </span>
        )}
      </div>
    </div>
  );
};

/**
 * Taslaktaki Köy + Şehir / Büyükşehir İstifi:
 * Köy kartı altta durur ve sarı "KÖY" başlık şeridi görünür;
 * Şehir veya Büyükşehir kartı dikey ofsetle (mt-3.5 / top-3.5) üzerine biner.
 */
export const VillageSlotVisual: React.FC<{
  slot: VillageSlot;
  index: number;
  compact?: boolean;
  onInspectCard?: (info: InspectCardInfo) => void;
}> = ({ slot, index, compact = false, onInspectCard }) => {
  const widthClass = compact
    ? 'w-14 sm:w-20 md:w-24'
    : 'w-16 sm:w-22 md:w-26';

  const metropolisImg =
    slot.upgradedTo === 'metropolis'
      ? resolveCardImageUrl({
          category: 'structure',
          type: 'metropolis',
          face: slot.metropolisCard?.face || 'A',
          bVariantId: slot.metropolisCard?.bVariantId,
        }) || '/cards/metropolis/metropolis_A.png'
      : '/cards/metropolis/metropolis_A.png';

  const handleInspect = (type: StructureType) => {
    const meta = STRUCTURE_CARD_DESCRIPTIONS[type];
    onInspectCard?.({
      imageUrl: type === 'metropolis' ? metropolisImg : meta.imageUrl,
      title:
        type === 'metropolis' && slot.metropolisCard?.titleTr
          ? `${slot.metropolisCard.titleTr} (3 ZP)`
          : meta.title,
      subtitle: meta.subtitle,
      description:
        type === 'metropolis' && slot.metropolisCard?.descriptionTr
          ? slot.metropolisCard.descriptionTr
          : meta.description,
    });
  };

  return (
    <div
      className={`relative ${widthClass} shrink-0 select-none`}
      aria-label={`Yerleşim Slotu #${index + 1}`}
    >
      {/* Taban Katmanı: KÖY Kartı (Her zaman altta, üst sarı "KÖY" barı görünür) */}
      <div
        onClick={() => handleInspect(slot.upgradedTo === 'none' ? 'settlement' : slot.upgradedTo)}
        className="relative w-full aspect-[2.5/3.5] cursor-pointer group"
      >
        <img
          src="/cards/building/building_settlement.png"
          alt="KÖY"
          draggable={false}
          className="w-full h-full object-cover rounded-lg border border-amber-100/60 shadow-[0_6px_16px_rgba(0,0,0,0.7)] transition-transform group-hover:-translate-y-0.5"
        />
        {slot.hasFirstPlayerMarker && slot.upgradedTo === 'none' && (
          <span className="absolute bottom-1 right-1 z-10 bg-amber-400 text-stone-950 font-black text-[9px] px-1 rounded shadow">
            ★
          </span>
        )}
      </div>

      {/* Üst Katman 1: ŞEHİR Kartı (Köy'ün sarı başlığı üstte kalacak şekilde mt-3.5 / top-3.5 ofsetli) */}
      {(slot.upgradedTo === 'city' || slot.upgradedTo === 'metropolis') && (
        <div
          onClick={() => handleInspect(slot.upgradedTo === 'metropolis' ? 'metropolis' : 'city')}
          className="relative -mt-[118%] pt-3 sm:pt-4 z-10 cursor-pointer group"
        >
          <img
            src="/cards/building/building_city.png"
            alt="ŞEHİR"
            draggable={false}
            className="w-full aspect-[2.5/3.5] object-cover rounded-lg border border-amber-100/60 shadow-[0_8px_18px_rgba(0,0,0,0.75)] transition-transform group-hover:-translate-y-0.5"
          />
        </div>
      )}

      {/* Üst Katman 2: BÜYÜKŞEHİR Kartı (Şehir'in başlığı üstte kalacak şekilde ikinci ofset) */}
      {slot.upgradedTo === 'metropolis' && (
        <div
          onClick={() => handleInspect('metropolis')}
          className="relative -mt-[118%] pt-3 sm:pt-4 z-20 cursor-pointer group"
        >
          <img
            src={metropolisImg}
            alt="BÜYÜKŞEHİR"
            draggable={false}
            className="w-full aspect-[2.5/3.5] object-cover rounded-lg border-2 border-yellow-400 shadow-[0_10px_22px_rgba(0,0,0,0.85)] transition-transform group-hover:-translate-y-0.5"
          />
        </div>
      )}
    </div>
  );
};

/**
 * Tek bir rakibin masa üzerindeki yerleşimi (Köşe kapalı el yelpazesi + Köy/Şehir ve diğer yapılar)
 */
export const OpponentQuadrantSeat: React.FC<{
  opponent: PublicPlayerState;
  isCurrentTurn: boolean;
  corner: OpponentCornerPosition;
  onInspectCard?: (info: InspectCardInfo) => void;
}> = ({ opponent, isCurrentTurn, corner, onInspectCard }) => {
  const isRight = corner === 'top-right';

  // Görsel taslaktaki simetri: Sol oyuncuda [Köy, Köy+Şehir], Sağ oyuncuda [Köy+Şehir, Köy]
  const orderedSlots = isRight
    ? [...opponent.villageSlots].sort((a, b) =>
        a.upgradedTo !== 'none' && b.upgradedTo === 'none' ? -1 : 1
      )
    : [...opponent.villageSlots].sort((a, b) =>
        a.upgradedTo === 'none' && b.upgradedTo !== 'none' ? -1 : 1
      );

  return (
    <div
      className={`relative flex flex-col justify-between h-full w-full p-1.5 sm:p-2.5 ${
        isRight ? 'items-end' : 'items-start'
      }`}
    >
      {/* Rakip Kompakt Bilgi Rozeti */}
      <div
        className={`z-30 flex items-center gap-1.5 px-2.5 py-1 rounded-full border backdrop-blur-xs shadow-md text-[11px] sm:text-xs mb-1 ${
          isCurrentTurn
            ? 'bg-amber-950/90 border-yellow-400 text-amber-50 ring-2 ring-yellow-400/40'
            : 'bg-black/45 border-white/20 text-amber-100/95'
        }`}
      >
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${
            opponent.isConnected ? 'bg-emerald-400' : 'bg-rose-500'
          }`}
        />
        <span className="font-bold truncate max-w-[96px] sm:max-w-[130px]">
          {opponent.nickname}
        </span>
        <span className="inline-flex items-center gap-0.5 bg-yellow-400 text-stone-950 font-black px-1.5 py-0.2 rounded-full text-[10px]">
          <Trophy className="w-2.5 h-2.5" />
          {opponent.victoryPoints} ZP
        </span>
        {isCurrentTurn && (
          <span className="bg-emerald-400 text-stone-950 font-extrabold text-[9px] px-1.5 py-0.2 rounded-full animate-pulse">
            Sırada
          </span>
        )}
        {!opponent.isConnected && <WifiOff className="w-3 h-3 text-rose-400" />}
        {opponent.hasLongestRoad && (
          <span title="En Uzun Yol (+2 ZP)">
            <Crown className="w-3.5 h-3.5 text-yellow-400" />
          </span>
        )}
        {opponent.hasLargestArmy && (
          <span title="En Güçlü Ordu (+2 ZP)">
            <Shield className="w-3.5 h-3.5 text-rose-400" />
          </span>
        )}
      </div>

      {/* Köşe El Yelpazesi + Rakip Binaları */}
      <div
        className={`flex items-start justify-between w-full gap-2 sm:gap-4 ${
          isRight ? 'flex-row-reverse' : 'flex-row'
        }`}
      >
        {/* Köşedeki Kapalı El Yelpazesi */}
        <CornerFaceDownFan
          count={opponent.handCount}
          corner={corner}
          nickname={opponent.nickname}
          onInspectCard={onInspectCard}
        />

        {/* Rakibin Masa Üzerindeki Binaları (Köy / Şehir İstifi + Yol / Şövalye) */}
        <div
          className={`flex items-start gap-1.5 sm:gap-2.5 flex-wrap ${
            isRight ? 'justify-end mr-auto pl-2' : 'justify-start ml-auto pr-2'
          }`}
        >
          {orderedSlots.map((slot, idx) => (
            <VillageSlotVisual
              key={slot.id}
              slot={slot}
              index={idx}
              compact
              onInspectCard={onInspectCard}
            />
          ))}

          {opponent.roadsCount > 1 && (
            <CascadingStructureStack
              type="road"
              count={opponent.roadsCount}
              compact
              onInspectCard={onInspectCard}
            />
          )}

          {opponent.knightsCount > 0 && (
            <CascadingStructureStack
              type="knight"
              count={opponent.knightsCount}
              compact
              onInspectCard={onInspectCard}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export const OpponentArea: React.FC<OpponentAreaProps> = ({
  opponents,
  activePlayerId,
  onInspectCard,
  singleOpponent,
  cornerPosition,
}) => {
  if (singleOpponent) {
    return (
      <OpponentQuadrantSeat
        opponent={singleOpponent}
        isCurrentTurn={singleOpponent.playerId === activePlayerId}
        corner={cornerPosition || 'top-left'}
        onInspectCard={onInspectCard}
      />
    );
  }

  const topOpponents = opponents.slice(0, 2);

  return (
    <section
      aria-label="Rakiplerin Alanı"
      className="relative grid grid-cols-2 gap-2 sm:gap-6 w-full items-start"
    >
      {/* Üst Orta "masa" Başlığı (Görsel Taslaklara Birebir Sadık) */}
      <div className="pointer-events-none absolute top-1 left-1/2 -translate-x-1/2 z-20">
        <span className="text-xs sm:text-sm font-medium text-white/90 tracking-wide">
          masa
        </span>
      </div>

      {topOpponents.map((opp, idx) => {
        const corner: OpponentCornerPosition = idx === 0 ? 'top-left' : 'top-right';
        return (
          <OpponentQuadrantSeat
            key={opp.playerId}
            opponent={opp}
            isCurrentTurn={opp.playerId === activePlayerId}
            corner={corner}
            onInspectCard={onInspectCard}
          />
        );
      })}
    </section>
  );
};
