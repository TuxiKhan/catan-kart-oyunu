'use client';

import React, { useState } from 'react';
import { ResourceType, RESOURCE_LABELS_TR } from '../../types/game';
import { CardVisual } from '../cards/CardVisual';

export type ResourceCard = ResourceType | { id?: string; type: ResourceType };

export interface FannedHandProps {
  hand: ResourceCard[];
  selectedIndices?: number[];
  onToggleSelect?: (index: number, card: ResourceCard) => void;
  onInspectCard?: (card: ResourceCard) => void;
  isFourPlayer?: boolean;
  align?: 'bottom-center' | 'bottom-right';
  isReviewOpen?: boolean;
  onReviewOpenChange?: (open: boolean) => void;
  className?: string;
}

function toResourceType(card: ResourceCard): ResourceType {
  return typeof card === 'string' ? card : card.type;
}

export const FannedHand: React.FC<FannedHandProps> = ({
  hand,
  selectedIndices = [],
  onToggleSelect,
  onInspectCard,
  isFourPlayer = false,
  align,
  isReviewOpen: controlledReviewOpen,
  onReviewOpenChange,
  className = '',
}) => {
  const [internalReviewOpen, setInternalReviewOpen] = useState(false);
  const isReviewOpen = controlledReviewOpen ?? internalReviewOpen;

  const setReviewOpen = (next: boolean) => {
    if (controlledReviewOpen === undefined) {
      setInternalReviewOpen(next);
    }
    onReviewOpenChange?.(next);
  };

  const isCorner = isFourPlayer || align === 'bottom-right';
  const count = hand.length;
  const mid = (count - 1) / 2;

  if (count === 0) {
    return (
      <div
        className={`pointer-events-auto select-none rounded-full bg-black/45 border border-amber-300/25 px-3 py-1 text-xs text-amber-100/75 ${className}`}
      >
        Elinde kaynak kartı yok
      </div>
    );
  }

  return (
    <>
      {isReviewOpen && (
        <div
          aria-label="El inceleme görünümünü kapat"
          onClick={() => setReviewOpen(false)}
          className="fixed inset-0 z-40 bg-black/35 transition-opacity duration-300"
        />
      )}

      <div
        className={`relative ${
          isReviewOpen ? 'z-50' : 'z-30'
        } select-none flex flex-col ${
          isCorner ? 'items-end' : 'items-center'
        } ${className}`}
      >
        {/* Eli İncele / Küçült kontrol hapı */}
        <div className="mb-1.5 flex items-center gap-1.5 pointer-events-auto">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setReviewOpen(!isReviewOpen);
            }}
            className="rounded-full bg-stone-950/85 hover:bg-stone-900 text-amber-100 border border-amber-400/40 px-3 py-1 text-[11px] font-bold shadow-md transition cursor-pointer"
          >
            {isReviewOpen ? 'Eli Küçült' : `Eli İncele (${count})`}
          </button>
        </div>

        {/* Yelpaze Kart Dizilimi */}
        <div
          onClick={() => {
            if (!isReviewOpen) setReviewOpen(true);
          }}
          className={`relative flex items-end justify-center pointer-events-auto ${
            isReviewOpen
              ? isCorner
                ? 'h-56 sm:h-64 w-80 sm:w-[440px] pr-4 pb-2'
                : 'h-56 sm:h-64 w-80 sm:w-[480px] pb-2'
              : isCorner
              ? 'h-28 sm:h-32 w-48 sm:w-56 cursor-pointer'
              : 'h-28 sm:h-32 w-56 sm:w-64 cursor-pointer'
          } transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]`}
        >
          {hand.map((card, index) => {
            const resType = toResourceType(card);
            const offset = index - mid;
            const absOffset = Math.abs(offset);
            const isSelected = selectedIndices.includes(index);

            // 3P simetrik yelpaze vs 4P sağ-alt köşe diyagonal yelpaze açısı ve yayılımı
            const angleStep = isReviewOpen
              ? Math.min(11, 48 / Math.max(1, count - 1))
              : Math.min(8, 34 / Math.max(1, count - 1));
            const rotateDeg = isCorner
              ? offset * angleStep - (isReviewOpen ? 16 : 12)
              : offset * angleStep;

            const xStep = isReviewOpen
              ? Math.min(62, 270 / Math.max(1, count))
              : Math.min(24, 110 / Math.max(1, count));
            const translateX = isCorner
              ? offset * xStep - (isReviewOpen ? 36 : 10)
              : offset * xStep;

            const arcDrop = isReviewOpen ? 7 : 3.5;
            const cornerLift = isCorner && isReviewOpen ? (count - 1 - index) * 14 : 0;
            const translateY =
              absOffset * absOffset * arcDrop -
              cornerLift -
              (isSelected ? (isReviewOpen ? 18 : 10) : 0);

            const scale = isReviewOpen ? 1.55 : 1;

            return (
              <div
                key={typeof card === 'object' && card.id ? card.id : `${resType}-${index}`}
                draggable={true}
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    'application/json',
                    JSON.stringify({
                      source: 'hand',
                      resourceType: resType,
                      index,
                    })
                  );
                  e.dataTransfer.setData('text/plain', resType);
                  e.dataTransfer.effectAllowed = 'copyMove';
                }}
                style={{
                  transform: `translateX(${translateX}px) translateY(${translateY}px) rotate(${rotateDeg}deg) scale(${scale})`,
                  transformOrigin: '50% 100%',
                  zIndex: index + 1,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isReviewOpen) {
                    setReviewOpen(true);
                    return;
                  }
                  if (onToggleSelect) {
                    onToggleSelect(index, card);
                  } else if (onInspectCard) {
                    onInspectCard(card);
                  }
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onInspectCard?.(card);
                }}
                title={`${RESOURCE_LABELS_TR[resType]} (Sürükle / Seç / İncele)`}
                className="absolute bottom-0 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:!z-30 cursor-grab active:cursor-grabbing"
              >
                <CardVisual
                  card={{ category: 'resource', type: resType }}
                  size="sm"
                  selected={isSelected}
                  className="shadow-[0_10px_28px_rgba(0,0,0,0.65)] rounded-lg border-amber-100/60"
                />
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};

export default FannedHand;
