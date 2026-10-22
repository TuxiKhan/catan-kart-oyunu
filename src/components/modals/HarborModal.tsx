'use client';

import React, { useState } from 'react';
import {
  ResourceType,
  RESOURCE_LABELS_TR,
} from '../../types/game';
import { getHarborRequiredCount } from '../board/PlayerBoard';
import { Anchor, ArrowLeftRight, ArrowRight, CheckCircle2, Sparkles, X } from 'lucide-react';

export interface HarborModalProps {
  isOpen: boolean;
  roadsCount: number;
  myHand: ResourceType[];
  onClose: () => void;
  onConfirmHarborTrade: (
    giveResource: ResourceType,
    takeResource: ResourceType
  ) => void;
  hasMetropolisB3?: boolean;
  onSwitchToPlayerTrade?: () => void;
}

const ALL_RESOURCES: ResourceType[] = ['brick', 'wood', 'wool', 'wheat', 'ore'];

export function getResourceImage(res: ResourceType): string {
  return `/cards/resource/resource_${res}.png`;
}

export const HarborModal: React.FC<HarborModalProps> = ({
  isOpen,
  roadsCount,
  myHand,
  onClose,
  onConfirmHarborTrade,
  hasMetropolisB3 = false,
  onSwitchToPlayerTrade,
}) => {
  const requiredGiveCount = hasMetropolisB3 ? 1 : getHarborRequiredCount(roadsCount);

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-[2px] p-3 md:p-5 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="harbor-modal-title"
    >
      <div className="relative w-full max-w-xl bg-[#3b0404]/95 border-2 border-amber-400/50 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.85)] text-amber-50 overflow-hidden my-auto">
        {/* Başlık ve Sekme Geçişi */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-[#240203]/90 border-b border-amber-400/30">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-400/40">
              <Anchor className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="harbor-modal-title" className="text-sm md:text-base font-extrabold text-amber-100">
                  Deniz / Liman Takası
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 text-stone-950 font-black text-xs shadow">
                  Oran {requiredGiveCount}:1
                </span>
              </div>
              <p className="text-[11px] text-amber-200/75">
                {roadsCount} Yol Kartı {hasMetropolisB3 ? '• Büyükşehir (B-3) 1:1 Liman Gücü' : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="flex items-center bg-[#160102] p-1 rounded-xl border border-amber-400/30 text-xs">
              {onSwitchToPlayerTrade && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onSwitchToPlayerTrade();
                  }}
                  className="px-2.5 py-1 rounded-lg text-amber-200/80 hover:text-amber-100 hover:bg-amber-500/15 font-bold flex items-center gap-1 transition cursor-pointer"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400" />
                  Oyuncu Takası
                </button>
              )}
              <span className="px-2.5 py-1 rounded-lg bg-amber-500 text-stone-950 font-extrabold flex items-center gap-1 shadow">
                <Anchor className="w-3.5 h-3.5" />
                Liman ({requiredGiveCount}:1)
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-amber-200/70 hover:text-amber-100 hover:bg-white/10 transition cursor-pointer"
              aria-label="Kapat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Yol Sayısı & Oran Rozet Çubuğu */}
          <div className="rounded-xl bg-[#240203]/80 border border-amber-400/30 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-100">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>{requiredGiveCount} adet aynı tür</strong> kaynağı verip çekme/ıskarta destesinden{' '}
                <strong>istediğin 1 kaynağı</strong> al.
              </span>
            </div>
            <div className="flex items-center gap-1 text-[10px] font-bold">
              {[
                { roads: '1 Yol', rate: '4:1', val: 4 },
                { roads: '2 Yol', rate: '3:1', val: 3 },
                { roads: '3 Yol', rate: '2:1', val: 2 },
                { roads: '4+ Yol', rate: '1:1', val: 1 },
              ].map((tier) => (
                <span
                  key={tier.rate}
                  className={`px-1.5 py-0.5 rounded border ${
                    requiredGiveCount === tier.val
                      ? 'bg-amber-400 text-stone-950 border-amber-200 font-black shadow'
                      : 'bg-black/40 text-amber-200/50 border-white/10'
                  }`}
                >
                  {tier.rate}
                </span>
              ))}
            </div>
          </div>

          {/* 1. Verilecek Aynı Tür Kaynağı Seç */}
          <div className="p-3 rounded-xl bg-[#240203]/85 border border-amber-400/30 space-y-2">
            <h3 className="text-xs font-extrabold text-amber-300">
              1. Verilecek Kaynak Türü ({requiredGiveCount} Adet Aynı Tür):
            </h3>
            <div className="grid grid-cols-5 gap-2">
              {ALL_RESOURCES.map((res) => {
                const count = counts[res];
                const eligible = count >= requiredGiveCount;
                const isSelected = activeGive === res;

                return (
                  <button
                    key={res}
                    type="button"
                    disabled={!eligible}
                    onClick={() => setSelectedGive(res)}
                    className={`relative flex flex-col items-center p-1.5 rounded-xl border transition ${
                      isSelected
                        ? 'bg-amber-500/30 border-amber-300 ring-2 ring-amber-400 shadow-lg -translate-y-0.5'
                        : eligible
                        ? 'bg-[#1a0203]/90 border-amber-400/30 hover:border-amber-300 cursor-pointer'
                        : 'bg-black/40 border-white/5 opacity-40 cursor-not-allowed'
                    }`}
                  >
                    <div className="relative w-full aspect-[3/4] rounded-lg overflow-hidden border border-amber-200/30">
                      <img
                        src={getResourceImage(res)}
                        alt={RESOURCE_LABELS_TR[res]}
                        className="w-full h-full object-cover"
                      />
                      <span
                        className={`absolute bottom-1 right-1 px-1.5 py-0.5 rounded-full text-[10px] font-black shadow ${
                          eligible
                            ? 'bg-amber-400 text-stone-950'
                            : 'bg-stone-900/90 text-stone-400'
                        }`}
                      >
                        x{count}
                      </span>
                      {isSelected && (
                        <div className="absolute top-1 left-1 bg-amber-400 text-stone-950 rounded-full p-0.5 shadow">
                          <CheckCircle2 className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                    <span className="mt-1 text-[11px] font-bold text-amber-100 truncate">
                      {RESOURCE_LABELS_TR[res]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Alınacak İstediğin Kaynak Türünü Seç */}
          <div className="p-3 rounded-xl bg-[#240203]/85 border border-emerald-400/30 space-y-2">
            <h3 className="text-xs font-extrabold text-emerald-300">
              2. Alınacak Kaynak Türü (1 Adet Seç):
            </h3>
            <div className="grid grid-cols-5 gap-2">
              {ALL_RESOURCES.map((res) => {
                const isSameAsGive = activeGive === res;
                const isSelected = selectedTake === res && !isSameAsGive;

                return (
                  <button
                    key={res}
                    type="button"
                    disabled={isSameAsGive}
                    onClick={() => setSelectedTake(res)}
                    className={`relative flex flex-col items-center p-1.5 rounded-xl border transition ${
                      isSelected
                        ? 'bg-emerald-500/30 border-emerald-300 ring-2 ring-emerald-400 shadow-lg -translate-y-0.5'
                        : !isSameAsGive
                        ? 'bg-[#1a0203]/90 border-emerald-400/30 hover:border-emerald-300 cursor-pointer'
                        : 'bg-black/40 border-white/5 opacity-35 cursor-not-allowed'
                    }`}
                  >
                    <div className="relative w-full aspect-[3/4] rounded-lg overflow-hidden border border-emerald-200/30">
                      <img
                        src={getResourceImage(res)}
                        alt={RESOURCE_LABELS_TR[res]}
                        className="w-full h-full object-cover"
                      />
                      {isSelected && (
                        <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-400 text-stone-950 shadow">
                          +1 Al
                        </span>
                      )}
                    </div>
                    <span className="mt-1 text-[11px] font-bold text-amber-100 truncate">
                      {RESOURCE_LABELS_TR[res]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Özet Çubuğu */}
          {activeGive && (
            <div className="flex items-center justify-center gap-3 py-2 px-4 rounded-xl bg-[#1a0203]/90 border border-amber-400/30 text-xs md:text-sm font-extrabold">
              <span className="text-amber-300">
                {requiredGiveCount}x {RESOURCE_LABELS_TR[activeGive]} Ver
              </span>
              <ArrowRight className="w-4 h-4 text-amber-400" />
              <span className="text-emerald-300">
                1x {RESOURCE_LABELS_TR[selectedTake]} Al
              </span>
            </div>
          )}
        </div>

        {/* Alt Butonlar */}
        <div className="px-4 py-3 bg-[#1a0203]/95 border-t border-amber-400/25 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-stone-800/80 hover:bg-stone-700 text-amber-100 font-bold text-xs md:text-sm cursor-pointer transition"
          >
            Vazgeç
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleConfirm}
            className={`px-5 py-2 rounded-xl font-extrabold text-xs md:text-sm transition ${
              canSubmit
                ? 'bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-stone-950 cursor-pointer shadow-lg'
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
