'use client';

import React, { useState } from 'react';
import {
  BuildingCardType,
  ClientGameView,
  ResourceType,
  BUILDING_COSTS,
  StructureType,
  RESOURCE_LABELS_TR,
} from '../../types/game';
import { resolveCardImageUrl } from '../cards/CardVisual';
import { InspectCardInfo, STRUCTURE_CARD_DESCRIPTIONS } from './OpponentArea';
import { BookOpen, Crown, Shield } from 'lucide-react';

export interface SelectedCardState {
  marketIndex: number | 'metropolis';
  cardType: StructureType;
  title?: string;
}

export interface MarketAreaProps {
  gameView: ClientGameView;
  isMyTurn: boolean;
  onBuildMarketCard: (marketIndex: number, cardType: BuildingCardType) => void;
  onBuildMetropolis?: () => void;
  onOpenRuleSummary?: () => void;
  onInspectCard?: (info: InspectCardInfo, marketIndex?: number) => void;
  selectedCard?: SelectedCardState | null;
  onSelectCard?: (selected: SelectedCardState | null) => void;
  shakingCardKey?: string | number | null;
  onInvalidAttempt?: (reason: string) => void;
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

export function getMissingResourcesDescription(
  hand: ResourceType[],
  structure: StructureType
): string {
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
  const missing: string[] = [];
  for (const [res, amt] of Object.entries(required) as [ResourceType, number][]) {
    const diff = amt - (counts[res] || 0);
    if (diff > 0) {
      missing.push(`${diff} ${RESOURCE_LABELS_TR[res]}`);
    }
  }
  return missing.join(', ');
}

export const MarketArea: React.FC<MarketAreaProps> = ({
  gameView,
  isMyTurn,
  onBuildMarketCard,
  onBuildMetropolis,
  onOpenRuleSummary,
  onInspectCard,
  selectedCard,
  onSelectCard,
  shakingCardKey,
  onInvalidAttempt,
}) => {
  const [internalShakingKeys, setInternalShakingKeys] = useState<Record<string, boolean>>({});
  const [draggedKey, setDraggedKey] = useState<string | null>(null);

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

  const triggerShake = (key: string, reason?: string) => {
    setInternalShakingKeys((prev) => ({ ...prev, [key]: true }));
    if (reason && onInvalidAttempt) {
      onInvalidAttempt(reason);
    }
    setTimeout(() => {
      setInternalShakingKeys((prev) => ({ ...prev, [key]: false }));
    }, 500);
  };

  return (
    <section
      aria-label="Ortak Kart Marketi ve Desteler"
      className="relative z-20 w-full flex flex-col items-center gap-1.5 select-none"
    >
      {/*
        Ana Masa Düzeni:
        [SOL DESTE ALANI: Kapalı Kaynak Destesi + Kapalı İnşaat Çekme Destesi (Yedek)]
        [ORTA ALAN: Beyaz Çerçeveli "building row" -> 5 AÇIK İnşaat Kartı + Sıranın Sonunda AÇIK Büyükşehir Destesi]
        [SAĞ DESTE ALANI: Kapalı Olay Destesi]
      */}
      <div className="w-full flex items-center justify-between md:justify-center gap-1.5 sm:gap-3 md:gap-4 px-1 sm:px-3">
        {/* SOL ÇEKME DESTELERİ: Kapalı Kaynak Destesi + Kapalı İnşaat Çekme Destesi */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* 1. Kapalı Kaynak Destesi */}
          <div className="flex flex-col items-center">
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
              className="relative w-11 sm:w-14 md:w-16 aspect-[2.5/3.5] rounded-lg overflow-hidden border border-amber-100/70 shadow-[0_6px_16px_rgba(0,0,0,0.75)] transition-transform hover:-translate-y-1 cursor-pointer"
              title={`Kaynak Destesi (${gameView.resourceDeckCount} Kart)`}
            >
              <img
                src="/cards/resource/resource_back.png"
                alt="Kaynak Destesi"
                draggable={false}
                className="w-full h-full object-cover"
              />
              <span className="absolute top-0.5 right-0.5 bg-amber-400 text-stone-950 font-black text-[8px] sm:text-[9px] px-1 py-0.2 rounded-full shadow border border-stone-900">
                {gameView.resourceDeckCount}
              </span>
            </button>
            <span className="text-[8px] sm:text-[9px] text-amber-200/80 mt-0.5 font-medium">
              Kaynak
            </span>
          </div>

          {/* 2. Kapalı İnşaat Çekme Destesi (Pazarın yanındaki yedek çekme destesi) */}
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={() =>
                onInspectCard?.({
                  imageUrl: '/cards/building/building_back.png',
                  title: 'İnşaat Çekme Destesi',
                  subtitle: `Yedek Deste: ${gameView.buildingDeckCount} Kart`,
                  description:
                    'Marketten (building row) bir kart satın alınıp inşa edildiğinde, bu yedek desteden yeni kart çekilerek 5 açık kart sırası anında tamamlanır.',
                })
              }
              className="relative w-11 sm:w-14 md:w-16 aspect-[2.5/3.5] rounded-lg overflow-hidden border border-emerald-300/60 shadow-[0_6px_16px_rgba(0,0,0,0.75)] transition-transform hover:-translate-y-1 cursor-pointer"
              title={`İnşaat Çekme Destesi (${gameView.buildingDeckCount} Kart)`}
            >
              <img
                src="/cards/building/building_back.png"
                alt="İnşaat Çekme Destesi"
                draggable={false}
                className="w-full h-full object-cover"
              />
              <span className="absolute top-0.5 right-0.5 bg-emerald-400 text-stone-950 font-black text-[8px] sm:text-[9px] px-1 py-0.2 rounded-full shadow border border-stone-900">
                {gameView.buildingDeckCount}
              </span>
            </button>
            <span className="text-[8px] sm:text-[9px] text-emerald-200/80 mt-0.5 font-medium">
              İnşa Deste
            </span>
          </div>
        </div>

        {/*
          ORTA BÖLGE: Beyaz Çerçeveli "building row"
          KURAL: Masa ortasında HER ZAMAN 5 adet AÇIK inşaat kartı (Yol, Köy, Şehir, Şövalye) yan yana durur.
          Büyükşehir destesi sıranın en sağında/sonunda açık yüzüyle yer alır.
        */}
        <div className="border-2 border-white/80 rounded-2xl bg-black/35 backdrop-blur-xs px-2 sm:px-3 pt-1 pb-2 shadow-[0_10px_28px_rgba(0,0,0,0.65)] max-w-full overflow-x-auto">
          <div className="text-center text-[10px] sm:text-xs font-semibold text-white/95 tracking-wide mb-1 flex items-center justify-center gap-1.5">
            <span>building row</span>
            <span className="text-[9px] font-normal text-amber-200/80 hidden sm:inline">
              (5 Açık İnşaat Kartı + Sıranın Sonunda Büyükşehir Destesi)
            </span>
          </div>

          <div className="flex items-center justify-center gap-1.5 sm:gap-2 md:gap-2.5 min-w-max">
            {/*
              1..5. Yuvalar: Masa ortasındaki 5 AÇIK İNŞAAT KARTI (Yol, Köy, Şehir, Şövalye)
              ASLA kapalı deste olarak durmaz; biri satın alınınca motor tarafından otomatik yenilenir.
            */}
            {Array.from({ length: 5 }).map((_, slotIdx) => {
              const cardType = gameView.cardMarket[slotIdx];

              if (!cardType) {
                // Eğer olay çözümlenirken geçici olarak kart sayısı 5'in altına inerse yuva boşluk koruyucusu
                return (
                  <div
                    key={`empty-slot-${slotIdx}`}
                    className="relative w-12 sm:w-16 md:w-20 aspect-[2.5/3.5] rounded-lg border-2 border-dashed border-white/20 bg-white/5 flex flex-col items-center justify-center p-1 text-center shrink-0"
                  >
                    <span className="text-[8px] sm:text-[9px] text-amber-200/60 font-semibold animate-pulse">
                      Kart Açılıyor...
                    </span>
                  </div>
                );
              }

              const meta = STRUCTURE_CARD_DESCRIPTIONS[cardType];
              const hasEnoughRes = canAffordStructure(gameView.myHand, cardType);
              const meetsUpgradeReq = cardType !== 'city' || hasAvailableVillageForCity;
              const buildable = canAct && hasEnoughRes && meetsUpgradeReq;

              const isShaking =
                internalShakingKeys[String(slotIdx)] || shakingCardKey === slotIdx;
              const isSelected = selectedCard?.marketIndex === slotIdx;
              const isDragging = draggedKey === String(slotIdx);

              const handleCardClick = () => {
                if (!canAct) {
                  onInspectCard?.(
                    {
                      imageUrl: meta.imageUrl,
                      title: meta.title,
                      subtitle: meta.subtitle,
                      description: meta.description,
                      canBuild: false,
                    },
                    slotIdx
                  );
                  return;
                }

                if (!hasEnoughRes) {
                  const missing = getMissingResourcesDescription(gameView.myHand, cardType);
                  triggerShake(String(slotIdx), `Yetersiz kaynak! Eksik: ${missing}`);
                  return;
                }

                if (!meetsUpgradeReq) {
                  triggerShake(String(slotIdx), 'Şehir inşa etmek için önce boş bir Köyünüz olmalıdır!');
                  return;
                }

                // Seçim veya doğrudan inşa
                if (onSelectCard) {
                  if (isSelected) {
                    onSelectCard(null);
                  } else {
                    onSelectCard({
                      marketIndex: slotIdx,
                      cardType,
                      title: meta.title,
                    });
                  }
                } else {
                  onBuildMarketCard(slotIdx, cardType);
                }
              };

              return (
                <div
                  key={`${cardType}-${slotIdx}`}
                  className="relative flex flex-col items-center shrink-0"
                >
                  <div
                    draggable={canAct}
                    onDragStart={(e) => {
                      if (!canAct) return;
                      e.dataTransfer.setData(
                        'application/json',
                        JSON.stringify({
                          source: 'market',
                          cardType,
                          marketIndex: slotIdx,
                        })
                      );
                      e.dataTransfer.setData('text/plain', cardType);
                      e.dataTransfer.effectAllowed = 'copyMove';
                      setDraggedKey(String(slotIdx));
                    }}
                    onDragEnd={() => setDraggedKey(null)}
                    onClick={handleCardClick}
                    onDoubleClick={() => {
                      onInspectCard?.(
                        {
                          imageUrl: meta.imageUrl,
                          title: meta.title,
                          subtitle: meta.subtitle,
                          description: meta.description,
                          canBuild: buildable,
                          onBuild: buildable
                            ? () => onBuildMarketCard(slotIdx, cardType)
                            : undefined,
                        },
                        slotIdx
                      );
                    }}
                    className={`relative w-12 sm:w-16 md:w-20 aspect-[2.5/3.5] rounded-lg overflow-hidden border transition-all cursor-grab active:cursor-grabbing ${
                      isShaking ? 'animate-card-shake border-rose-500 ring-2 ring-rose-500' : ''
                    } ${
                      isSelected
                        ? '-translate-y-2 ring-4 ring-yellow-400 shadow-[0_0_22px_rgba(250,204,21,0.95)] z-20'
                        : buildable
                        ? 'border-emerald-400 ring-2 ring-emerald-400/90 shadow-[0_0_14px_rgba(52,211,153,0.5)] hover:-translate-y-1'
                        : 'border-amber-100/70 shadow-[0_6px_16px_rgba(0,0,0,0.75)] hover:-translate-y-0.5'
                    } ${isDragging ? 'opacity-40 scale-95' : ''}`}
                    title={`${meta.title} — ${meta.subtitle}`}
                  >
                    {/* AÇIK İNŞAAT KARTI GÖRSELİ */}
                    <img
                      src={meta.imageUrl}
                      alt={meta.title}
                      draggable={false}
                      className="w-full h-full object-cover pointer-events-none"
                    />

                    {/* Dokunsal Durum ve İnşa Et Butonu/Rozeti */}
                    {isSelected && (
                      <div className="absolute inset-x-0 bottom-0 bg-yellow-400 text-stone-950 font-black text-[8px] text-center py-0.5 shadow animate-pulse">
                        SEÇİLDİ
                      </div>
                    )}

                    {!isSelected && buildable && (
                      <div className="absolute inset-x-0 bottom-0 bg-emerald-400/95 text-stone-950 font-black text-[7px] sm:text-[8px] text-center py-0.2 shadow">
                        İnşa Et
                      </div>
                    )}

                    {canAct && hasEnoughRes && !meetsUpgradeReq && (
                      <span className="absolute bottom-0 inset-x-0 bg-rose-900/90 text-rose-100 font-bold text-[7px] text-center py-0.2">
                        Köy Yok
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {/*
              6. Yuva (building row'un En Sağında / Sıranın Sonunda):
              BÜYÜKŞEHİR DESTESİ — HER ZAMAN AÇIK YÜZÜYLE YER ALIR!
              (Kural: 'Place the metropolis cards in a stack at the end of the building row. For your first game, place them "A" side up. In later games, you may use the "B" side.')
            */}
            <div className="relative flex flex-col items-center shrink-0 pl-1 border-l border-white/20">
              {(() => {
                const isShaking =
                  internalShakingKeys['metropolis'] || shakingCardKey === 'metropolis';
                const isSelected = selectedCard?.marketIndex === 'metropolis';
                const isDragging = draggedKey === 'metropolis';

                const handleMetroClick = () => {
                  if (!canAct) {
                    onInspectCard?.({
                      imageUrl: metropolisImageUrl,
                      title:
                        gameView.topMetropolisCard?.titleTr ||
                        `Büyükşehir Destesi (${gameView.settings.metropolisFaceMode} Yüzü)`,
                      subtitle: `Kalan Büyükşehir: ${gameView.metropolisDeckCount} • 3 ZP`,
                      description:
                        gameView.topMetropolisCard?.descriptionTr ||
                        'Şehir üzerine 3 Yün + 1 Demir ile kurulur. Üretim aşamasında kaynak bonusu sağlar.',
                      canBuild: false,
                    });
                    return;
                  }

                  if (gameView.metropolisDeckCount <= 0) {
                    triggerShake('metropolis', 'Büyükşehir destesinde kart kalmadı!');
                    return;
                  }

                  if (!hasAvailableCityForMetropolis) {
                    triggerShake('metropolis', 'Büyükşehir inşa etmek için önce bir Şehriniz olmalıdır!');
                    return;
                  }

                  if (!canAffordStructure(gameView.myHand, 'metropolis')) {
                    const missing = getMissingResourcesDescription(gameView.myHand, 'metropolis');
                    triggerShake('metropolis', `Büyükşehir için yetersiz kaynak! Eksik: ${missing}`);
                    return;
                  }

                  if (onSelectCard) {
                    if (isSelected) {
                      onSelectCard(null);
                    } else {
                      onSelectCard({
                        marketIndex: 'metropolis',
                        cardType: 'metropolis',
                        title: 'BÜYÜKŞEHİR',
                      });
                    }
                  } else if (onBuildMetropolis) {
                    onBuildMetropolis();
                  }
                };

                return (
                  <div
                    draggable={canBuildMetropolisNow}
                    onDragStart={(e) => {
                      if (!canBuildMetropolisNow) return;
                      e.dataTransfer.setData(
                        'application/json',
                        JSON.stringify({
                          source: 'metropolis',
                          cardType: 'metropolis',
                        })
                      );
                      e.dataTransfer.setData('text/plain', 'metropolis');
                      e.dataTransfer.effectAllowed = 'copyMove';
                      setDraggedKey('metropolis');
                    }}
                    onDragEnd={() => setDraggedKey(null)}
                    onClick={handleMetroClick}
                    onDoubleClick={() => {
                      onInspectCard?.({
                        imageUrl: metropolisImageUrl,
                        title:
                          gameView.topMetropolisCard?.titleTr ||
                          `Büyükşehir (${gameView.settings.metropolisFaceMode} Yüzü)`,
                        subtitle: `Kalan Büyükşehir: ${gameView.metropolisDeckCount} • 3 ZP`,
                        description:
                          gameView.topMetropolisCard?.descriptionTr ||
                          'Şehir üzerine 3 Yün + 1 Demir ile Büyükşehir (3 ZP) kurulabilir.',
                        canBuild: canBuildMetropolisNow,
                        onBuild:
                          canBuildMetropolisNow && onBuildMetropolis
                            ? onBuildMetropolis
                            : undefined,
                      });
                    }}
                    className={`relative w-12 sm:w-16 md:w-20 aspect-[2.5/3.5] rounded-lg overflow-hidden border shadow-[0_6px_16px_rgba(0,0,0,0.75)] transition-all cursor-pointer ${
                      isShaking ? 'animate-card-shake border-rose-500 ring-2 ring-rose-500' : ''
                    } ${
                      isSelected
                        ? '-translate-y-2 ring-4 ring-yellow-400 shadow-[0_0_22px_rgba(250,204,21,0.95)] z-20'
                        : canBuildMetropolisNow
                        ? 'border-yellow-400 ring-2 ring-yellow-400/80 shadow-[0_0_16px_rgba(250,204,21,0.5)] hover:-translate-y-1'
                        : 'border-yellow-500/50 hover:-translate-y-0.5'
                    } ${isDragging ? 'opacity-40 scale-95' : ''}`}
                    title={`Büyükşehir Destesi (${gameView.metropolisDeckCount} Kart Kaldı) — ${gameView.settings.metropolisFaceMode} Yüzü Açık`}
                  >
                    {/* BÜYÜKŞEHİR DESTESİNİN AÇIK YÜZÜ GÖRSELİ */}
                    {gameView.metropolisDeckCount > 0 ? (
                      <img
                        src={metropolisImageUrl}
                        alt="Büyükşehir Destesi"
                        draggable={false}
                        className="w-full h-full object-cover pointer-events-none"
                      />
                    ) : (
                      <div className="w-full h-full bg-stone-900 flex flex-col items-center justify-center p-1 text-center">
                        <span className="text-[8px] text-stone-500 font-bold">
                          Büyükşehir Tükendi
                        </span>
                      </div>
                    )}

                    {/* Kalan Büyükşehir Sayısı Rozeti */}
                    <span className="absolute top-0.5 right-0.5 bg-yellow-400 text-stone-950 font-black text-[8px] sm:text-[9px] px-1 rounded-full shadow border border-stone-900">
                      {gameView.metropolisDeckCount}
                    </span>

                    {/* Mod Rozeti (A Yüzü / B Yüzü) */}
                    <span className="absolute top-0.5 left-0.5 bg-purple-900/90 text-purple-100 font-extrabold text-[7px] sm:text-[8px] px-1 rounded shadow border border-purple-300/40">
                      {gameView.settings.metropolisFaceMode} Yüzü
                    </span>

                    {/* Alt Durum / İnşa Et Butonu */}
                    {isSelected && (
                      <div className="absolute inset-x-0 bottom-0 bg-yellow-400 text-stone-950 font-black text-[8px] text-center py-0.5 shadow animate-pulse">
                        SEÇİLDİ
                      </div>
                    )}

                    {!isSelected && canBuildMetropolisNow && (
                      <div className="absolute inset-x-0 bottom-0 bg-yellow-400 text-stone-950 font-black text-[7px] sm:text-[8px] text-center py-0.2 shadow animate-pulse">
                        Büyükşehir Kur
                      </div>
                    )}

                    {!isSelected && !canBuildMetropolisNow && gameView.metropolisDeckCount > 0 && (
                      <span className="absolute bottom-0 inset-x-0 text-center font-extrabold text-[7px] sm:text-[8px] px-0.5 py-0.2 bg-stone-950/85 text-amber-200">
                        {hasAvailableCityForMetropolis ? '3 Yün + 1 Demir' : 'Şehir Gerekli'}
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
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
            className="relative w-11 sm:w-14 md:w-16 aspect-[2.5/3.5] rounded-lg overflow-hidden border border-slate-200/70 shadow-[0_6px_16px_rgba(0,0,0,0.75)] transition-transform hover:-translate-y-1 cursor-pointer"
            title={`Olay Destesi (${gameView.eventDeckCount} Kart)`}
          >
            <img
              src="/cards/event/event_back.png"
              alt="Olay Destesi"
              draggable={false}
              className="w-full h-full object-cover"
            />
            <span className="absolute top-0.5 right-0.5 bg-slate-200 text-stone-950 font-black text-[8px] sm:text-[9px] px-1 py-0.2 rounded-full shadow border border-stone-900">
              {gameView.eventDeckCount}
            </span>
          </button>
          <span className="text-[8px] sm:text-[9px] text-slate-200/80 mt-0.5 font-medium">
            Olay
          </span>
        </div>
      </div>

      {/* Alt Bilgi Çubuğu: En Uzun Yol, En Güçlü Ordu & Kural Özeti */}
      <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] sm:text-[11px] text-amber-100/90 px-2 mt-0.5">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/40 border border-white/15">
          <Crown className="w-3 h-3 text-yellow-400" />
          <span>En Uzun Yol:</span>
          <strong className="text-yellow-300">
            {longestRoadHolder
              ? `${longestRoadHolder.nickname} (${longestRoadHolder.roadsCount})`
              : 'Sahipsiz (Min 3)'}
          </strong>
        </span>

        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/40 border border-white/15">
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
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-400/90 hover:bg-amber-300 text-stone-950 font-bold shadow cursor-pointer transition text-[10px]"
          >
            <BookOpen className="w-2.5 h-2.5" />
            <span>Kurallar</span>
          </button>
        )}
      </div>
    </section>
  );
};
