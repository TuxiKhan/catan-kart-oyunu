'use client';

import React from 'react';
import {
  BuildingCardType,
  ClientGameView,
  ResourceType,
  BUILDING_COSTS,
  StructureType,
} from '../../types/game';
import { CardVisual } from '../cards/CardVisual';
import { BookOpen, Crown, Shield, Sparkles, Layers } from 'lucide-react';

export interface MarketAreaProps {
  gameView: ClientGameView;
  isMyTurn: boolean;
  onBuildMarketCard: (marketIndex: number, cardType: BuildingCardType) => void;
  onBuildMetropolis: () => void;
  onOpenRuleSummary: () => void;
}

export function canAffordStructure(
  hand: ResourceType[],
  structure: StructureType
): boolean {
  const counts: Record<ResourceType, number> = {
    brick: 0,
    wood: 0,
    wool: 0,
    wheat: 0,
    ore: 0,
  };
  for (const r of hand) {
    counts[r] = (counts[r] || 0) + 1;
  }
  const required = BUILDING_COSTS[structure];
  for (const [res, amt] of Object.entries(required) as [ResourceType, number][]) {
    if ((counts[res] || 0) < amt) {
      return false;
    }
  }
  return true;
}

export const MarketArea: React.FC<MarketAreaProps> = ({
  gameView,
  isMyTurn,
  onBuildMarketCard,
  onBuildMetropolis,
  onOpenRuleSummary,
}) => {
  const myPlayer = gameView.players.find((p) => p.playerId === gameView.myPlayerId);
  const canAct = isMyTurn && gameView.turnPhase === 'action' && !gameView.pendingEvent;

  const hasAvailableVillageForCity =
    myPlayer?.villageSlots.some((slot) => slot.upgradedTo === 'none') ?? false;
  const hasAvailableCityForMetropolis =
    myPlayer?.villageSlots.some((slot) => slot.upgradedTo === 'city') ?? false;

  const longestRoadHolder = gameView.players.find((p) => p.hasLongestRoad);
  const largestArmyHolder = gameView.players.find((p) => p.hasLargestArmy);

  const canBuildMetropolisNow =
    canAct &&
    gameView.metropolisDeckCount > 0 &&
    hasAvailableCityForMetropolis &&
    canAffordStructure(gameView.myHand, 'metropolis');

  return (
    <section
      aria-label="Ortak Kart Marketi ve Desteler"
      className="w-full rounded-2xl border border-amber-500/30 bg-gradient-to-b from-stone-900/95 via-stone-950/95 to-black/95 p-3 md:p-4 shadow-xl"
    >
      {/* Üst Başlık: Ortak Market, Özel Puan Durumu ve Kural Özeti Butonu */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-3 border-b border-amber-500/20">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <h2 className="text-sm md:text-base font-bold text-amber-100 tracking-wide">
            Ortak Kart Marketi (5 Açık İnşaat)
          </h2>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-200">
            İnşaat Destesi: {gameView.buildingDeckCount}
          </span>
        </div>

        {/* En Uzun Yol / En Güçlü Ordu / Kural Özeti */}
        <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-950/70 border border-amber-500/40 text-[11px] text-amber-100">
            <Crown className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
            <span className="font-semibold">En Uzun Yol (2 ZP):</span>
            <span className="text-yellow-300 font-bold">
              {longestRoadHolder ? `${longestRoadHolder.nickname} (${longestRoadHolder.roadsCount})` : 'Sahipsiz (Min 3)'}
            </span>
          </div>

          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-950/70 border border-rose-500/40 text-[11px] text-rose-100">
            <Shield className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span className="font-semibold">En Güçlü Ordu (2 ZP):</span>
            <span className="text-rose-300 font-bold">
              {largestArmyHolder ? `${largestArmyHolder.nickname} (${largestArmyHolder.knightsCount})` : 'Sahipsiz (Min 2)'}
            </span>
          </div>

          <button
            type="button"
            onClick={onOpenRuleSummary}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs shadow transition cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Kural Özeti (4x)</span>
          </button>
        </div>
      </div>

      {/* Ana Market Izgarası: Sol/Orta 5 Açık İnşaat Kartı + Büyükşehir, Sağ Kapalı Desteler */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
        {/* 5 Açık İnşaat Kartı + Büyükşehir Destesi */}
        <div className="lg:col-span-8 flex flex-col gap-1.5">
          <div className="flex items-center gap-2 overflow-x-auto pb-1.5 pt-1 px-1 scrollbar-thin">
            {gameView.cardMarket.map((cardType, idx) => {
              const hasEnoughRes = canAffordStructure(gameView.myHand, cardType);
              const meetsUpgradeReq = cardType !== 'city' || hasAvailableVillageForCity;
              const buildable = canAct && hasEnoughRes && meetsUpgradeReq;

              return (
                <div key={`${cardType}-${idx}`} className="flex flex-col items-center shrink-0">
                  <CardVisual
                    card={{ category: 'structure', type: cardType }}
                    size="sm"
                    affordable={buildable}
                    disabled={!buildable}
                    statusBadge={buildable ? 'İnşa Et' : undefined}
                    onClick={buildable ? () => onBuildMarketCard(idx, cardType) : undefined}
                  />
                  {canAct && hasEnoughRes && !meetsUpgradeReq && (
                    <span className="mt-1 text-[10px] text-rose-300 font-medium">Köy Gerekli</span>
                  )}
                </div>
              );
            })}

            {gameView.cardMarket.length === 0 && (
              <div className="text-xs text-stone-400 italic py-6 px-4">
                Market şu an boş.
              </div>
            )}

            {/* Ayırıcı Çizgi */}
            <div className="h-24 w-px bg-amber-500/25 mx-1 shrink-0" />

            {/* 4'lü Büyükşehir Destesi */}
            <div className="flex flex-col items-center shrink-0">
              {gameView.metropolisDeckCount > 0 ? (
                <CardVisual
                  card={{
                    category: 'structure',
                    type: 'metropolis',
                    face: gameView.topMetropolisCard?.face || gameView.settings.metropolisFaceMode,
                    bVariantId: gameView.topMetropolisCard?.bVariantId,
                    customTitle: gameView.topMetropolisCard?.titleTr || 'Büyükşehir',
                    customSubtitle:
                      gameView.topMetropolisCard?.descriptionTr || '+2 Üretim • Şehre Kapanır',
                  }}
                  size="sm"
                  affordable={canBuildMetropolisNow}
                  disabled={!canBuildMetropolisNow}
                  countBadge={gameView.metropolisDeckCount}
                  statusBadge={canBuildMetropolisNow ? 'Yükselt' : undefined}
                  onClick={canBuildMetropolisNow ? onBuildMetropolis : undefined}
                />
              ) : (
                <div className="w-22 h-32 rounded-xl border-2 border-dashed border-purple-500/30 flex items-center justify-center text-[10px] text-purple-300/50 text-center p-2">
                  Büyükşehir Tükendi
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sağ Bölüm: Kaynak Destesi, Olay Destesi ve Iskartalar */}
        <div className="lg:col-span-4 flex items-center justify-around lg:justify-end gap-2.5 border-t lg:border-t-0 lg:border-l border-amber-500/20 pt-2 lg:pt-0 lg:pl-3">
          {/* Kaynak Destesi + Iskarta */}
          <div className="flex flex-col items-center">
            <CardVisual
              card={{ category: 'back', deckType: 'resource' }}
              size="xs"
              countBadge={gameView.resourceDeckCount}
            />
            <span className="mt-1 text-[10px] text-amber-200/80 font-medium">
              Iskarta: {gameView.resourceDiscardCount}
            </span>
          </div>

          {/* Olay Destesi + Iskarta */}
          <div className="flex flex-col items-center">
            <CardVisual
              card={{ category: 'back', deckType: 'event' }}
              size="xs"
              countBadge={gameView.eventDeckCount}
            />
            <span className="mt-1 text-[10px] text-red-200/80 font-medium">
              Iskarta: {gameView.eventDiscardCount}
            </span>
          </div>

          {/* Kapalı İnşaat Destesi */}
          <div className="flex flex-col items-center">
            <CardVisual
              card={{ category: 'back', deckType: 'building' }}
              size="xs"
              countBadge={gameView.buildingDeckCount}
            />
            <span className="mt-1 text-[10px] text-slate-300/80 font-medium flex items-center gap-0.5">
              <Layers className="w-3 h-3" /> Yedek
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
