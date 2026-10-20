'use client';

import React, { useState } from 'react';
import {
  ResourceType,
  RESOURCE_LABELS_TR,
} from '../../types/game';
import { CardVisual } from '../cards/CardVisual';
import { getHarborRequiredCount } from '../board/PlayerBoard';
import { Anchor, ArrowRight, X } from 'lucide-react';

export interface HarborModalProps {
  isOpen: boolean;
  roadsCount: number;
  myHand: ResourceType[];
  onClose: () => void;
  onConfirmHarborTrade: (
    giveResource: ResourceType,
    takeResource: ResourceType
  ) => void;
}

const ALL_RESOURCES: ResourceType[] = ['brick', 'wood', 'wool', 'wheat', 'ore'];

export const HarborModal: React.FC<HarborModalProps> = ({
  isOpen,
  roadsCount,
  myHand,
  onClose,
  onConfirmHarborTrade,
}) => {
  const requiredGiveCount = getHarborRequiredCount(roadsCount);

  const counts: Record<ResourceType, number> = {
    brick: 0,
    wood: 0,
    wool: 0,
    wheat: 0,
    ore: 0,
  };
  for (const r of myHand) {
    counts[r] = (counts[r] || 0) + 1;
  }

  const eligibleGiveResources = ALL_RESOURCES.filter(
    (r) => counts[r] >= requiredGiveCount
  );

  const [selectedGive, setSelectedGive] = useState<ResourceType | null>(
    eligibleGiveResources[0] ?? null
  );
  const [selectedTake, setSelectedTake] = useState<ResourceType>('wheat');

  if (!isOpen) return null;

  const activeGive =
    selectedGive && counts[selectedGive] >= requiredGiveCount
      ? selectedGive
      : eligibleGiveResources[0] ?? null;

  const canSubmit =
    Boolean(activeGive) &&
    Boolean(selectedTake) &&
    activeGive !== selectedTake;

  const handleConfirm = () => {
    if (!activeGive || !canSubmit) return;
    onConfirmHarborTrade(activeGive, selectedTake);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 md:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="harbor-modal-title"
    >
      <div className="relative w-full max-w-xl rounded-2xl border-2 border-amber-400/80 bg-gradient-to-b from-stone-900 via-stone-950 to-black text-amber-50 shadow-2xl overflow-hidden my-auto">
        {/* Başlık */}
        <div className="flex items-center justify-between px-4 py-3 bg-amber-950/80 border-b border-amber-500/30">
          <div className="flex items-center gap-2">
            <Anchor className="w-5 h-5 text-amber-400" />
            <h2 id="harbor-modal-title" className="text-base md:text-lg font-extrabold text-amber-100">
              Yol (Liman Etkisi) Takası — Oran {requiredGiveCount}:1
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 cursor-pointer"
            aria-label="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 md:p-5 space-y-5">
          {/* Yol Sayısı & Oran Bilgisi */}
          <div className="rounded-xl bg-amber-500/10 border border-amber-400/30 p-3 text-xs text-amber-100">
            Toplam <strong>{roadsCount} Yol</strong> kartın (İlk Yol dahil) bulunduğu için bu turda{' '}
            <strong>{requiredGiveCount} adet aynı tür kaynağı</strong> ıskartaya bırakıp, çekme veya ıskarta destesinden{' '}
            <strong>istediğin 1 kaynağı seçerek</strong> alabilirsin.
          </div>

          {/* 1. Verilecek Aynı Tür Kaynağı Seç */}
          <div>
            <h3 className="text-xs md:text-sm font-bold text-amber-200 mb-2">
              1. Vereceğin Kaynak Türünü Seç ({requiredGiveCount} Adet Aynı Tür):
            </h3>
            <div className="flex items-center gap-2.5 overflow-x-auto py-2 px-1">
              {ALL_RESOURCES.map((res) => {
                const count = counts[res];
                const eligible = count >= requiredGiveCount;
                const isSelected = activeGive === res;

                return (
                  <div key={res} className="flex flex-col items-center shrink-0">
                    <CardVisual
                      card={{ category: 'resource', type: res }}
                      size="xs"
                      countBadge={count}
                      selected={isSelected}
                      disabled={!eligible}
                      onClick={eligible ? () => setSelectedGive(res) : undefined}
                    />
                    <span className="mt-1 text-[11px] font-bold text-stone-200">
                      {RESOURCE_LABELS_TR[res]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Alınacak İstediğin Kaynak Türünü Seç */}
          <div>
            <h3 className="text-xs md:text-sm font-bold text-emerald-300 mb-2">
              2. Karşılığında Almak İstediğin 1 Kaynak Türünü Seç:
            </h3>
            <div className="flex items-center gap-2.5 overflow-x-auto py-2 px-1">
              {ALL_RESOURCES.map((res) => {
                const isSameAsGive = activeGive === res;
                const isSelected = selectedTake === res && !isSameAsGive;

                return (
                  <div key={res} className="flex flex-col items-center shrink-0">
                    <CardVisual
                      card={{ category: 'resource', type: res }}
                      size="xs"
                      selected={isSelected}
                      disabled={isSameAsGive}
                      onClick={!isSameAsGive ? () => setSelectedTake(res) : undefined}
                    />
                    <span className="mt-1 text-[11px] font-bold text-stone-200">
                      {RESOURCE_LABELS_TR[res]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Özet Çubuğu */}
          {activeGive && (
            <div className="flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl bg-stone-900 border border-white/10 text-xs md:text-sm font-bold">
              <span className="text-amber-300">
                {requiredGiveCount}x {RESOURCE_LABELS_TR[activeGive]} Ver
              </span>
              <ArrowRight className="w-4 h-4 text-stone-400" />
              <span className="text-emerald-300">
                1x {RESOURCE_LABELS_TR[selectedTake]} Al
              </span>
            </div>
          )}
        </div>

        {/* Alt Butonlar */}
        <div className="px-4 py-3 bg-stone-950 border-t border-white/10 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold text-xs md:text-sm cursor-pointer"
          >
            Vazgeç
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleConfirm}
            className={`px-5 py-2 rounded-xl font-extrabold text-xs md:text-sm transition ${
              canSubmit
                ? 'bg-amber-500 hover:bg-amber-400 text-stone-950 cursor-pointer shadow'
                : 'bg-stone-800 text-stone-500 cursor-not-allowed'
            }`}
          >
            Liman Takasını Onayla
          </button>
        </div>
      </div>
    </div>
  );
};
