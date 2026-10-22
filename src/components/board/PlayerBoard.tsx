'use client';

import React, { useEffect, useState } from 'react';
import {
  ClientGameView,
  PublicPlayerState,
  ResourceType,
  RESOURCE_LABELS_TR,
} from '../../types/game';
import { CardVisual } from '../cards/CardVisual';
import { CascadingStructureStack, InspectCardInfo, VillageSlotVisual } from './OpponentArea';
import { FannedHand } from './FannedHand';
import {
  Anchor,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  Crown,
  Pickaxe,
  Shield,
  Trophy,
} from 'lucide-react';

export interface PlayerBoardProps {
  gameView: ClientGameView;
  myPlayer: PublicPlayerState;
  isMyTurn: boolean;
  onProduce: () => void;
  onOpenHarborModal: () => void;
  onOpenTradeModal: () => void;
  onEndTurn: () => void;
  onInspectCard?: (info: InspectCardInfo) => void;
  isFourPlayer?: boolean;
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
  onProduce,
  onOpenHarborModal,
  onOpenTradeModal,
  onEndTurn,
  onInspectCard,
  isFourPlayer = false,
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

  const canProduce =
    isMyTurn && gameView.turnPhase === 'production' && !gameView.pendingEvent;
  const canAct =
    isMyTurn && gameView.turnPhase === 'action' && !gameView.pendingEvent;

  const canUseHarbor =
    canAct &&
    !gameView.hasUsedHarborThisTurn &&
    myPlayer.roadsCount >= 1 &&
    hasEnoughForHarbor;

  const canInitiateTrade =
    canAct && !gameView.hasTradedThisTurn && gameView.myHand.length > 0;

  return (
    <section
      aria-label="Oyuncu Alanı ve Kontroller"
      className={`w-full rounded-2xl border-2 p-3 md:p-4 shadow-2xl transition-all ${
        isMyTurn
          ? 'border-yellow-400 bg-gradient-to-b from-stone-900 via-stone-950 to-black ring-2 ring-yellow-400/30'
          : 'border-amber-500/30 bg-stone-950/95'
      }`}
    >
      {/* Üst Satır: Oyuncu Kimliği, Zafer Puanı, Tur Aşaması ve Tur Sayacı */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-amber-500/20">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-400 shadow shadow-emerald-400/50" />
            <h2 className="text-base md:text-lg font-extrabold text-amber-100">
              {myPlayer.nickname} (Sen)
            </h2>
          </div>

          <div className="flex items-center gap-1 bg-yellow-400 text-stone-950 font-black px-3 py-1 rounded-xl text-xs md:text-sm shadow">
            <Trophy className="w-4 h-4" />
            <span>{myPlayer.victoryPoints} / 7 ZP</span>
          </div>

          <span className="text-xs px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-400/30 text-amber-200 font-semibold">
            Tur Üretimin: +{productionTotal} Kaynak (Rakipler: +1)
          </span>

          {myPlayer.hasLongestRoad && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-yellow-500/20 border border-yellow-400 text-yellow-200 text-xs font-bold">
              <Crown className="w-3.5 h-3.5 text-yellow-400" /> En Uzun Yol (+2 ZP)
            </span>
          )}

          {myPlayer.hasLargestArmy && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/20 border border-rose-400 text-rose-200 text-xs font-bold">
              <Shield className="w-3.5 h-3.5 text-rose-400" /> En Güçlü Ordu (+2 ZP)
            </span>
          )}
        </div>

        {/* Sağ Üst: Tur Durumu & Süre Sayacı */}
        <div className="flex items-center gap-2">
          <div
            className={`px-3 py-1 rounded-xl text-xs font-bold border ${
              isMyTurn
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                : 'bg-stone-800 border-stone-700 text-stone-300'
            }`}
          >
            {isMyTurn
              ? gameView.turnPhase === 'production'
                ? 'Sıra Sende: 1. Üretim Aşaması'
                : gameView.turnPhase === 'resolving_event'
                ? 'Olay Çözümleniyor...'
                : 'Sıra Sende: 2. İnşaat & Ticaret'
              : 'Rakibin Turu Bekleniyor'}
          </div>

