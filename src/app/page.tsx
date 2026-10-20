'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  AuthoritativeGameState,
  BuildingCardType,
  ClientGameView,
  ResourceType,
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
import { MarketArea } from '@/components/board/MarketArea';
import { OpponentArea } from '@/components/board/OpponentArea';
import { PlayerBoard } from '@/components/board/PlayerBoard';
import { RuleSummaryModal } from '@/components/modals/RuleSummaryModal';
import { HarborModal } from '@/components/modals/HarborModal';
import { TradeModal } from '@/components/modals/TradeModal';
import { EventResolutionModal } from '@/components/modals/EventResolutionModal';
import {
  ArrowLeftRight,
  BookOpen,
  Crown,
  History,
  LogOut,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';

export default function CatanCardGamePage() {
  const [authState, setAuthState] = useState<AuthoritativeGameState | null>(null);
  const [clientView, setClientView] = useState<ClientGameView | null>(null);
  const [viewerPlayerId, setViewerPlayerId] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);

  // Modallar
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [isHarborModalOpen, setIsHarborModalOpen] = useState(false);
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);

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
      <main className="min-h-screen bg-[#140f0b] text-amber-50">
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
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'İnşaat hatası.');
    }
  };

  const handleBuildMetropolis = () => {
    try {
      const next = executeBuildStructure(authState, myPlayer.playerId, 'metropolis');
      commitAuthoritativeUpdate(next);
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

  return (
    <main className="min-h-screen bg-[#140f0b] text-amber-50 p-2 md:p-4 flex flex-col gap-3 max-w-[1600px] mx-auto">
      {/* ÜST GEZİNTİ ÇUBUĞU: Oda Kodu, Tur Bilgisi, Çoklu Oyuncu Test Perspektif Seçici, Kural Özeti */}
      <header className="rounded-2xl border border-amber-500/30 bg-stone-950/95 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 shadow-lg">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <Crown className="w-5 h-5 text-amber-400" />
            <span className="font-black text-sm md:text-base tracking-wide text-amber-100">
              CATAN KART OYUNU
            </span>
          </div>

          <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-400/40 text-amber-200">
            Oda: {clientView.roomCode}
          </span>

          <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-stone-900 border border-stone-700 text-stone-200">
            Tur #{clientView.turnNumber} • Aktif:{' '}
            <strong className="text-yellow-300">{activePlayer?.nickname}</strong>
          </span>

          {clientView.activeTrade && (
            <button
              type="button"
              onClick={() => setIsTradeModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-stone-950 font-extrabold text-xs animate-pulse cursor-pointer shadow"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>Canlı Takas Masası Açık ({clientView.activeTrade.counterOffers.length} Teklif)</span>
            </button>
          )}
        </div>

        {/* Sağ: Hızlı Oyuncu Perspektifi Değiştirici (Çoklu Test Modu) & Lobiye Dön */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-stone-900 border border-amber-500/30 rounded-xl px-2 py-1">
            <Users className="w-3.5 h-3.5 text-amber-400 mr-1" />
            <span className="text-[11px] text-stone-400 hidden sm:inline mr-1">
              Görünüm (RLS Test):
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
                      : 'bg-stone-800 hover:bg-stone-700 text-stone-300'
                  }`}
                  title={`${p.nickname} oyuncusunun gözünden bak`}
                >
                  {p.nickname}
                  {isTurn ? ' ★' : ''}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setIsRuleModalOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-900/60 hover:bg-amber-800/80 border border-amber-400/40 text-amber-100 text-xs font-bold cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5 text-amber-300" />
            <span className="hidden sm:inline">Kurallar</span>
          </button>

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
        <div className="rounded-xl border border-rose-500/70 bg-rose-950/90 px-4 py-2.5 text-xs md:text-sm text-rose-100 flex items-center justify-between shadow">
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

      {/* 7 ZAFER PUANI OYUN SONU KUTLAMA BANNER'I */}
      {clientView.status === 'finished' && winnerPlayer && (
        <div className="rounded-2xl border-2 border-yellow-400 bg-gradient-to-r from-amber-900 via-yellow-900 to-amber-950 p-4 md:p-5 shadow-2xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-yellow-400 text-stone-950 flex items-center justify-center shadow-lg">
              <Trophy className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-yellow-300" />
                <span className="text-xs uppercase tracking-wider font-extrabold text-yellow-300">
                  Oyun Tamamlandı — 7 Zafer Puanına Ulaşıldı!
                </span>
              </div>
              <h2 className="text-lg md:text-2xl font-black text-white">
                Kazanan: {winnerPlayer.nickname} ({winnerPlayer.victoryPoints} ZP)
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLeaveToLobby}
            className="px-5 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-stone-950 font-black text-xs md:text-sm shadow-lg cursor-pointer"
          >
            Yeni Oyun İçin Lobiye Dön
          </button>
        </div>
      )}

      {/* 1. RAKİPLERİN ALANI */}
      <OpponentArea
        opponents={opponents}
        activePlayerId={activePlayer?.playerId ?? ''}
      />

      {/* 2. ORTAK KART MARKETİ (5 Açık İnşaat Kartı + Büyükşehir Destesi + Kapalı Desteler) */}
      <MarketArea
        gameView={clientView}
        isMyTurn={isMyTurn}
        onBuildMarketCard={handleBuildMarketCard}
        onBuildMetropolis={handleBuildMetropolis}
        onOpenRuleSummary={() => setIsRuleModalOpen(true)}
      />

      {/* 3. AKTİF / MEVCUT OYUNCUNUN ELİ VE YAPILARI */}
      <PlayerBoard
        gameView={clientView}
        myPlayer={myPlayer}
        isMyTurn={isMyTurn}
        onProduce={handleProduce}
        onOpenHarborModal={() => setIsHarborModalOpen(true)}
        onOpenTradeModal={() => setIsTradeModalOpen(true)}
        onEndTurn={handleEndTurn}
      />

      {/* 4. OYUN KAYITLARI (GAME LOGS) */}
      <section
        aria-label="Oyun Günlüğü"
        className="rounded-2xl border border-amber-500/20 bg-stone-950/90 p-3 shadow-inner"
      >
        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300 mb-2">
          <History className="w-3.5 h-3.5" />
          <span>Oyun Günlüğü (Son Hamleler & Olaylar)</span>
        </div>
        <div className="max-h-28 overflow-y-auto space-y-1 text-xs text-stone-300 pr-2">
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
      </section>

      {/* MODALLAR */}
      <RuleSummaryModal
        isOpen={isRuleModalOpen}
        onClose={() => setIsRuleModalOpen(false)}
      />

      <HarborModal
        isOpen={isHarborModalOpen}
        roadsCount={myPlayer.roadsCount}
        myHand={clientView.myHand}
        onClose={() => setIsHarborModalOpen(false)}
        onConfirmHarborTrade={handleConfirmHarborTrade}
      />

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
      />

      <EventResolutionModal
        gameView={clientView}
        onSubmitRobberDiscard={handleRobberDiscard}
        onSubmitCharityGive={handleCharityGive}
      />
    </main>
  );
}
