'use client';

import React from 'react';
import { PublicPlayerState, VillageSlot } from '../../types/game';
import { CardVisual } from '../cards/CardVisual';
import { Crown, Shield, Trophy, Wifi, WifiOff, Layers } from 'lucide-react';

export interface OpponentAreaProps {
  opponents: PublicPlayerState[];
  activePlayerId: string;
}

/**
 * Kural Kitapçığı Görsel Yerleşim Mekaniği #1:
 * Üst Üste Dizilen Kartlar (Cascading Stack) - Yol ve Şövalye kartları üst üste dizilirken
 * alttaki kartların isim başlıkları (header şeritleri) net şekilde görünür!
 */
export const CascadingStructureStack: React.FC<{
  type: 'road' | 'knight';
  count: number;
  compact?: boolean;
}> = ({ type, count, compact = false }) => {
  if (count <= 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-700/80 bg-stone-900/40 px-2.5 py-2 text-center text-[11px] text-stone-400">
        {type === 'road' ? 'Yol Yok' : 'Şövalye Yok'}
      </div>
    );
  }

  const items = Array.from({ length: count }, (_, idx) => idx);
  const headerStepPx = compact ? 22 : 26;
  const cardHeightPx = compact ? 96 : 128;
  const totalHeightPx = cardHeightPx + (count - 1) * headerStepPx;

  return (
    <div
      className="relative w-20 md:w-24 select-none"
      style={{ height: `${totalHeightPx}px` }}
      aria-label={`${type === 'road' ? 'Yol' : 'Şövalye'} İstifi (${count} Adet)`}
    >
      {items.map((idx) => {
        const isInitialRoad = type === 'road' && idx === 0;
        const label =
          type === 'road'
            ? isInitialRoad
              ? 'İlk Yol'
              : `Yol #${idx + 1}`
            : `Şövalye #${idx + 1}`;

        return (
          <div
            key={idx}
            className="absolute left-0 right-0 transition-all"
            style={{ top: `${idx * headerStepPx}px`, zIndex: idx + 1 }}
          >
            <CardVisual
              card={{
                category: 'structure',
                type,
                isInitial: isInitialRoad,
                customTitle: label,
              }}
              size={compact ? 'xs' : 'sm'}
              className="w-full shadow-md"
            />
          </div>
        );
      })}
    </div>
  );
};

/**
 * Kural Kitapçığı Görsel Yerleşim Mekaniği #2:
 * Köy Üzerine Şehir ve Büyükşehir Kapatılması:
 * - none: 1 ZP Köy
 * - city: Köy kartının üst başlığı altta katman olarak görünür, üzerinde 2 ZP Şehir yer alır
 * - metropolis: Altta Köy + Şehir katman şeritleri görünür, en üstte 3 ZP Büyükşehir yer alır
 */
export const VillageSlotVisual: React.FC<{
  slot: VillageSlot;
  index: number;
  compact?: boolean;
}> = ({ slot, index, compact = false }) => {
  const villageTitle = slot.isInitialSettlement ? 'İlk Köy' : `Köy #${index + 1}`;

  return (
    <div className="flex flex-col items-center">
      <div className="relative flex flex-col items-center">
        {/* Alt Katman 1: Eğer Şehir veya Büyükşehir kapatılmışsa alttaki Köy katman şeridi görünür */}
        {slot.upgradedTo !== 'none' && (
          <div className="w-full rounded-t-lg border-2 border-b-0 border-amber-400/70 bg-amber-900/90 px-2 py-0.5 text-[10px] font-bold text-amber-100 flex items-center justify-between shadow-sm">
            <span className="truncate">{villageTitle}</span>
            <span className="text-[9px] text-amber-300">Alt Katman</span>
          </div>
        )}

        {/* Alt Katman 2: Eğer Büyükşehir kapatılmışsa ortadaki Şehir katman şeridi de görünür */}
        {slot.upgradedTo === 'metropolis' && (
          <div className="w-full border-x-2 border-t-2 border-indigo-400/80 bg-indigo-950/95 px-2 py-0.5 text-[10px] font-bold text-indigo-100 flex items-center justify-between shadow-sm">
            <span className="truncate">Şehir</span>
            <span className="text-[9px] text-indigo-300">Alt Katman</span>
          </div>
        )}

        {/* En Üstteki Aktif Yapı Kartı */}
        {slot.upgradedTo === 'none' && (
          <CardVisual
            card={{
              category: 'structure',
              type: 'settlement',
              isInitial: slot.isInitialSettlement,
              hasFirstPlayerMarker: slot.hasFirstPlayerMarker,
              customTitle: villageTitle,
            }}
            size={compact ? 'xs' : 'sm'}
          />
        )}

        {slot.upgradedTo === 'city' && (
          <CardVisual
            card={{
              category: 'structure',
              type: 'city',
              hasFirstPlayerMarker: slot.hasFirstPlayerMarker,
              customTitle: 'Şehir (2 ZP)',
              customSubtitle: `${villageTitle} üzerine kurulu`,
            }}
            size={compact ? 'xs' : 'sm'}
            className="rounded-t-none"
          />
        )}

        {slot.upgradedTo === 'metropolis' && (
          <CardVisual
            card={{
              category: 'structure',
              type: 'metropolis',
              face: slot.metropolisCard?.face || 'A',
              bVariantId: slot.metropolisCard?.bVariantId,
              hasFirstPlayerMarker: slot.hasFirstPlayerMarker,
              customTitle: slot.metropolisCard?.titleTr || 'Büyükşehir',
              customSubtitle: slot.metropolisCard?.descriptionTr || '3 ZP • +2 Üretim',
            }}
            size={compact ? 'xs' : 'sm'}
            className="rounded-t-none"
          />
        )}
      </div>
    </div>
  );
};

