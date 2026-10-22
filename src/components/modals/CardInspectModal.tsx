'use client';

import React, { useEffect } from 'react';
import { CardKind, CardVisual, resolveCardImageUrl } from '../cards/CardVisual';

export interface CardInspectModalProps {
  card: CardKind | null;
  isOpen?: boolean;
  onClose: () => void;
  canBuild?: boolean;
  onBuild?: () => void;
  buildLabel?: string;
  customImageUrl?: string;
  subtitle?: string;
}

export const CardInspectModal: React.FC<CardInspectModalProps> = ({
  card,
  isOpen = true,
  onClose,
  canBuild = false,
  onBuild,
  buildLabel = 'İnşa Et',
  customImageUrl,
  subtitle,
}) => {
  useEffect(() => {
    if (!card || !isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [card, isOpen, onClose]);

  if (!card || !isOpen) return null;

  const resolvedUrl = resolveCardImageUrl(card, customImageUrl);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Kart İnceleme"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col items-center gap-3"
      >
        {/* Büyük Türkçe Kart Görseli */}
        <div
          onClick={onClose}
          className="relative w-64 sm:w-72 md:w-80 aspect-[2.5/3.5] rounded-2xl shadow-[0_25px_70px_rgba(0,0,0,0.85)] border-2 border-amber-300/60 overflow-hidden transition-transform duration-300 scale-100 cursor-pointer bg-stone-950"
        >
          {resolvedUrl ? (
            <img
              src={resolvedUrl}
              alt="İncelenen Kart"
              className="w-full h-full object-cover select-none"
              draggable={false}
            />
          ) : (
            <CardVisual
              card={card}
              size="lg"
              customImageUrl={customImageUrl}
              className="!w-full !h-full"
            />
          )}
        </div>

        {subtitle && (
          <p className="text-xs font-semibold text-amber-100 bg-black/65 border border-amber-300/30 px-3 py-1 rounded-full shadow">
            {subtitle}
          </p>
        )}

        {/* Kompakt Aksiyon Çubuğu */}
        <div className="flex items-center gap-2.5">
          {canBuild && onBuild && (
            <button
              type="button"
              onClick={() => {
                onBuild();
                onClose();
              }}
              className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-extrabold text-xs sm:text-sm shadow-lg ring-2 ring-emerald-300/80 transition cursor-pointer"
            >
              {buildLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-stone-900/90 hover:bg-stone-800 text-amber-100 border border-amber-300/40 font-bold text-xs sm:text-sm shadow-lg transition cursor-pointer"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};

export default CardInspectModal;
