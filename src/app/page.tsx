'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  AuthoritativeGameState,
  BuildingCardType,
  ClientGameView,
  ResourceType,
  StructureType,
  RESOURCE_LABELS_TR,
} from '@/types/game';
import {
  GuestSession,
  MultiplayerSyncManager,
  initiateTrade,
  submitCounterOffer,
  acceptTradeOffer,
  rejectTradeOffer,
  cancelTrade,
  toClientGameView,
} from '@/lib/multiplayer/syncManager';
import {
  executeProductionPhase,
  executeHarborTrade,
  executeBuildStructure,
  submitRobberDiscard,
  submitCharityGive,
  endTurn,
} from '@/lib/engine/gameEngine';
import { LobbyView } from '@/components/lobby/LobbyView';
import {
  MarketArea,
  canAffordStructure,
  getMissingResourcesDescription,
  SelectedCardState,
} from '@/components/board/MarketArea';
import {
  OpponentArea,
  OpponentQuadrantSeat,
  VillageSlotVisual,
  CascadingStructureStack,
  InspectCardInfo,
  STRUCTURE_CARD_DESCRIPTIONS,
} from '@/components/board/OpponentArea';
import {
  PlayerBoard,
  calculateProductionCount,
  getHarborRequiredCount,
} from '@/components/board/PlayerBoard';
import { FannedHand } from '@/components/board/FannedHand';
import { TurnDisc } from '@/components/board/TurnDisc';
import { TactileDropZone } from '@/components/board/TactileDropZone';
import { CardInspectModal } from '@/components/modals/CardInspectModal';
import { VictoryModal } from '@/components/modals/VictoryModal';
import { TableDealOverlay } from '@/components/animations/TableDealOverlay';
import { RuleSummaryModal } from '@/components/modals/RuleSummaryModal';
import { HarborModal } from '@/components/modals/HarborModal';
import { TradeModal } from '@/components/modals/TradeModal';
import { EventResolutionModal } from '@/components/modals/EventResolutionModal';
import { CardKind } from '@/components/cards/CardVisual';
import {
  Anchor,
  ArrowLeftRight,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Clock,
  Crown,
  History,
  LogOut,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';

interface InspectModalState {
  card: CardKind | null;
  customImageUrl?: string;
  subtitle?: string;
  canBuild?: boolean;
  onBuild?: () => void;
  buildLabel?: string;
}

interface TactileToast {
  text: string;
  type: 'info' | 'error' | 'success';
}

export default function CatanCardGamePage() {
  const [authState, setAuthState] = useState<AuthoritativeGameState | null>(null);
  const [clientView, setClientView] = useState<ClientGameView | null>(null);
  const [viewerPlayerId, setViewerPlayerId] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);

  // Dokunsal Kart Etkileşimi (Seçim, Sürükle-Bırak & Geri Yaylanma / Shake)
  const [selectedCard, setSelectedCard] = useState<SelectedCardState | null>(null);
  const [shakingCardKey, setShakingCardKey] = useState<number | 'metropolis' | null>(null);
  const [tactileToast, setTactileToast] = useState<TactileToast | null>(null);

  // Modallar ve İnceleme Katmanları
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [isHarborModalOpen, setIsHarborModalOpen] = useState(false);
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [isVictoryModalOpen, setIsVictoryModalOpen] = useState(false);
  const [inspectModal, setInspectModal] = useState<InspectModalState | null>(null);

  // Animasyon Durumları
  const [isDealOverlayActive, setIsDealOverlayActive] = useState<boolean>(false);
  const [shuffleKey, setShuffleKey] = useState<number>(0);
  const [isLogsExpanded, setIsLogsExpanded] = useState<boolean>(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  const syncManagerRef = useRef<MultiplayerSyncManager | null>(null);

  // Bildirimleri 3.5 saniye sonra otomatik temizle
  useEffect(() => {
    if (!tactileToast) return;
    const timer = setTimeout(() => {
      setTactileToast(null);
    }, 3500);
    return () => clearTimeout(timer);
  }, [tactileToast]);

  // Oda aktif olduğunda MultiplayerSyncManager bağla
  useEffect(() => {
    if (!authState?.roomCode || !viewerPlayerId) return;

    const manager = new MultiplayerSyncManager(authState.roomCode, viewerPlayerId);
    manager.connect();
    const unsubscribe = manager.subscribe((nextAuth, nextView) => {
      setAuthState(nextAuth);
      setClientView(nextView);
    });

    syncManagerRef.current = manager;

    return () => {
      unsubscribe();
      manager.disconnect();
      syncManagerRef.current = null;
    };
  }, [authState?.roomCode, viewerPlayerId]);

  // Tur Süresi Sayacı
  useEffect(() => {
    if (!clientView || clientView.status !== 'playing') {
      setRemainingSeconds(null);
      return;
    }
    const timeoutSec = clientView.settings.turnTimeoutSeconds;
    if (!timeoutSec || timeoutSec <= 0) {
      setRemainingSeconds(null);
      return;
    }

    const updateTimer = () => {
      const startedMs = new Date(clientView.turnStartedAt).getTime();
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
  }, [clientView?.turnStartedAt, clientView?.settings?.turnTimeoutSeconds, clientView?.status]);

  const commitAuthoritativeUpdate = (nextState: AuthoritativeGameState) => {
    setActionError(null);
    if (syncManagerRef.current) {
      syncManagerRef.current.broadcastState(nextState);
    } else {
      setAuthState(nextState);
      setClientView(toClientGameView(nextState, viewerPlayerId));
    }
  };

  const handleGameStarted = (
    initialAuth: AuthoritativeGameState,
    initialView: ClientGameView,
    session: GuestSession
  ) => {
    setViewerPlayerId(session.playerId);
    setAuthState(initialAuth);
    setClientView(initialView);
    // Oyun başı kart karma ve masaya dizilme animasyonunu tetikle
    setShuffleKey((k) => k + 1);
    setIsDealOverlayActive(true);
  };

  const handleSwitchPerspective = (targetPlayerId: string) => {
    setViewerPlayerId(targetPlayerId);
    setSelectedCard(null);
    if (syncManagerRef.current) {
      syncManagerRef.current.setViewerPlayerId(targetPlayerId);
    } else if (authState) {
      setClientView(toClientGameView(authState, targetPlayerId));
    }
  };

  const handleLeaveToLobby = () => {
    if (syncManagerRef.current) {
      syncManagerRef.current.disconnect();
      syncManagerRef.current = null;
    }
    setAuthState(null);
    setClientView(null);
    setActionError(null);
    setSelectedCard(null);
  };

  // --- OYUNCU VE MASA DURUMU ---
  const activePlayer = clientView ? clientView.players[clientView.activePlayerIndex] : null;
  const myPlayer = clientView
    ? clientView.players.find((p) => p.playerId === clientView.myPlayerId) ??
      clientView.players[0]
    : null;
  const isMyTurn = activePlayer?.playerId === myPlayer?.playerId;

  // --- KURAL GEREĞİ 1. AŞAMA: OTOMATİK HASAT (Üretim Aşaması Otomasyonu) ---
  // Tur başladığında oyuncunun 'Üretim Başlat' butonuna basmasına gerek yok!
  // Sıra geldiğinde hasat otomatik tamamlanır, kaynaklar desteden çekilir ve Aksiyon aşamasına geçilir.
  useEffect(() => {
    if (!authState || !clientView || clientView.status !== 'playing') return;
    if (clientView.turnPhase !== 'production' || clientView.pendingEvent) return;
    if (!isMyTurn || !myPlayer) return;

    const timer = setTimeout(() => {
      try {
        const prodCount = calculateProductionCount(myPlayer);
        const next = executeProductionPhase(authState, myPlayer.playerId);
        commitAuthoritativeUpdate(next);
        setTactileToast({
          text: `🌾 Hasat Dönemi: +${prodCount} kaynak topladınız! Aksiyon aşaması başladı.`,
          type: 'info',
        });
      } catch (err) {
        console.error('Otomatik hasat hatası:', err);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [
    clientView?.turnNumber,
    clientView?.turnPhase,
    clientView?.pendingEvent,
    isMyTurn,
    myPlayer?.playerId,
  ]);

  // Lobi görünümü
  if (!authState || !clientView || authState.status === 'waiting' || !myPlayer) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-[#2b080e] via-[#1a0408] to-[#100204] text-amber-50">
        <LobbyView
          onGameStarted={handleGameStarted}
          onStateUpdated={(nextAuth, nextView) => {
            if (nextAuth.status === 'playing' || nextAuth.status === 'finished') {
              setAuthState(nextAuth);
              setClientView(nextView);
            }
          }}
        />
      </main>
    );
  }

  const opponents = clientView.players.filter(
    (p) => p.playerId !== myPlayer.playerId
  );
  const winnerPlayer = clientView.winnerPlayerId
    ? clientView.players.find((p) => p.playerId === clientView.winnerPlayerId)
    : null;

  // Üretim & Takas Hesaplamaları
  const productionTotal = calculateProductionCount(myPlayer);
  const harborRatioNeed = getHarborRequiredCount(myPlayer.roadsCount);
  const canAct =
    isMyTurn && clientView.turnPhase === 'action' && !clientView.pendingEvent;
  const canUseHarbor =
    canAct && !clientView.hasUsedHarborThisTurn && myPlayer.roadsCount >= 1;
  const canInitiateTrade =
    canAct && !clientView.hasTradedThisTurn && clientView.myHand.length > 0;

  const hasAvailableVillageForCity =
    myPlayer.villageSlots.some((slot) => slot.upgradedTo === 'none');
  const hasAvailableCityForMetropolis =
    myPlayer.villageSlots.some((slot) => slot.upgradedTo === 'city');
  const canBuildMetropolisNow =
    canAct &&
    clientView.metropolisDeckCount > 0 &&
    hasAvailableCityForMetropolis &&
    canAffordStructure(clientView.myHand, 'metropolis');

  const triggerInvalidBuildShake = (
    marketIndex: number | 'metropolis' | undefined,
    reason: string
  ) => {
    if (marketIndex !== undefined) {
      setShakingCardKey(marketIndex);
      setTimeout(() => setShakingCardKey(null), 500);
    }
    setTactileToast({ text: `⚠️ ${reason}`, type: 'error' });
  };

  // --- OYUN MOTORU AKSİYONLARI ---
  const handleConfirmHarborTrade = (
    giveResource: ResourceType,
    takeResource: ResourceType
  ) => {
    try {
      const next = executeHarborTrade(
        authState,
        myPlayer.playerId,
        giveResource,
        takeResource
      );
      commitAuthoritativeUpdate(next);
      setTactileToast({
        text: `⚓ Liman takası tamamlandı! 1 ${RESOURCE_LABELS_TR[takeResource]} aldınız.`,
        type: 'success',
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Liman takası hatası.');
    }
  };

  const handleBuildMarketCard = (_marketIndex: number, cardType: BuildingCardType) => {
    try {
      const prevLongest = clientView.players.find((p) => p.hasLongestRoad)?.playerId;
      const prevLargest = clientView.players.find((p) => p.hasLargestArmy)?.playerId;

      const next = executeBuildStructure(authState, myPlayer.playerId, cardType);
      commitAuthoritativeUpdate(next);
      setInspectModal(null);
      setSelectedCard(null);

      // Otomatik Takdim Kontrolleri (En Uzun Yol / En Güçlü Ordu)
      const nextLongest = next.players.find((p) => p.hasLongestRoad)?.playerId;
      const nextLargest = next.players.find((p) => p.hasLargestArmy)?.playerId;

      if (nextLongest === myPlayer.playerId && prevLongest !== myPlayer.playerId) {
        setTactileToast({
          text: `👑 Tebrikler! En Uzun Yol takdim edildi (+2 ZP)!`,
          type: 'success',
        });
      } else if (nextLargest === myPlayer.playerId && prevLargest !== myPlayer.playerId) {
        setTactileToast({
          text: `🛡️ Tebrikler! En Güçlü Ordu takdim edildi (+2 ZP)!`,
          type: 'success',
        });
      } else {
        const title = STRUCTURE_CARD_DESCRIPTIONS[cardType]?.title || cardType;
        setTactileToast({
          text: `🔨 ${title} başarıyla masanıza yerleştirildi!`,
          type: 'success',
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'İnşaat hatası.';
      setActionError(msg);
      setTactileToast({ text: `⚠️ ${msg}`, type: 'error' });
    }
  };

  const handleBuildMetropolis = () => {
    try {
      const next = executeBuildStructure(authState, myPlayer.playerId, 'metropolis');
      commitAuthoritativeUpdate(next);
      setInspectModal(null);
      setSelectedCard(null);
      setTactileToast({
        text: `🏛️ Tebrikler! Şehrinizi Büyükşehre yükselttiniz (+1 ZP)!`,
        type: 'success',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Büyükşehir inşası hatası.';
      setActionError(msg);
      setTactileToast({ text: `⚠️ ${msg}`, type: 'error' });
    }
  };

  // Dokunsal Sürükle-Bırak veya Dokunarak Yerleştirme
  const handleTactileDropCard = (cardType: StructureType, marketIndex?: number) => {
    if (!canAct) {
      triggerInvalidBuildShake(
        marketIndex,
        'Sıra sizde değil veya oyun aksiyon aşamasında değil!'
      );
      return;
    }

    if (cardType === 'metropolis') {
      if (!canBuildMetropolisNow) {
        let reason = 'Büyükşehir için yeterli kaynak yok (Gereken: 3 Yün + 1 Demir)';
        if (!hasAvailableCityForMetropolis) {
          reason = 'Büyükşehir kurmak için önce kurulu bir Şehriniz olmalıdır!';
        }
        triggerInvalidBuildShake('metropolis', reason);
        return;
      }
      handleBuildMetropolis();
      return;
    }

    const foundIdx =
      marketIndex !== undefined
        ? marketIndex
        : clientView.cardMarket.indexOf(cardType as BuildingCardType);

    if (foundIdx === -1) {
      triggerInvalidBuildShake(undefined, `${cardType} markette bulunmuyor!`);
      return;
    }

    if (!canAffordStructure(clientView.myHand, cardType)) {
      const missing = getMissingResourcesDescription(clientView.myHand, cardType);
      triggerInvalidBuildShake(foundIdx, `Yetersiz kaynak! Eksik: ${missing}`);
      return;
    }

    if (cardType === 'city' && !hasAvailableVillageForCity) {
      triggerInvalidBuildShake(foundIdx, 'Şehir kurmak için boş bir Köyünüz olmalıdır!');
      return;
    }

    handleBuildMarketCard(foundIdx, cardType as BuildingCardType);
  };

  const handleEndTurn = () => {
    try {
      setSelectedCard(null);
      const next = endTurn(authState, myPlayer.playerId);
      commitAuthoritativeUpdate(next);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Tur bitirme hatası.');
    }
  };

  const handleRobberDiscard = (discardedResources: ResourceType[]) => {
    try {
      const next = submitRobberDiscard(
        authState,
        myPlayer.playerId,
        discardedResources
      );
      commitAuthoritativeUpdate(next);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Hırsız kart atma hatası.');
    }
  };

  const handleCharityGive = (targetPlayerId: string, resource: ResourceType) => {
    try {
      const next = submitCharityGive(
        authState,
        myPlayer.playerId,
        targetPlayerId,
        resource
      );
      commitAuthoritativeUpdate(next);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Sadaka verme hatası.');
    }
  };

  // --- CANLI TİCARET (TAKAS) AKSİYONLARI ---
  const handleInitiateTrade = (
    wantedResources: ResourceType[],
    offeredResources: ResourceType[]
  ) => {
    const res = initiateTrade(
      authState,
      myPlayer.playerId,
      wantedResources,
      offeredResources
    );
    if (res.ok && res.state) {
      commitAuthoritativeUpdate(res.state);
    }
    return { ok: res.ok, error: res.error };
  };

  const handleSubmitCounterOffer = (
    offeredResources: ResourceType[],
    requestedResources: ResourceType[]
  ) => {
    const res = submitCounterOffer(
      authState,
      myPlayer.playerId,
      offeredResources,
      requestedResources
    );
    if (res.ok && res.state) {
      commitAuthoritativeUpdate(res.state);
    }
    return { ok: res.ok, error: res.error };
  };

  const handleAcceptTradeOffer = (offerId: string) => {
    const res = acceptTradeOffer(authState, myPlayer.playerId, offerId);
    if (res.ok && res.state) {
      commitAuthoritativeUpdate(res.state);
    }
    return {
      ok: res.ok,
      error: res.error,
      bonusCardDrawn: res.bonusCardDrawn,
    };
  };

  const handleRejectTradeOffer = (offerId: string) => {
    const res = rejectTradeOffer(authState, myPlayer.playerId, offerId);
    if (res.ok && res.state) {
      commitAuthoritativeUpdate(res.state);
    }
    return { ok: res.ok, error: res.error };
  };

  const handleCancelTrade = () => {
    const res = cancelTrade(authState, myPlayer.playerId);
    if (res.ok && res.state) {
      commitAuthoritativeUpdate(res.state);
    }
    return { ok: res.ok, error: res.error };
  };

  // --- KART İNCELEME MODAL TETİKLEYİCİLERİ ---
  const handleInspectCard = (info: InspectCardInfo) => {
    setInspectModal({
      card: null,
      customImageUrl: info.imageUrl,
      subtitle: info.subtitle || info.title,
      canBuild: info.canBuild,
      onBuild: info.onBuild,
      buildLabel: 'İnşa Et',
    });
  };

  const handleInspectMarketCard = (info: InspectCardInfo, marketIndex?: number) => {
    const cardType =
      marketIndex !== undefined ? clientView.cardMarket[marketIndex] : undefined;
    const canAfford = cardType ? canAffordStructure(clientView.myHand, cardType) : false;
    const canBuild = canAct && canAfford;

    setInspectModal({
      card: cardType ? { category: 'structure', type: cardType } : null,
      customImageUrl: info.imageUrl,
      subtitle: info.subtitle || info.title,
      canBuild: info.canBuild ?? canBuild,
      onBuild:
        info.onBuild ??
        (canBuild && cardType && marketIndex !== undefined
          ? () => handleBuildMarketCard(marketIndex, cardType)
          : undefined),
      buildLabel: info.title.includes('Büyükşehir') ? 'Büyükşehir İnşa Et' : 'İnşa Et',
    });
  };

  const handleInspectHandCard = (card: ResourceType | { id?: string; type: ResourceType }) => {
    const resType = typeof card === 'string' ? card : card.type;
    setInspectModal({
      card: { category: 'resource', type: resType },
      customImageUrl: `/cards/resource/resource_${resType}.png`,
      subtitle: `${RESOURCE_LABELS_TR[resType]} Hammadde Kartı`,
    });
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_center,_#3e0a14_0%,_#2b080e_65%,_#140205_100%)] text-amber-50 p-1.5 sm:p-2 md:p-3 flex flex-col gap-2 max-w-[1720px] mx-auto select-none">
      {/* DOKUNSAL GERİ BİLDİRİM / TOAST BANNER */}
      {tactileToast && (
        <div
          role="status"
          className={`fixed top-12 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl shadow-2xl backdrop-blur-md text-xs sm:text-sm font-extrabold border animate-catan-card-place flex items-center gap-2 ${
            tactileToast.type === 'success'
              ? 'bg-emerald-950/95 border-emerald-400 text-emerald-100 ring-2 ring-emerald-400/40'
              : tactileToast.type === 'error'
              ? 'bg-rose-950/95 border-rose-400 text-rose-100 ring-2 ring-rose-400/40'
              : 'bg-amber-950/95 border-amber-400 text-amber-100 ring-2 ring-amber-400/40'
          }`}
        >
          <span>{tactileToast.text}</span>
          <button
            type="button"
            onClick={() => setTactileToast(null)}
            className="ml-2 text-stone-400 hover:text-white text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* ÜST GEZİNTİ ÇUBUĞU (Kompakt ve Şeffaf) */}
      <header className="rounded-2xl border border-amber-500/30 bg-[#160205]/90 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shadow-xl backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Crown className="w-4 h-4 text-amber-400" />
            <span className="font-black text-xs sm:text-sm tracking-wide text-amber-100">
              CATAN KART OYUNU
            </span>
          </div>

          <span className="text-[11px] font-mono font-bold px-2 py-0.2 rounded-lg bg-amber-500/15 border border-amber-400/30 text-amber-200">
            Oda: {clientView.roomCode}
          </span>

          <span className="text-[11px] font-bold px-2 py-0.2 rounded-lg bg-stone-900 border border-stone-700 text-stone-200">
            Tur #{clientView.turnNumber} • Sıra:{' '}
            <strong className="text-yellow-300">{activePlayer?.nickname}</strong>
          </span>

          {clientView.activeTrade && (
            <button
              type="button"
              onClick={() => setIsTradeModalOpen(true)}
              className="flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-sky-400 hover:bg-sky-300 text-stone-950 font-extrabold text-[11px] animate-pulse cursor-pointer shadow"
            >
              <ArrowLeftRight className="w-3 h-3" />
              <span>Canlı Takas Masası ({clientView.activeTrade.counterOffers.length})</span>
            </button>
          )}
        </div>

        {/* Sağ: RLS Perspektifi Seçici & Animasyon / Kural / Lobi Butonları */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Oyuncu Perspektifi Değiştirici */}
          <div className="flex items-center gap-1 bg-[#240306] border border-amber-500/30 rounded-xl px-1.5 py-0.5">
            <Users className="w-3 h-3 text-amber-400 mr-0.5" />
            <span className="text-[10px] text-stone-400 hidden sm:inline mr-1">
              Görünüm:
            </span>
            {clientView.players.map((p) => {
              const isViewing = p.playerId === myPlayer.playerId;
              const isTurn = p.playerId === activePlayer?.playerId;
              return (
                <button
                  key={p.playerId}
                  type="button"
                  onClick={() => handleSwitchPerspective(p.playerId)}
                  className={`px-1.5 py-0.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                    isViewing
                      ? 'bg-amber-500 text-stone-950 shadow'
                      : 'bg-stone-900 hover:bg-stone-800 text-stone-300'
                  }`}
                  title={`${p.nickname} gözünden bak`}
                >
                  {p.nickname}
                  {isTurn ? ' ★' : ''}
                </button>
              );
            })}
          </div>

          {/* Zafer Ekranı Butonu (Oyun bittiğinde veya inceleme için) */}
          {(clientView.status === 'finished' || winnerPlayer) && (
            <button
              type="button"
              onClick={() => setIsVictoryModalOpen(true)}
              className="flex items-center gap-1 px-2 py-1 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-stone-950 text-xs font-black cursor-pointer shadow"
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>Zafer</span>
            </button>
          )}

          {/* Lobiye Dön */}
          <button
            type="button"
            onClick={handleLeaveToLobby}
            className="flex items-center gap-1 px-2 py-1 rounded-xl bg-stone-900 hover:bg-rose-950/80 border border-stone-700 hover:border-rose-500/50 text-stone-300 hover:text-rose-200 text-xs font-bold cursor-pointer"
            title="Lobiye Dön"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Lobi</span>
          </button>
        </div>
      </header>

      {/* HATA BİLDİRİMİ */}
      {actionError && (
        <div className="rounded-xl border border-rose-500/70 bg-rose-950/90 px-3 py-1.5 text-xs text-rose-100 flex items-center justify-between shadow">
          <span>⚠️ {actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-xs font-bold underline ml-4 cursor-pointer"
          >
            Kapat
          </button>
        </div>
      )}

      {/* 4 OYUNCULU KADRAN DÜZENİ vs 3 OYUNCULU DÜZEN */}
      {clientView.players.length === 4 ? (
        <div className="relative w-full rounded-3xl border-2 border-amber-900/50 bg-[#2b080e] shadow-[0_25px_80px_rgba(0,0,0,0.85)] p-2 sm:p-3 overflow-hidden flex flex-col gap-2">
          {/* Masa Arka Plan Grid Kesikli Çizgileri */}
          <div className="pointer-events-none absolute inset-0 grid grid-cols-2 grid-rows-2">
            <div className="border-r border-b border-dashed border-white/20" />
            <div className="border-b border-dashed border-white/20" />
            <div className="border-r border-b border-dashed border-white/20" />
            <div className="border-b border-dashed border-white/20" />
          </div>

          {/* Üst Kadranlar: Sol Üst (Oyuncu 1) & Sağ Üst (Oyuncu 2) */}
          <div className="relative z-10 grid grid-cols-2 gap-2 sm:gap-4 items-start">
            {/* Sol Üst Çeyrek: Oyuncu 1 */}
            {opponents[0] ? (
              <OpponentQuadrantSeat
                opponent={opponents[0]}
                isCurrentTurn={opponents[0].playerId === activePlayer?.playerId}
                corner="top-left"
                onInspectCard={handleInspectCard}
              />
            ) : (
              <div />
            )}

            {/* Sağ Üst Çeyrek: Oyuncu 2 + 'masa' Başlığı */}
            <div className="relative w-full">
              <div className="pointer-events-none absolute top-0 -left-6 z-20">
                <span className="text-xs sm:text-sm font-medium text-white/90 tracking-wide">
                  masa
                </span>
              </div>
              {opponents[1] && (
                <OpponentQuadrantSeat
                  opponent={opponents[1]}
                  isCurrentTurn={opponents[1].playerId === activePlayer?.playerId}
                  corner="top-right"
                  onInspectCard={handleInspectCard}
                />
              )}
            </div>
          </div>

          {/* Orta Eksen: building row & Desteler (MarketArea) */}
          <div className="relative z-20 my-0.5">
            <MarketArea
              gameView={clientView}
              isMyTurn={isMyTurn}
              onBuildMarketCard={handleBuildMarketCard}
              onBuildMetropolis={handleBuildMetropolis}
              onOpenRuleSummary={() => setIsRuleModalOpen(true)}
              onInspectCard={handleInspectMarketCard}
              selectedCard={selectedCard}
              onSelectCard={setSelectedCard}
              shakingCardKey={shakingCardKey}
              onInvalidAttempt={(reason) =>
                setTactileToast({ text: `⚠️ ${reason}`, type: 'error' })
              }
            />
          </div>

          {/* Alt Kadranlar: Sol Alt (Oyuncu 3) & Sağ Alt (Aktif Oyuncu / Sen) */}
          <div className="relative z-10 grid grid-cols-2 gap-2 sm:gap-4 items-end">
            {/* Sol Alt Çeyrek: Oyuncu 3 */}
            {opponents[2] ? (
              <OpponentQuadrantSeat
                opponent={opponents[2]}
                isCurrentTurn={opponents[2].playerId === activePlayer?.playerId}
                corner="bottom-left"
                onInspectCard={handleInspectCard}
              />
            ) : (
              <div />
            )}

            {/* Sağ Alt Çeyrek: Aktif Oyuncu (Yapılar + Sağ Alt Yelpaze El + Dokunsal Alan + Hearthstone Tur Diski) */}
            <div className="relative flex flex-col items-end justify-between w-full h-full p-1 sm:p-2">
              {/* Aktif Oyuncu Rozeti & Liman/Takas Çipleri */}
              <div className="flex items-center gap-1.5 flex-wrap justify-end mb-1">
                <div
                  className={`z-30 flex items-center gap-1.5 px-2 py-0.5 rounded-full border backdrop-blur-xs shadow-md text-[10px] sm:text-xs ${
                    isMyTurn
                      ? 'bg-amber-950/90 border-yellow-400 text-amber-50 ring-2 ring-yellow-400/40'
                      : 'bg-black/45 border-white/20 text-amber-100/95'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  <span className="font-bold truncate max-w-[100px] sm:max-w-[140px]">
                    {myPlayer.nickname} (Sen)
                  </span>
                  <span className="inline-flex items-center gap-0.5 bg-yellow-400 text-stone-950 font-black px-1.5 py-0.2 rounded-full text-[10px]">
                    <Trophy className="w-2.5 h-2.5" />
                    {myPlayer.victoryPoints} ZP
                  </span>
                </div>

                {/* Masaüstü Liman Çipi */}
                {myPlayer.roadsCount > 0 && (
                  <button
                    type="button"
                    disabled={!canUseHarbor}
                    onClick={() => setIsHarborModalOpen(true)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shadow ${
                      canUseHarbor
                        ? 'bg-amber-500 hover:bg-amber-400 text-stone-950 cursor-pointer ring-1 ring-amber-300'
                        : 'bg-stone-800/80 text-stone-400 border border-stone-700/60 cursor-pointer'
                    }`}
                  >
                    <Anchor className="w-3 h-3" />
                    <span>Liman {harborRatioNeed}:1</span>
                  </button>
                )}

                {/* Masaüstü Takas Çipi */}
                <button
                  type="button"
                  disabled={!canInitiateTrade}
                  onClick={() => setIsTradeModalOpen(true)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shadow ${
                    clientView.activeTrade
                      ? 'bg-sky-400 text-stone-950 ring-2 ring-sky-300 animate-pulse cursor-pointer'
                      : canInitiateTrade
                      ? 'bg-sky-600 hover:bg-sky-500 text-white cursor-pointer'
                      : 'bg-stone-800/80 text-stone-400 border border-stone-700/60 cursor-pointer'
                  }`}
                >
                  <ArrowLeftRight className="w-3 h-3" />
                  <span>Takas</span>
                </button>
              </div>

              {/* Dokunsal İnşa Bırakma Alanı */}
              <div className="w-full mb-1">
                <TactileDropZone
                  canAct={canAct}
                  selectedCard={selectedCard}
                  onDropCard={handleTactileDropCard}
                  onClearSelectedCard={() => setSelectedCard(null)}
                />
              </div>

              {/* Aktif Oyuncunun Yapıları & Sağ Alt Yelpaze Eli & Hearthstone Tur Diski */}
              <div className="flex items-center justify-end gap-2 w-full">
                {/* Binalar */}
                <div className="flex items-start gap-1 sm:gap-1.5 flex-wrap justify-end">
                  {myPlayer.villageSlots.map((slot, idx) => (
                    <VillageSlotVisual
                      key={slot.id}
                      slot={slot}
                      index={idx}
                      compact
                      onInspectCard={handleInspectCard}
                    />
                  ))}
                  {myPlayer.roadsCount > 0 && (
                    <CascadingStructureStack
                      type="road"
                      count={myPlayer.roadsCount}
                      compact
                      onInspectCard={handleInspectCard}
                    />
                  )}
                  {myPlayer.knightsCount > 0 && (
                    <CascadingStructureStack
                      type="knight"
                      count={myPlayer.knightsCount}
                      compact
                      onInspectCard={handleInspectCard}
                    />
                  )}
                </div>

                {/* Sağ Alt Yelpaze Kart Eli */}
                <div className="shrink-0">
                  <FannedHand
                    hand={clientView.myHand}
                    isFourPlayer={true}
                    align="bottom-right"
                    onInspectCard={handleInspectHandCard}
                  />
                </div>

                {/* Hearthstone 'Turu Bitir' Diski */}
                <div className="shrink-0 ml-1">
                  <TurnDisc
                    isMyTurn={isMyTurn}
                    canAct={canAct}
                    remainingSeconds={remainingSeconds}
                    onEndTurn={handleEndTurn}
                    activePlayerNickname={activePlayer?.nickname}
                    turnPhase={clientView.turnPhase}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* 3 OYUNCULU DÜZEN (catan 3 player game main desk.md) */
        <div className="relative w-full rounded-3xl border-2 border-amber-900/50 bg-[#2b080e] shadow-[0_25px_80px_rgba(0,0,0,0.85)] p-2 sm:p-3 overflow-hidden flex flex-col gap-2">
          {/* 1. ÜST BÖLGE: Rakiplerin Alanı (Sol Üst & Sağ Üst) */}
          <OpponentArea
            opponents={opponents}
            activePlayerId={activePlayer?.playerId ?? ''}
            onInspectCard={handleInspectCard}
          />

          {/* 2. ORTA BÖLGE: Pazar ve building row */}
          <MarketArea
            gameView={clientView}
            isMyTurn={isMyTurn}
            onBuildMarketCard={handleBuildMarketCard}
            onBuildMetropolis={handleBuildMetropolis}
            onOpenRuleSummary={() => setIsRuleModalOpen(true)}
            onInspectCard={handleInspectMarketCard}
            selectedCard={selectedCard}
            onSelectCard={setSelectedCard}
            shakingCardKey={shakingCardKey}
            onInvalidAttempt={(reason) =>
              setTactileToast({ text: `⚠️ ${reason}`, type: 'error' })
            }
          />

          {/* 3. ALT BÖLGE: Aktif Oyuncunun Alanı (PlayerBoard) */}
          <PlayerBoard
            gameView={clientView}
            myPlayer={myPlayer}
            isMyTurn={isMyTurn}
            onOpenHarborModal={() => setIsHarborModalOpen(true)}
            onOpenTradeModal={() => setIsTradeModalOpen(true)}
            onEndTurn={handleEndTurn}
            onInspectCard={handleInspectCard}
            selectedMarketCard={selectedCard}
            onClearSelectedCard={() => setSelectedCard(null)}
            onBuildMarketCard={handleBuildMarketCard}
            onBuildMetropolis={handleBuildMetropolis}
          />
        </div>
      )}

      {/* AÇILIR KAPANIR OYUN GÜNLÜĞÜ (Kompakt Masaüstü Şeridi) */}
      <section
        aria-label="Oyun Günlüğü"
        className="rounded-2xl border border-amber-500/20 bg-[#160205]/90 p-2 shadow-md"
      >
        <button
          type="button"
          onClick={() => setIsLogsExpanded(!isLogsExpanded)}
          className="w-full flex items-center justify-between text-xs font-bold text-amber-300 cursor-pointer"
        >
          <div className="flex items-center gap-1.5">
            <History className="w-3.5 h-3.5" />
            <span>Oyun Günlüğü ({clientView.logs.length} Hamle)</span>
          </div>
          {isLogsExpanded ? (
            <ChevronUp className="w-4 h-4 text-amber-300" />
          ) : (
            <ChevronDown className="w-4 h-4 text-amber-300" />
          )}
        </button>

        {isLogsExpanded && (
          <div className="mt-2 max-h-32 overflow-y-auto space-y-1 text-xs text-stone-300 pr-2 border-t border-white/10 pt-2">
            {[...clientView.logs].reverse().map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-2 py-0.5 border-b border-white/5 last:border-0"
              >
                <span className="text-[10px] font-mono text-stone-500 shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString('tr-TR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
                <span className="text-stone-200">{log.messageTr}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* --- TÜM MODALLAR VE ANİMASYON KATMANLARI --- */}

      {/* 1. KART AÇILIŞ KARMA & MASAYA DAĞITILMA ANİMASYONU */}
      <TableDealOverlay
        active={isDealOverlayActive}
        playerCount={clientView.players.length}
        mode="opening_deal"
        triggerShuffleKey={shuffleKey}
        onComplete={() => setIsDealOverlayActive(false)}
      />

      {/* 2. KART DETAY & AÇIKLAMA İNCELEME MODALI */}
      <CardInspectModal
        card={inspectModal?.card ?? null}
        customImageUrl={inspectModal?.customImageUrl}
        subtitle={inspectModal?.subtitle}
        canBuild={inspectModal?.canBuild}
        onBuild={inspectModal?.onBuild}
        buildLabel={inspectModal?.buildLabel}
        isOpen={inspectModal !== null}
        onClose={() => setInspectModal(null)}
      />

      {/* 3. ZAFER / OYUN SONU EKRANI */}
      <VictoryModal
        gameView={clientView}
        isOpen={isVictoryModalOpen || clientView.status === 'finished'}
        onNewDemoGame={() => {
          setIsVictoryModalOpen(false);
          handleLeaveToLobby();
        }}
        onReturnToLobby={() => {
          setIsVictoryModalOpen(false);
          handleLeaveToLobby();
        }}
      />

      {/* 4. KURAL ÖZETİ MODALI */}
      <RuleSummaryModal
        isOpen={isRuleModalOpen}
        onClose={() => setIsRuleModalOpen(false)}
      />

      {/* 5. LİMAN / DENİZ TAKASI MODALI */}
      <HarborModal
        isOpen={isHarborModalOpen}
        roadsCount={myPlayer.roadsCount}
        myHand={clientView.myHand}
        onClose={() => setIsHarborModalOpen(false)}
        onConfirmHarborTrade={handleConfirmHarborTrade}
        onSwitchToPlayerTrade={() => setIsTradeModalOpen(true)}
      />

      {/* 6. OYUNCULAR ARASI CANLI TAKAS MASASI */}
      <TradeModal
        isOpen={isTradeModalOpen}
        gameView={clientView}
        onClose={() => setIsTradeModalOpen(false)}
        onInitiateTrade={handleInitiateTrade}
        onSubmitCounterOffer={handleSubmitCounterOffer}
        onAcceptOffer={handleAcceptTradeOffer}
        onRejectOffer={handleRejectTradeOffer}
        onCancelTrade={handleCancelTrade}
        onSwitchTestPlayer={handleSwitchPerspective}
        onSwitchToHarbor={() => setIsHarborModalOpen(true)}
      />

      {/* 7. OLAY KARTI ÇÖZÜMLEME MODALI */}
      <EventResolutionModal
        gameView={clientView}
        onSubmitRobberDiscard={handleRobberDiscard}
        onSubmitCharityGive={handleCharityGive}
      />
    </main>
  );
}
