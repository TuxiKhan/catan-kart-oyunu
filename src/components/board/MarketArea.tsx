'use client';

import React from 'react';
import {
  BuildingCardType,
  ClientGameView,
  ResourceType,
  BUILDING_COSTS,
  StructureType,
} from '../../types/game';
import { resolveCardImageUrl } from '../cards/CardVisual';
import { InspectCardInfo, STRUCTURE_CARD_DESCRIPTIONS } from './OpponentArea';
import { BookOpen, Crown, Shield } from 'lucide-react';

export interface MarketAreaProps {
  gameView: ClientGameView;
  isMyTurn: boolean;
  onBuildMarketCard: (marketIndex: number, cardType: BuildingCardType) => void;
  onBuildMetropolis?: () => void;
  onOpenRuleSummary?: () => void;
  onInspectCard?: (info: InspectCardInfo, marketIndex?: number) => void;
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
  onInspectCard,
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

  const metropolisImageUrl =
    resolveCardImageUrl({
      category: 'structure',
      type: 'metropolis',
      face: gameView.topMetropolisCard?.face || gameView.settings.metropolisFaceMode,
      bVariantId: gameView.topMetropolisCard?.bVariantId,
    }) || '/cards/metropolis/metropolis_A.png';

  const lastEventLog = [...gameView.logs]
    .reverse()
    .find((l) => l.type === 'event');

