'use client';

import React, { useEffect, useState } from 'react';
import {
  BuildingCardType,
  ClientGameView,
  PublicPlayerState,
  ResourceType,
  RESOURCE_LABELS_TR,
  StructureType,
} from '../../types/game';
import { CardVisual } from '../cards/CardVisual';
import { CascadingStructureStack, InspectCardInfo, VillageSlotVisual } from './OpponentArea';
import { FannedHand } from './FannedHand';
import { TurnDisc } from './TurnDisc';
import { TactileDropZone } from './TactileDropZone';
import {
  Anchor,
  ArrowRightLeft,
  Clock,
  Crown,
  Shield,
  Sparkles,
  Trophy,
} from 'lucide-react';

export interface PlayerBoardProps {
  gameView: ClientGameView;
  myPlayer: PublicPlayerState;
  isMyTurn: boolean;
  onProduce?: () => void;
  onOpenHarborModal: () => void;
  onOpenTradeModal: () => void;
  onEndTurn: () => void;
  onInspectCard?: (info: InspectCardInfo) => void;
  isFourPlayer?: boolean;
  selectedMarketCard?: {
    marketIndex: number | 'metropolis';
    cardType: StructureType;
    title?: string;
  } | null;
  onClearSelectedCard?: () => void;
  onBuildMarketCard?: (marketIndex: number, cardType: BuildingCardType) => void;
  onBuildMetropolis?: () => void;
}

const RESOURCE_ORDER: ResourceType[] = ['brick', 'wood', 'wool', 'wheat', 'ore'];

export function calculateProductionCount(player: PublicPlayerState): number {
  let count = 1; // Kural Kitapçığı Aşama 1: Her oyuncu taban olarak 1 Kaynak kartı çeker
  for (const slot of player.villageSlots) {
    // Görünür Şehir için +1, Büyükşehir (A yüzü) için +2 (B yüzü ise +1 ve özel güç) fazladan Kaynak çekilir
    if (slot.upgradedTo === 'city') {
      count += 1;
    } else if (slot.upgradedTo === 'metropolis') {
      const metroBonus = slot.metropolisCard?.productionBonus ?? 2;
      count += metroBonus;
    }
  }
  return count;
}

export function getHarborRequiredCount(roadsCount: number): number {
  if (roadsCount >= 4) return 1;
  if (roadsCount === 3) return 2;
  if (roadsCount === 2) return 3;
  return 4; // 1 Yol (İlk Yol) -> 4:1
}

