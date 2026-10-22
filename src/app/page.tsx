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
import { MarketArea, canAffordStructure } from '@/components/board/MarketArea';
import {
  OpponentArea,
  OpponentQuadrantSeat,
  VillageSlotVisual,
  CascadingStructureStack,
  InspectCardInfo,
} from '@/components/board/OpponentArea';
import {
  PlayerBoard,
  calculateProductionCount,
  getHarborRequiredCount,
} from '@/components/board/PlayerBoard';
import { FannedHand } from '@/components/board/FannedHand';
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
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Crown,
  History,
  LogOut,
  Pickaxe,
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

export default function CatanCardGamePage() {
  const [authState, setAuthState] = useState<AuthoritativeGameState | null>(null);
  const [clientView, setClientView] = useState<ClientGameView | null>(null);
  const [viewerPlayerId, setViewerPlayerId] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);

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
  };

  // Lobi görünümü
  if (!authState || !clientView || authState.status === 'waiting') {
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

  const activePlayer = clientView.players[clientView.activePlayerIndex];
  const myPlayer =
    clientView.players.find((p) => p.playerId === clientView.myPlayerId) ??
    clientView.players[0];
  const opponents = clientView.players.filter(
    (p) => p.playerId !== myPlayer.playerId
  );
  const isMyTurn = activePlayer?.playerId === myPlayer.playerId;
  const winnerPlayer = clientView.winnerPlayerId
    ? clientView.players.find((p) => p.playerId === clientView.winnerPlayerId)
    : null;

  // Üretim & Takas Hesaplamaları
  const productionTotal = calculateProductionCount(myPlayer);
  const harborRatioNeed = getHarborRequiredCount(myPlayer.roadsCount);
  const canProduce =
    isMyTurn && clientView.turnPhase === 'production' && !clientView.pendingEvent;
  const canAct =
    isMyTurn && clientView.turnPhase === 'action' && !clientView.pendingEvent;
  const canUseHarbor =
    canAct && !clientView.hasUsedHarborThisTurn && myPlayer.roadsCount >= 1;
  const canInitiateTrade =
    canAct && !clientView.hasTradedThisTurn && clientView.myHand.length > 0;

  // --- OYUN MOTORU AKSİYONLARI ---
  const handleProduce = () => {
    try {
      const next = executeProductionPhase(authState, myPlayer.playerId);
      commitAuthoritativeUpdate(next);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Üretim hatası.');
    }
  };

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
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Liman takası hatası.');
    }
  };

  const handleBuildMarketCard = (_marketIndex: number, cardType: BuildingCardType) => {
    try {
      const next = executeBuildStructure(authState, myPlayer.playerId, cardType);
      commitAuthoritativeUpdate(next);
      setInspectModal(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'İnşaat hatası.');
    }
  };

  const handleBuildMetropolis = () => {
    try {
      const next = executeBuildStructure(authState, myPlayer.playerId, 'metropolis');
      commitAuthoritativeUpdate(next);
      setInspectModal(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Büyükşehir inşası hatası.');
    }
  };

  const handleEndTurn = () => {
    try {
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
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_center,_#3e0a14_0%,_#2b080e_65%,_#140205_100%)] text-amber-50 p-2 md:p-4 flex flex-col gap-3 max-w-[1680px] mx-auto select-none">
      {/* ÜST GEZİNTİ ÇUBUĞU */}
      <header className="rounded-2xl border border-amber-500/30 bg-[#160205]/95 px-3 py-2 flex flex-wrap items-center justify-between gap-2 shadow-xl backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Crown className="w-5 h-5 text-amber-400" />
            <span className="font-black text-sm md:text-base tracking-wide text-amber-100">
              CATAN KART OYUNU
            </span>
          </div>

          <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-lg bg-amber-500/15 border border-amber-400/40 text-amber-200">
            Oda: {clientView.roomCode}
          </span>

          <span className="text-xs font-bold px-2.5 py-0.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-200">
            Tur #{clientView.turnNumber} • Aktif:{' '}
            <strong className="text-yellow-300">{activePlayer?.nickname}</strong>
          </span>

          {clientView.activeTrade && (
            <button
              type="button"
              onClick={() => setIsTradeModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-sky-400 hover:bg-sky-300 text-stone-950 font-extrabold text-xs animate-pulse cursor-pointer shadow"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>Canlı Takas Masası ({clientView.activeTrade.counterOffers.length} Teklif)</span>
            </button>
          )}
        </div>

        {/* Sağ: RLS Perspektifi Seçici & Animasyon / Kural / Lobi Butonları */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* Oyuncu Perspektifi Değiştirici */}
          <div className="flex items-center gap-1 bg-[#240306] border border-amber-500/30 rounded-xl px-2 py-0.5">
            <Users className="w-3 h-3 text-amber-400 mr-0.5" />
            <span className="text-[11px] text-stone-400 hidden sm:inline mr-1">
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
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition cursor-pointer ${
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

          {/* Desteyi Kar & Dağıt Animasyonu Test Butonu */}
          <button
            type="button"
            onClick={() => {
              setShuffleKey((k) => k + 1);
              setIsDealOverlayActive(true);
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-900/60 hover:bg-amber-800/80 border border-amber-400/40 text-amber-100 text-xs font-bold cursor-pointer"
            title="Açılış kart karma ve dağıtma animasyonunu oynat"
          >
            <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
            <span className="hidden md:inline">Desteyi Dağıt</span>
          </button>

          {/* Zafer Ekranı Butonu (Oyun bittiğinde veya inceleme için) */}
          {(clientView.status === 'finished' || winnerPlayer) && (
            <button
              type="button"
              onClick={() => setIsVictoryModalOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-stone-950 text-xs font-black cursor-pointer shadow"
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>Zafer Ekranı</span>
            </button>
          )}

          {/* Kural Kitapçığı */}
          <button
            type="button"
            onClick={() => setIsRuleModalOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#240306] hover:bg-amber-900/50 border border-amber-400/40 text-amber-100 text-xs font-bold cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5 text-amber-300" />
            <span className="hidden sm:inline">Kurallar</span>
          </button>

          {/* Lobiye Dön */}
          <button
            type="button"
            onClick={handleLeaveToLobby}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-stone-900 hover:bg-rose-950/80 border border-stone-700 hover:border-rose-500/50 text-stone-300 hover:text-rose-200 text-xs font-bold cursor-pointer"
            title="Lobiye Dön"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Lobi</span>
          </button>
        </div>
      </header>

      {/* HATA BİLDİRİMİ */}
      {actionError && (
        <div className="rounded-xl border border-rose-500/70 bg-rose-950/90 px-4 py-2 text-xs md:text-sm text-rose-100 flex items-center justify-between shadow">
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

      {/* 4 OYUNCULU KADRAN DÜZENİ vs 3 OYUNCULU DÜZEN (masa-md) */}
      {clientView.players.length === 4 ? (
        <div className="relative w-full rounded-3xl border-2 border-amber-900/50 bg-[#2b080e] shadow-[0_25px_80px_rgba(0,0,0,0.85)] p-2 sm:p-4 overflow-hidden flex flex-col gap-2">
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
          <div className="relative z-20 my-1">
            <MarketArea
              gameView={clientView}
              isMyTurn={isMyTurn}
              onBuildMarketCard={handleBuildMarketCard}
              onBuildMetropolis={handleBuildMetropolis}
              onOpenRuleSummary={() => setIsRuleModalOpen(true)}
              onInspectCard={handleInspectMarketCard}
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

            {/* Sağ Alt Çeyrek: Aktif Oyuncu (Yapılar + Sağ Alt Yelpaze El) */}
            <div className="relative flex flex-col items-end justify-between w-full h-full p-1.5 sm:p-2.5">
              {/* Aktif Oyuncu Rozeti */}
              <div
                className={`z-30 flex items-center gap-1.5 px-2.5 py-1 rounded-full border backdrop-blur-xs shadow-md text-[11px] sm:text-xs mb-1 ${
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
                {isMyTurn && (
                  <span className="bg-emerald-400 text-stone-950 font-extrabold text-[9px] px-1.5 py-0.2 rounded-full animate-pulse">
                    Sıranda
                  </span>
                )}
              </div>

              {/* Aktif Oyuncunun Yapıları & Sağ Alt Yelpaze Eli */}
              <div className="flex flex-col sm:flex-row items-end sm:items-center justify-end gap-2 w-full">
                {/* Binalar */}
                <div className="flex items-start gap-1.5 sm:gap-2 flex-wrap justify-end">
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
              </div>
            </div>
          </div>

          {/* 4P MASASI HIZLI YÖNETİM ÇUBUĞU (Main Desk Quick Trade & Action Dock) */}
          <div className="relative z-30 flex flex-wrap items-center justify-between gap-2 bg-[#1c0306]/95 border-2 border-amber-500/30 rounded-2xl p-2.5 sm:px-4 shadow-xl mt-1">
            <div className="flex flex-wrap items-center gap-2">
              {/* 1. ÜRETİM YAP */}
              <button
                type="button"
                disabled={!canProduce}
                onClick={handleProduce}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-extrabold text-xs sm:text-sm transition shadow ${
                  canProduce
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-stone-950 cursor-pointer ring-2 ring-emerald-300 animate-bounce'
                    : 'bg-stone-800 text-stone-500 cursor-not-allowed'
                }`}
              >
                <Pickaxe className="w-4 h-4" />
                <span>Üretim Başlat (+{productionTotal})</span>
              </button>

              {/* 2. LİMAN TAKASI */}
              <button
                type="button"
                disabled={!canUseHarbor}
                onClick={() => setIsHarborModalOpen(true)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs sm:text-sm transition shadow ${
                  canUseHarbor
                    ? 'bg-amber-500 hover:bg-amber-400 text-stone-950 cursor-pointer'
                    : 'bg-stone-800 text-stone-500 cursor-not-allowed'
                }`}
              >
                <Anchor className="w-4 h-4" />
                <span>
                  Liman Takası ({harborRatioNeed}:1)
                  {clientView.hasUsedHarborThisTurn ? ' [Kullanıldı]' : ''}
                </span>
              </button>

              {/* 3. OYUNCUYLA TAKAS */}
              <button
                type="button"
                disabled={!canInitiateTrade}
                onClick={() => setIsTradeModalOpen(true)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs sm:text-sm transition shadow ${
                  clientView.activeTrade
                    ? 'bg-sky-400 text-stone-950 animate-pulse ring-2 ring-sky-300 font-extrabold cursor-pointer'
                    : canInitiateTrade
                    ? 'bg-sky-500 hover:bg-sky-400 text-stone-950 cursor-pointer'
                    : 'bg-stone-800 text-stone-500 cursor-not-allowed'
                }`}
              >
                <ArrowLeftRight className="w-4 h-4" />
                <span>
                  Oyuncu Takası
                  {clientView.activeTrade
                    ? ` (${clientView.activeTrade.counterOffers.length} Teklif)`
                    : clientView.hasTradedThisTurn
                    ? ' [Kullanıldı]'
                    : ''}
                </span>
              </button>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              {/* TUR SÜRESİ */}
              {remainingSeconds !== null && (
                <div
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-extrabold border ${
                    remainingSeconds <= 15
                      ? 'bg-rose-600/30 border-rose-400 text-rose-200 animate-pulse'
                      : 'bg-[#2b0408] border-amber-500/40 text-amber-200'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>{remainingSeconds} sn</span>
                </div>
              )}

              {/* 4. TURU BİTİR */}
              <button
                type="button"
                disabled={!canAct}
                onClick={handleEndTurn}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-extrabold text-xs sm:text-sm transition shadow ${
                  canAct
                    ? 'bg-rose-600 hover:bg-rose-500 text-white cursor-pointer ring-1 ring-rose-400'
                    : 'bg-stone-800 text-stone-500 cursor-not-allowed'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Turu Bitir</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* 3 OYUNCULU DÜZEN (catan 3 player game main desk.md) */
        <div className="relative w-full rounded-3xl border-2 border-amber-900/50 bg-[#2b080e] shadow-[0_25px_80px_rgba(0,0,0,0.85)] p-2 sm:p-4 overflow-hidden flex flex-col gap-3">
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
          />

          {/* 3. ALT BÖLGE: Aktif Oyuncunun Alanı (PlayerBoard) */}
          <PlayerBoard
            gameView={clientView}
            myPlayer={myPlayer}
            isMyTurn={isMyTurn}
            onProduce={handleProduce}
            onOpenHarborModal={() => setIsHarborModalOpen(true)}
            onOpenTradeModal={() => setIsTradeModalOpen(true)}
            onEndTurn={handleEndTurn}
            onInspectCard={handleInspectCard}
          />
        </div>
      )}

      {/* AÇILIR KAPANIR OYUN GÜNLÜĞÜ (Game Logs Drawer) */}
      <section
        aria-label="Oyun Günlüğü"
        className="rounded-2xl border border-amber-500/20 bg-[#160205]/95 p-2.5 shadow-md"
      >
        <button
          type="button"
          onClick={() => setIsLogsExpanded(!isLogsExpanded)}
          className="w-full flex items-center justify-between text-xs font-bold text-amber-300 cursor-pointer"
        >
          <div className="flex items-center gap-1.5">
            <History className="w-3.5 h-3.5" />
            <span>Oyun Günlüğü (Son Hamleler & Olaylar — Toplam {clientView.logs.length})</span>
          </div>
          {isLogsExpanded ? (
            <ChevronUp className="w-4 h-4 text-amber-300" />
          ) : (
            <ChevronDown className="w-4 h-4 text-amber-300" />
          )}
        </button>

        {isLogsExpanded && (
          <div className="mt-2 max-h-36 overflow-y-auto space-y-1 text-xs text-stone-300 pr-2 border-t border-white/10 pt-2">
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