  return (
    <section
      aria-label="Ortak Kart Marketi ve Desteler"
      className="relative z-20 w-full flex flex-col items-center gap-1.5 py-1 select-none"
    >
      {/* Ana Masa Sırası: [Sol: Kapalı Kaynak Destesi] — [Orta: Beyaz Çerçeveli "building row"] — [Sağ: Kapalı Olay Destesi] */}
      <div className="w-full flex items-center justify-between md:justify-center gap-2 sm:gap-5 md:gap-8 px-1 sm:px-4">
        {/* SOL ÇEKME DESTESİ: Kapalı Kaynak Destesi (resource_back.png) */}
        <div className="flex flex-col items-center shrink-0">
          <button
            type="button"
            onClick={() =>
              onInspectCard?.({
                imageUrl: '/cards/resource/resource_back.png',
                title: 'Kaynak Destesi',
                subtitle: `Kalan: ${gameView.resourceDeckCount} • Iskarta: ${gameView.resourceDiscardCount}`,
                description:
                  'Üretim aşamasında aktif oyuncu ve rakipler bu desteden hammadde kartı çeker.',
              })
            }
            className="relative w-14 sm:w-20 md:w-24 aspect-[2.5/3.5] rounded-lg overflow-hidden border border-amber-100/70 shadow-[0_8px_20px_rgba(0,0,0,0.75)] transition-transform hover:-translate-y-1 cursor-pointer"
            title={`Kaynak Destesi (${gameView.resourceDeckCount} Kart)`}
          >
            <img
              src="/cards/resource/resource_back.png"
              alt="Kaynak Destesi"
              draggable={false}
              className="w-full h-full object-cover"
            />
            <span className="absolute top-1 right-1 bg-amber-400 text-stone-950 font-black text-[10px] sm:text-xs px-1.5 py-0.2 rounded-full shadow border border-stone-900">
              {gameView.resourceDeckCount}
            </span>
          </button>
        </div>

        {/* ORTA BÖLGE: Beyaz Çerçeveli "building row" (1 Yeşil Gelişim/İnşaat Destesi + 5 Açık İnşaat Kartı) */}
        <div className="border-2 border-white/80 rounded-2xl bg-black/20 px-2.5 sm:px-4 pt-1 pb-2.5 shadow-[0_10px_28px_rgba(0,0,0,0.65)] max-w-full overflow-x-auto">
          <div className="text-center text-[11px] sm:text-xs font-medium text-white/95 tracking-wide mb-1.5">
            building row
          </div>

          <div className="flex items-center justify-center gap-1.5 sm:gap-2.5 md:gap-3 min-w-max">
            {/* 1. Yuva (En Sol): Yeşil Çekiç Armalı Kapalı İnşaat Destesi + Büyükşehir Rozeti */}
            <div className="relative flex flex-col items-center shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (onInspectCard) {
                    onInspectCard({
                      imageUrl:
                        gameView.metropolisDeckCount > 0 && canBuildMetropolisNow
                          ? metropolisImageUrl
                          : '/cards/building/building_back.png',
                      title:
                        gameView.topMetropolisCard?.titleTr ||
                        'İnşaat & Büyükşehir Destesi',
                      subtitle: `Yedek İnşaat: ${gameView.buildingDeckCount} • Büyükşehir: ${gameView.metropolisDeckCount}`,
                      description:
                        gameView.topMetropolisCard?.descriptionTr ||
                        'Marketten bir kart inşa edildiğinde bu desteden yeni kart açılır. Şehir üzerine 3 Yün + 1 Demir ile Büyükşehir (3 ZP) kurulabilir.',
                      canBuild: canBuildMetropolisNow,
                      onBuild:
                        canBuildMetropolisNow && onBuildMetropolis
                          ? onBuildMetropolis
                          : undefined,
                    });
                  } else if (canBuildMetropolisNow && onBuildMetropolis) {
                    onBuildMetropolis();
                  }
                }}
                className={`relative w-14 sm:w-20 md:w-24 aspect-[2.5/3.5] rounded-lg overflow-hidden border shadow-[0_6px_16px_rgba(0,0,0,0.75)] transition-transform hover:-translate-y-1 cursor-pointer ${
                  canBuildMetropolisNow
                    ? 'border-yellow-400 ring-2 ring-yellow-400/80'
                    : 'border-emerald-200/70'
                }`}
                title={`İnşaat Destesi (${gameView.buildingDeckCount}) • Büyükşehir (${gameView.metropolisDeckCount})`}
              >
                <img
                  src="/cards/building/building_back.png"
                  alt="İnşaat Destesi"
                  draggable={false}
                  className="w-full h-full object-cover"
                />
                <span className="absolute top-1 left-1 bg-emerald-400 text-stone-950 font-black text-[9px] sm:text-[10px] px-1.5 rounded-full shadow border border-stone-900">
                  {gameView.buildingDeckCount}
                </span>
                {gameView.metropolisDeckCount > 0 && (
                  <span
                    onClick={(e) => {
                      if (canBuildMetropolisNow && onBuildMetropolis) {
                        e.stopPropagation();
                        onBuildMetropolis();
                      }
                    }}
                    className={`absolute bottom-1 inset-x-1 text-center font-extrabold text-[8px] sm:text-[9px] px-1 py-0.5 rounded shadow ${
                      canBuildMetropolisNow
                        ? 'bg-yellow-400 text-stone-950 animate-pulse'
                        : 'bg-purple-900/90 text-purple-100 border border-purple-300/40'
                    }`}
                  >
                    {canBuildMetropolisNow
                      ? '★ Büyükşehir Kur'
                      : `Büyükşehir: ${gameView.metropolisDeckCount}`}
                  </span>
                )}
              </button>
            </div>

            {/* 2..6. Yuvalar: 5 Açık İnşaat Kartı (cardMarket) */}
            {gameView.cardMarket.map((cardType, idx) => {
              const meta = STRUCTURE_CARD_DESCRIPTIONS[cardType];
              const hasEnoughRes = canAffordStructure(gameView.myHand, cardType);
              const meetsUpgradeReq =
                cardType !== 'city' || hasAvailableVillageForCity;
              const buildable = canAct && hasEnoughRes && meetsUpgradeReq;

              const handleCardClick = () => {
                if (onInspectCard) {
                  onInspectCard(
                    {
                      imageUrl: meta.imageUrl,
                      title: meta.title,
                      subtitle: meta.subtitle,
                      description: meta.description,
                      canBuild: buildable,
                      onBuild: buildable
                        ? () => onBuildMarketCard(idx, cardType)
                        : undefined,
                    },
                    idx
                  );
                } else if (buildable) {
                  onBuildMarketCard(idx, cardType);
                }
              };

              return (
                <div
                  key={`${cardType}-${idx}`}
                  className="relative flex flex-col items-center shrink-0"
                >
                  <div
                    onClick={handleCardClick}
                    className={`relative w-14 sm:w-20 md:w-24 aspect-[2.5/3.5] rounded-lg overflow-hidden border transition-all cursor-pointer hover:-translate-y-1 ${
                      buildable
                        ? 'border-emerald-400 ring-2 ring-emerald-400/90 shadow-[0_0_16px_rgba(52,211,153,0.45)]'
                        : 'border-amber-100/70 shadow-[0_6px_16px_rgba(0,0,0,0.75)]'
                    }`}
                    title={`${meta.title} — ${meta.subtitle}`}
                  >
                    <img
                      src={meta.imageUrl}
                      alt={meta.title}
                      draggable={false}
                      className="w-full h-full object-cover"
                    />

                    {buildable && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onBuildMarketCard(idx, cardType);
                        }}
                        className="absolute bottom-1 inset-x-1 bg-emerald-400 hover:bg-emerald-300 text-stone-950 font-black text-[9px] sm:text-[10px] py-0.5 rounded shadow-md cursor-pointer"
                      >
                        İnşa Et
                      </button>
                    )}

                    {canAct && hasEnoughRes && !meetsUpgradeReq && (
                      <span className="absolute bottom-1 inset-x-1 bg-rose-900/90 text-rose-100 font-bold text-[8px] sm:text-[9px] text-center py-0.5 rounded">
                        Köy Gerekli
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SAĞ ÇEKME DESTESİ: Kapalı Olay Destesi (event_back.png) */}
        <div className="flex flex-col items-center shrink-0">
          <button
            type="button"
            onClick={() =>
              onInspectCard?.({
                imageUrl: '/cards/event/event_back.png',
                title: 'Olay Destesi',
                subtitle: `Kalan: ${gameView.eventDeckCount} • Açılan: ${gameView.eventDiscardCount}`,
                description: lastEventLog
                  ? `Son Olay: ${lastEventLog.messageTr}`
                  : 'Bir oyuncu Köy inşa ettiğinde bu desteden 1 Olay Kartı çekilir ve uygulanır.',
              })
            }
            className="relative w-14 sm:w-20 md:w-24 aspect-[2.5/3.5] rounded-lg overflow-hidden border border-slate-200/70 shadow-[0_8px_20px_rgba(0,0,0,0.75)] transition-transform hover:-translate-y-1 cursor-pointer"
            title={`Olay Destesi (${gameView.eventDeckCount} Kart)`}
          >
            <img
              src="/cards/event/event_back.png"
              alt="Olay Destesi"
              draggable={false}
              className="w-full h-full object-cover"
            />
            <span className="absolute top-1 right-1 bg-slate-200 text-stone-950 font-black text-[10px] sm:text-xs px-1.5 py-0.2 rounded-full shadow border border-stone-900">
              {gameView.eventDeckCount}
            </span>
          </button>
        </div>
      </div>

      {/* Alt Bilgi Çubuğu: En Uzun Yol, En Güçlü Ordu & Kural Özeti */}
      <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] sm:text-[11px] text-amber-100/90 px-2">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/35 border border-white/15">
          <Crown className="w-3 h-3 text-yellow-400" />
          <span>En Uzun Yol:</span>
          <strong className="text-yellow-300">
            {longestRoadHolder
              ? `${longestRoadHolder.nickname} (${longestRoadHolder.roadsCount})`
              : 'Sahipsiz (Min 3)'}
          </strong>
        </span>

        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/35 border border-white/15">
          <Shield className="w-3 h-3 text-rose-400" />
          <span>En Güçlü Ordu:</span>
          <strong className="text-rose-300">
            {largestArmyHolder
              ? `${largestArmyHolder.nickname} (${largestArmyHolder.knightsCount})`
              : 'Sahipsiz (Min 2)'}
          </strong>
        </span>

        {onOpenRuleSummary && (
          <button
            type="button"
            onClick={onOpenRuleSummary}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-400/90 hover:bg-amber-300 text-stone-950 font-bold shadow cursor-pointer transition"
          >
            <BookOpen className="w-3 h-3" />
            <span>Kural Özeti</span>
          </button>
        )}
      </div>
    </section>
  );
};
