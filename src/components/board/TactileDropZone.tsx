'use client';

import React, { useState } from 'react';
import { BuildingCardType, StructureType } from '@/types/game';
import { Hammer, Sparkles } from 'lucide-react';

export interface TactileDropZoneProps {
  canAct: boolean;
  selectedCard: {
    marketIndex: number | 'metropolis';
    cardType: StructureType;
    title?: string;
  } | null;
  onDropCard: (cardType: StructureType, marketIndex?: number) => void;
  onClearSelectedCard?: () => void;
  className?: string;
}

/**
 * Dokunsal Kart Bırakma / İnşa Alanı (Tactile Hearthstone / Tabletop Drop Zone)
 * Masanın zemininde şık, kesikli altın çizgili bir keçe alanıdır.
 * Pazardan sürüklenen kartlar buraya bırakılınca veya seçilen karta dokunulup
 * buraya basılınca doğrudan inşa edilir.
 */
export const TactileDropZone: React.FC<TactileDropZoneProps> = ({
  canAct,
  selectedCard,
  onDropCard,
  onClearSelectedCard,
  className = '',
}) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    if (!canAct) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!canAct) return;
    e.preventDefault();
    setIsDragOver(false);

    try {
      const raw = e.dataTransfer.getData('application/json');
      if (raw) {
        const data = JSON.parse(raw);
        if (data.source === 'market' || data.source === 'metropolis') {
          onDropCard(
            data.cardType,
            data.source === 'metropolis' ? undefined : data.marketIndex
          );
          return;
        }
      }
      const plain = e.dataTransfer.getData('text/plain') as StructureType;
      if (plain) {
        onDropCard(plain);
      }
    } catch (err) {
      console.error('Tactile drop error:', err);
    }
  };

  const handleClick = () => {
    if (!canAct || !selectedCard) return;
    onDropCard(
      selectedCard.cardType,
      selectedCard.marketIndex === 'metropolis' ? undefined : selectedCard.marketIndex
    );
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label="Dokunsal İnşaat ve Kart Bırakma Alanı"
      className={`relative select-none rounded-2xl border-2 border-dashed transition-all duration-300 flex items-center justify-between px-3 py-2 sm:px-4 sm:py-2.5 ${
        isDragOver
          ? 'border-emerald-400 bg-emerald-950/70 shadow-[0_0_24px_rgba(52,211,153,0.5)] scale-[1.01] ring-2 ring-emerald-400/60'
          : selectedCard
          ? 'border-amber-400/90 bg-amber-950/40 shadow-[0_0_16px_rgba(251,191,36,0.35)] animate-pulse cursor-pointer hover:bg-amber-900/50'
          : 'border-amber-500/25 bg-black/25 hover:border-amber-400/40'
      } ${className}`}
    >
      <div className="flex items-center gap-2">
        <div
          className={`p-1.5 rounded-xl border ${
            isDragOver
              ? 'bg-emerald-500/30 border-emerald-400 text-emerald-200'
              : selectedCard
              ? 'bg-amber-500/30 border-amber-400 text-yellow-300 animate-bounce'
              : 'bg-stone-900/80 border-amber-500/20 text-amber-300/70'
          }`}
        >
          {selectedCard ? (
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
          ) : (
            <Hammer className="w-4 h-4 sm:w-5 sm:h-5" />
          )}
        </div>

        <div className="flex flex-col text-left">
          <span className="text-[11px] sm:text-xs font-black tracking-wide text-amber-100 flex items-center gap-1.5">
            {isDragOver
              ? 'KARTI BIRAK VE İNŞA ET'
              : selectedCard
              ? `SEÇİLEN [${selectedCard.title || selectedCard.cardType.toUpperCase()}] KARTINI BURAYA KUR`
              : 'DOKUNSAL İNŞA ALANI'}
          </span>
          <span className="text-[9px] sm:text-[10px] text-amber-200/70">
            {isDragOver
              ? 'Kaynaklar doğrulanıp yapı hemen masaya yerleşecek'
              : selectedCard
              ? 'İnşaatı tamamlamak için dokun (veya iptal et)'
              : 'Pazardan kartı sürükleyip buraya bırakın veya karta dokunun'}
          </span>
        </div>
      </div>

      {selectedCard && onClearSelectedCard && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClearSelectedCard();
          }}
          className="px-2 py-0.5 rounded-lg bg-stone-900/90 hover:bg-rose-950 border border-stone-700 text-stone-300 hover:text-rose-200 text-[10px] font-bold cursor-pointer transition"
        >
          İptal
        </button>
      )}
    </div>
  );
};