          {remainingSeconds !== null ? (
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-extrabold border ${
                remainingSeconds <= 15
                  ? 'bg-rose-600/30 border-rose-400 text-rose-200 animate-pulse'
                  : 'bg-amber-950/80 border-amber-500/40 text-amber-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{remainingSeconds} sn</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-medium bg-stone-900 border border-stone-700 text-stone-400">
              <Clock className="w-3.5 h-3.5" />
              <span>Süresiz</span>
            </div>
          )}
        </div>
      </div>

      {/* Tur Aksiyon Butonları (Mobil ve Masaüstü Duyarlı Kontrol Çubuğu) */}
      <div className="flex flex-wrap items-center gap-2 mb-4 bg-stone-900/90 p-2.5 rounded-xl border border-amber-500/20">
        {/* 1. ÜRETİM YAP */}
        <button
          type="button"
          disabled={!canProduce}
          onClick={onProduce}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-extrabold text-xs md:text-sm transition shadow ${
            canProduce
              ? 'bg-emerald-500 hover:bg-emerald-400 text-stone-950 cursor-pointer ring-2 ring-emerald-300 animate-bounce'
              : 'bg-stone-800 text-stone-500 cursor-not-allowed'
          }`}
        >
          <Pickaxe className="w-4 h-4" />
          <span>Üretim Başlat (Sana +{productionTotal}, Rakiplere +1 Kaynak)</span>
        </button>

        {/* 2. LİMAN ETKİSİ (YOL TAKASI) */}
        <button
          type="button"
          disabled={!canUseHarbor}
          onClick={onOpenHarborModal}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs md:text-sm transition shadow ${
            canUseHarbor
              ? 'bg-amber-500 hover:bg-amber-400 text-stone-950 cursor-pointer'
              : 'bg-stone-800 text-stone-500 cursor-not-allowed'
          }`}
        >
          <Anchor className="w-4 h-4" />
          <span>
            Liman Takası ({harborRatioNeed}:1)
            {gameView.hasUsedHarborThisTurn ? ' [Kullanıldı]' : ''}
          </span>
        </button>

        {/* 3. OYUNCUYLA TAKAS BAŞLAT */}
        <button
          type="button"
          disabled={!canInitiateTrade}
          onClick={onOpenTradeModal}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs md:text-sm transition shadow ${
            canInitiateTrade
              ? 'bg-sky-500 hover:bg-sky-400 text-stone-950 cursor-pointer'
              : 'bg-stone-800 text-stone-500 cursor-not-allowed'
          }`}
        >
          <ArrowRightLeft className="w-4 h-4" />
          <span>
            Oyuncuyla Takas
            {gameView.hasTradedThisTurn ? ' [Kullanıldı]' : ''}
          </span>
        </button>

        {/* 4. TURU BİTİR */}
        <button
          type="button"
          disabled={!canAct}
          onClick={onEndTurn}
          className={`ml-auto flex items-center gap-2 px-4 py-2 rounded-xl font-extrabold text-xs md:text-sm transition shadow ${
            canAct
              ? 'bg-rose-600 hover:bg-rose-500 text-white cursor-pointer'
              : 'bg-stone-800 text-stone-500 cursor-not-allowed'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Turu Bitir</span>
        </button>
      </div>

      {/* Alt İki Sütun: Sol = Oyuncunun Elindeki Açık Kaynaklar (Yelpaze Düzeni), Sağ = Oyuncunun Yapıları */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
        {/* ELDEKİ AÇIK KAYNAK KARTLARI (FannedHand) */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center p-2">
          <div className="flex items-center justify-between w-full mb-1 px-2">
            <h3 className="text-xs md:text-sm font-bold text-amber-200">
              Elimdeki Kaynak Kartları ({gameView.myHand.length})
            </h3>
            {gameView.myHand.length > 7 + myPlayer.knightsCount && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 border border-rose-400 text-rose-200 font-semibold">
                &gt;{7 + myPlayer.knightsCount} Kart (Hırsız Riski!)
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
                description: `Elinizdeki ${RESOURCE_LABELS_TR[resType]} kaynağı. İnşaat ve takaslarda kullanılır.`,
              });
            }}
          />
        </div>

        {/* OYUNCUNUN İNŞA ETTİĞİ YAPILAR */}
        <div className="lg:col-span-7 rounded-xl bg-stone-900/70 border border-amber-500/20 p-3">
          <h3 className="text-xs md:text-sm font-bold text-amber-200 mb-2">
            Yapılarım (Yol, Şövalye ve Köy / Şehir / Büyükşehir Slotları)
          </h3>

          <div className="flex items-start gap-3 sm:gap-4 overflow-x-auto pb-2 pt-1">
            {/* Cascading Yollar */}
            {myPlayer.roadsCount > 0 && (
              <div className="flex flex-col items-center shrink-0">
                <span className="text-xs font-bold text-amber-300 mb-1.5">
                  Yollar ({myPlayer.roadsCount}) • Liman {harborRatioNeed}:1
                </span>
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
                <span className="text-xs font-bold text-rose-300 mb-1.5">
                  Şövalyeler ({myPlayer.knightsCount}) • Hırsız Limiti: {7 + myPlayer.knightsCount}
                </span>
                <CascadingStructureStack
                  type="knight"
                  count={myPlayer.knightsCount}
                  onInspectCard={onInspectCard}
                />
              </div>
            )}

            {/* Yan Yana Köy / Şehir / Büyükşehir Slotları */}
            <div className="flex flex-col shrink-0">
              <span className="text-xs font-bold text-amber-100 mb-1.5">
                Köy / Şehir / Büyükşehir Slotları ({myPlayer.villageSlots.length})
              </span>
              <div className="flex items-end gap-2.5">
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
        </div>
      </div>
    </section>
  );
};