export const PlayerBoard: React.FC<PlayerBoardProps> = ({
  gameView,
  myPlayer,
  isMyTurn,
  onOpenHarborModal,
  onOpenTradeModal,
  onEndTurn,
  onInspectCard,
  isFourPlayer = false,
  selectedMarketCard = null,
  onClearSelectedCard,
  onBuildMarketCard,
  onBuildMetropolis,
}) => {
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  // Tur Süresi Sayacı (60sn / 90sn / 0=Süresiz)
  useEffect(() => {
    const timeoutSec = gameView.settings.turnTimeoutSeconds;
    if (!timeoutSec || timeoutSec <= 0 || gameView.status !== 'playing') {
      setRemainingSeconds(null);
      return;
    }

    const updateTimer = () => {
      const startedMs = new Date(gameView.turnStartedAt).getTime();
      if (Number.isNaN(startedMs)) {
        setRemainingSeconds(timeoutSec);
        return;
      }
      const elapsedSec = Math.floor((Date.now() - startedMs) / 1000);
      const left = Math.max(0, timeoutSec - elapsedSec);
      setRemainingSeconds(left);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [gameView.turnStartedAt, gameView.settings.turnTimeoutSeconds, gameView.status]);

  // Eldeki kaynakları türe göre grupla
  const handCounts: Record<ResourceType, number> = {
    brick: 0,
    wood: 0,
    wool: 0,
    wheat: 0,
    ore: 0,
  };
  for (const res of gameView.myHand) {
    handCounts[res] = (handCounts[res] || 0) + 1;
  }

  const productionTotal = calculateProductionCount(myPlayer);
  const harborRatioNeed = getHarborRequiredCount(myPlayer.roadsCount);
  const hasEnoughForHarbor = RESOURCE_ORDER.some((r) => handCounts[r] >= harborRatioNeed);

  const canAct =
    isMyTurn && gameView.turnPhase === 'action' && !gameView.pendingEvent;

  const canUseHarbor =
    canAct &&
    !gameView.hasUsedHarborThisTurn &&
    myPlayer.roadsCount >= 1 &&
    hasEnoughForHarbor;

  const canInitiateTrade =
    canAct && !gameView.hasTradedThisTurn && gameView.myHand.length > 0;

  const handleDropCard = (cardType: StructureType, marketIndex?: number) => {
    if (cardType === 'metropolis') {
      onBuildMetropolis?.();
    } else if (marketIndex !== undefined && onBuildMarketCard) {
      onBuildMarketCard(marketIndex, cardType as BuildingCardType);
    } else if (onBuildMarketCard) {
      // Find market index of this cardType
      const foundIdx = gameView.cardMarket.indexOf(cardType as BuildingCardType);
      if (foundIdx !== -1) {
        onBuildMarketCard(foundIdx, cardType as BuildingCardType);
      }
    }
    onClearSelectedCard?.();
  };

  return (
    <section
      aria-label="Oyuncu Alanı ve Keçe Masa"
      className={`relative w-full rounded-3xl border-2 p-2 sm:p-3.5 shadow-2xl transition-all duration-300 ${
        isMyTurn
          ? 'border-yellow-400/90 bg-gradient-to-b from-[#22070c]/90 via-[#1a0408]/95 to-black/95 ring-2 ring-yellow-400/30'
          : 'border-amber-900/40 bg-[#160307]/90'
      }`}
    >
      {/* ÜST MİNİMAL BİLGİ ŞERİDİ (Hantal kutular yerine zarif masa rozetleri) */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 pb-2 mb-2 border-b border-white/10">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* Oyuncu Kimliği */}
          <div className="flex items-center gap-1.5 bg-black/40 border border-amber-500/30 px-2.5 py-0.5 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow shadow-emerald-400/50" />
            <h2 className="text-xs sm:text-sm font-extrabold text-amber-100">
              {myPlayer.nickname} (Sen)
            </h2>
          </div>

          {/* Zafer Puanı */}
          <div className="flex items-center gap-1 bg-yellow-400 text-stone-950 font-black px-2.5 py-0.5 rounded-full text-xs shadow">
            <Trophy className="w-3.5 h-3.5" />
            <span>{myPlayer.victoryPoints} / 7 ZP</span>
          </div>

          {/* Üretim Bilgisi (Hasat otomatik olduğu için sakin bir bilgi hapı) */}
          <span className="text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-400/20 text-amber-200">
            🌾 Otomatik Hasat: +{productionTotal}
          </span>

          {myPlayer.hasLongestRoad && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/20 border border-yellow-400 text-yellow-200 text-[10px] font-bold">
              <Crown className="w-3 h-3 text-yellow-400" /> En Uzun Yol (+2 ZP)
            </span>
          )}

          {myPlayer.hasLargestArmy && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-400 text-rose-200 text-[10px] font-bold">
              <Shield className="w-3 h-3 text-rose-400" /> En Güçlü Ordu (+2 ZP)
            </span>
          )}
        </div>

        {/* Canlı Takas Masası Bildirimi (Varsa) */}
        {gameView.activeTrade && (
          <button
            type="button"
            onClick={onOpenTradeModal}
            className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sky-400 hover:bg-sky-300 text-stone-950 font-extrabold text-[10px] sm:text-xs animate-pulse cursor-pointer shadow"
          >
            <ArrowRightLeft className="w-3 h-3" />
            <span>Takas Masası Açık ({gameView.activeTrade.counterOffers.length} Teklif)</span>
          </button>
        )}
      </div>

      {/* DOKUNSAL İNŞA VE KART BIRAKMA ALANI (Tuğla / Yol / Köy buraya sürüklenir) */}
      <div className="mb-2.5">
        <TactileDropZone
          canAct={canAct}
          selectedCard={selectedMarketCard}
          onDropCard={handleDropCard}
          onClearSelectedCard={onClearSelectedCard}
        />
      </div>

      {/* ANA MASA KATMANI: Sol = Yelpaze El, Orta = Yapılar + Liman/Takas Çipleri, Sağ = Hearthstone Tur Diski */}
      <div className="flex flex-col lg:flex-row items-center justify-between gap-3">
        {/* SOL: ELDEKİ KAYNAK KARTLARI (FannedHand) */}
        <div className="flex flex-col items-center justify-center shrink-0">
          <div className="flex items-center justify-between w-full mb-0.5 px-2">
            <span className="text-[11px] font-bold text-amber-200/90">
              Eldeki Kaynaklar ({gameView.myHand.length})
            </span>
            {gameView.myHand.length > 7 + myPlayer.knightsCount && (
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-500/20 border border-rose-400 text-rose-200 font-semibold">
                &gt;{7 + myPlayer.knightsCount} (Hırsız Riski!)
              </span>
            )}
          </div>
          <FannedHand
            hand={gameView.myHand}
            isFourPlayer={isFourPlayer}
            align={isFourPlayer ? 'bottom-right' : 'bottom-center'}
            onInspectCard={(card) => {
              const resType = typeof card === 'string' ? card : card.type;
              onInspectCard?.({
                imageUrl: `/cards/resource/resource_${resType}.png`,
                title: RESOURCE_LABELS_TR[resType],
                subtitle: 'Hammadde Kaynak Kartı',
                description: `Elinizdeki ${RESOURCE_LABELS_TR[resType]} kaynağı. İnşaat ve takaslarda kullanılır. Masaya veya takasa sürükleyebilirsiniz.`,
              });
            }}
          />
        </div>

        {/* ORTA: OYUNCUNUN İNŞA ETTİĞİ YAPILAR & DOKUNSAL LİMAN / TAKAS MASASI */}
        <div className="flex-1 flex flex-col items-center justify-center w-full min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] sm:text-[11px] font-bold text-amber-200/80">
              Kurulu Yapılarım
            </span>

            {/* Dokunsal Masaüstü Liman Çipi */}
            {myPlayer.roadsCount > 0 && (
              <button
                type="button"
                disabled={!canUseHarbor}
                onClick={onOpenHarborModal}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition shadow ${
                  canUseHarbor
                    ? 'bg-amber-500 hover:bg-amber-400 text-stone-950 cursor-pointer ring-1 ring-amber-300 animate-pulse'
                    : 'bg-stone-800/80 text-stone-400 border border-stone-700/60 cursor-pointer'
                }`}
                title={`Liman Etkisi: ${harborRatioNeed}:1 oranında takas yap`}
              >
                <Anchor className="w-3 h-3" />
                <span>
                  Liman ({harborRatioNeed}:1)
                  {gameView.hasUsedHarborThisTurn ? ' ✓' : ''}
                </span>
              </button>
            )}

            {/* Dokunsal Masaüstü Canlı Takas Çipi */}
            <button
              type="button"
              disabled={!canInitiateTrade}
              onClick={onOpenTradeModal}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition shadow ${
                gameView.activeTrade
                  ? 'bg-sky-400 text-stone-950 ring-2 ring-sky-300 animate-pulse cursor-pointer'
                  : canInitiateTrade
                  ? 'bg-sky-600 hover:bg-sky-500 text-white cursor-pointer'
                  : 'bg-stone-800/80 text-stone-400 border border-stone-700/60 cursor-pointer'
              }`}
              title="Oyuncular Arası Canlı Takas Masası"
            >
              <ArrowRightLeft className="w-3 h-3" />
              <span>Takas {gameView.hasTradedThisTurn ? ' ✓' : ''}</span>
            </button>
          </div>

          <div className="flex items-start justify-center gap-2 sm:gap-3 overflow-x-auto pb-1 max-w-full">
            {/* Cascading Yollar */}
            {myPlayer.roadsCount > 0 && (
              <div className="flex flex-col items-center shrink-0">
                <CascadingStructureStack
                  type="road"
                  count={myPlayer.roadsCount}
                  onInspectCard={onInspectCard}
                />
              </div>
            )}

            {/* Cascading Şövalyeler */}
            {myPlayer.knightsCount > 0 && (
              <div className="flex flex-col items-center shrink-0">
                <CascadingStructureStack
                  type="knight"
                  count={myPlayer.knightsCount}
                  onInspectCard={onInspectCard}
                />
              </div>
            )}

            {/* Yan Yana Köy / Şehir / Büyükşehir Slotları */}
            <div className="flex items-end gap-1.5 sm:gap-2 shrink-0">
              {myPlayer.villageSlots.map((slot, idx) => (
                <VillageSlotVisual
                  key={slot.id}
                  slot={slot}
                  index={idx}
                  onInspectCard={onInspectCard}
                />
              ))}
            </div>
          </div>
        </div>

        {/* SAĞ: HEARTHSTONE TARZI 'TURU BİTİR' DİSKİ */}
        <div className="shrink-0 flex items-center justify-center p-1">
          <TurnDisc
            isMyTurn={isMyTurn}
            canAct={canAct}
            remainingSeconds={remainingSeconds}
            onEndTurn={onEndTurn}
            activePlayerNickname={
              gameView.players[gameView.activePlayerIndex]?.nickname
            }
            turnPhase={gameView.turnPhase}
          />
        </div>
      </div>
    </section>
  );
};