export const OpponentArea: React.FC<OpponentAreaProps> = ({
  opponents,
  activePlayerId,
}) => {
  // 3 oyunculu (2 rakip) veya 4 oyunculu (3 rakip) duyarlı ızgara
  const gridCols =
    opponents.length === 2
      ? 'grid-cols-1 md:grid-cols-2'
      : 'grid-cols-1 md:grid-cols-3';

  return (
    <section aria-label="Rakiplerin Alanı" className={`grid ${gridCols} gap-3 w-full`}>
      {opponents.map((opp) => {
        const isCurrentTurn = opp.playerId === activePlayerId;
        const harborRatio =
          opp.roadsCount >= 4
            ? '1:1'
            : opp.roadsCount === 3
            ? '2:1'
            : opp.roadsCount === 2
            ? '3:1'
            : '4:1';

        return (
          <div
            key={opp.playerId}
            className={`rounded-2xl border p-3 transition-all shadow-lg flex flex-col justify-between ${
              isCurrentTurn
                ? 'border-yellow-400 bg-gradient-to-b from-amber-950/90 via-stone-900/95 to-stone-950 ring-2 ring-yellow-400/50'
                : 'border-amber-500/25 bg-stone-900/85'
            }`}
          >
            {/* Rakip Üst Bilgi Çubuğu: İsim, Bağlantı, ZP, Kapalı El Sayısı */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2.5 border-b border-white/10">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    opp.isConnected ? 'bg-emerald-400' : 'bg-rose-500'
                  }`}
                  title={opp.isConnected ? 'Çevrimiçi' : 'Bağlantı Kesildi'}
                />
                <span className="font-bold text-sm text-amber-100 truncate">
                  {opp.nickname}
                </span>
                {isCurrentTurn && (
                  <span className="bg-yellow-400 text-stone-950 text-[10px] font-extrabold px-2 py-0.5 rounded-full animate-pulse">
                    Sırada
                  </span>
                )}
                {!opp.isConnected && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-rose-300">
                    <WifiOff className="w-3 h-3" /> Kopuk
                  </span>
                )}
              </div>

              {/* Zafer Puanı & Kapalı Kaynak Kartı Sayısı */}
              <div className="flex items-center gap-2">
                <div
                  className="flex items-center gap-1 bg-amber-900/60 border border-amber-400/50 px-2 py-0.5 rounded-lg text-xs text-amber-100"
                  title="Eldeki Kapalı Kaynak Kartı Sayısı"
                >
                  <Layers className="w-3.5 h-3.5 text-amber-300" />
                  <span className="font-bold">{opp.handCount}</span>
                  <span className="text-[10px] text-amber-200/80">Kart</span>
                </div>

                <div className="flex items-center gap-1 bg-yellow-400 text-stone-950 font-black px-2.5 py-0.5 rounded-lg text-xs shadow">
                  <Trophy className="w-3.5 h-3.5" />
                  <span>{opp.victoryPoints} ZP</span>
                </div>
              </div>
            </div>

            {/* Özel Puan Kartları Rozetleri (En Uzun Yol & En Güçlü Ordu) */}
            {(opp.hasLongestRoad || opp.hasLargestArmy) && (
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {opp.hasLongestRoad && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-yellow-500/20 border border-yellow-400 text-yellow-200 text-[10px] font-bold">
                    <Crown className="w-3 h-3 text-yellow-400" /> En Uzun Yol (+2 ZP)
                  </span>
                )}
                {opp.hasLargestArmy && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/20 border border-rose-400 text-rose-200 text-[10px] font-bold">
                    <Shield className="w-3 h-3 text-rose-400" /> En Güçlü Ordu (+2 ZP)
                  </span>
                )}
              </div>
            )}

            {/* Rakibin Yapıları: Cascading Yollar, Cascading Şövalyeler ve Yan Yana Köy/Şehir/Büyükşehir Slotları */}
            <div className="flex items-start gap-2.5 overflow-x-auto pb-1 pt-0.5">
              {/* Cascading Yollar */}
              <div className="flex flex-col items-center shrink-0">
                <span className="text-[10px] text-amber-200/80 font-semibold mb-1">
                  Yollar ({opp.roadsCount}) • {harborRatio}
                </span>
                <CascadingStructureStack type="road" count={opp.roadsCount} compact />
              </div>

              {/* Cascading Şövalyeler */}
              <div className="flex flex-col items-center shrink-0">
                <span className="text-[10px] text-rose-200/80 font-semibold mb-1">
                  Şövalye ({opp.knightsCount})
                </span>
                <CascadingStructureStack type="knight" count={opp.knightsCount} compact />
              </div>

              {/* Yan Yana Köy / Şehir / Büyükşehir Slotları */}
              <div className="flex flex-col shrink-0">
                <span className="text-[10px] text-amber-100/80 font-semibold mb-1">
                  Yerleşimler ({opp.villageSlots.length})
                </span>
                <div className="flex items-end gap-1.5">
                  {opp.villageSlots.map((slot, idx) => (
                    <VillageSlotVisual key={slot.id} slot={slot} index={idx} compact />
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
};
