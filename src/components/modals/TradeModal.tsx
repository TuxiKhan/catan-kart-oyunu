'use client';

import React, { useMemo, useState } from 'react';
import {
  ClientGameView,
  RESOURCE_LABELS_TR,
  ResourceType,
  TradeCounterOffer,
} from '@/types/game';
import {
  Anchor,
  ArrowLeftRight,
  CheckCircle2,
  Gift,
  Minus,
  Plus,
  RotateCcw,
  Send,
  ShieldAlert,
  Sparkles,
  Users,
  X,
  XCircle,
} from 'lucide-react';

export interface TradeModalProps {
  isOpen: boolean;
  gameView: ClientGameView;
  onClose: () => void;
  onInitiateTrade: (
    wantedResources: ResourceType[],
    offeredResources: ResourceType[]
  ) => { ok: boolean; error?: string };
  onSubmitCounterOffer: (
    offeredResources: ResourceType[],
    requestedResources: ResourceType[]
  ) => { ok: boolean; error?: string };
  onAcceptOffer: (offerId: string) => {
    ok: boolean;
    error?: string;
    bonusCardDrawn?: ResourceType | null;
  };
  onRejectOffer: (offerId: string) => { ok: boolean; error?: string };
  onCancelTrade: () => { ok: boolean; error?: string };
  onSwitchTestPlayer?: (playerId: string) => void;
  onSwitchToHarbor?: () => void;
}

const ALL_RESOURCES: ResourceType[] = ['brick', 'wood', 'wool', 'wheat', 'ore'];

export function getResourceImage(res: ResourceType): string {
  return `/cards/resource/resource_${res}.png`;
}

function countResources(list: ResourceType[]): Record<ResourceType, number> {
  const counts: Record<ResourceType, number> = {
    brick: 0,
    wood: 0,
    wool: 0,
    wheat: 0,
    ore: 0,
  };
  for (const r of list) {
    counts[r] = (counts[r] || 0) + 1;
  }
  return counts;
}

function expandResourceCounts(counts: Record<ResourceType, number>): ResourceType[] {
  const result: ResourceType[] = [];
  for (const res of ALL_RESOURCES) {
    const c = counts[res] || 0;
    for (let i = 0; i < c; i++) {
      result.push(res);
    }
  }
  return result;
}

export const TradeModal: React.FC<TradeModalProps> = ({
  isOpen,
  gameView,
  onClose,
  onInitiateTrade,
  onSubmitCounterOffer,
  onAcceptOffer,
  onRejectOffer,
  onCancelTrade,
  onSwitchTestPlayer,
  onSwitchToHarbor,
}) => {
  const [offeredCounts, setOfferedCounts] = useState<Record<ResourceType, number>>({
    brick: 0,
    wood: 0,
    wool: 0,
    wheat: 0,
    ore: 0,
  });
  const [wantedCounts, setWantedCounts] = useState<Record<ResourceType, number>>({
    brick: 0,
    wood: 0,
    wool: 0,
    wheat: 0,
    ore: 0,
  });
  const [selectedTargetPlayerId, setSelectedTargetPlayerId] = useState<string>('all');
  const [feedback, setFeedback] = useState<{
    type: 'error' | 'success';
    message: string;
  } | null>(null);

  const activePlayer = gameView.players[gameView.activePlayerIndex];
  const isMyTurn = activePlayer?.playerId === gameView.myPlayerId;
  const myHandCounts = useMemo(() => countResources(gameView.myHand), [gameView.myHand]);
  const activeTrade = gameView.activeTrade;
  const opponents = useMemo(
    () => gameView.players.filter((p) => p.playerId !== gameView.myPlayerId),
    [gameView.players, gameView.myPlayerId]
  );

  if (!isOpen) return null;

  const resetSelections = () => {
    setOfferedCounts({ brick: 0, wood: 0, wool: 0, wheat: 0, ore: 0 });
    setWantedCounts({ brick: 0, wood: 0, wool: 0, wheat: 0, ore: 0 });
  };

  const adjustOffered = (res: ResourceType, delta: number) => {
    setOfferedCounts((prev) => {
      const maxAvailable = myHandCounts[res] || 0;
      const nextVal = Math.max(0, Math.min(maxAvailable, (prev[res] || 0) + delta));
      return { ...prev, [res]: nextVal };
    });
  };

  const adjustWanted = (res: ResourceType, delta: number) => {
    setWantedCounts((prev) => {
      const nextVal = Math.max(0, Math.min(10, (prev[res] || 0) + delta));
      return { ...prev, [res]: nextVal };
    });
  };

  const totalOffered = ALL_RESOURCES.reduce((sum, r) => sum + (offeredCounts[r] || 0), 0);
  const totalWanted = ALL_RESOURCES.reduce((sum, r) => sum + (wantedCounts[r] || 0), 0);

  const handleOpenTradeSession = () => {
    const offered = expandResourceCounts(offeredCounts);
    const wanted = expandResourceCounts(wantedCounts);
    const res = onInitiateTrade(wanted, offered);
    if (!res.ok) {
      setFeedback({ type: 'error', message: res.error || 'Ticaret başlatılamadı.' });
    } else {
      setFeedback({
        type: 'success',
        message: 'Canlı ticaret masası açıldı! Rakipler karşı teklif gönderebilir.',
      });
      resetSelections();
    }
  };

  const handleSendCounterOffer = () => {
    const offered = expandResourceCounts(offeredCounts);
    const requested = expandResourceCounts(wantedCounts);
    const res = onSubmitCounterOffer(offered, requested);
    if (!res.ok) {
      setFeedback({ type: 'error', message: res.error || 'Teklif gönderilemedi.' });
    } else {
      setFeedback({
        type: 'success',
        message: `Teklifiniz aktif oyuncu (${activePlayer?.nickname}) ekranına iletildi!`,
      });
      resetSelections();
    }
  };

  const handleAccept = (offer: TradeCounterOffer) => {
    const partner = gameView.players.find((p) => p.playerId === offer.fromPlayerId);
    const res = onAcceptOffer(offer.id);
    if (!res.ok) {
      setFeedback({ type: 'error', message: res.error || 'Teklif kabul edilemedi.' });
    } else {
      setFeedback({
        type: 'success',
        message: `Takas tamamlandı! ${partner?.nickname || 'Diğer oyuncu'} ödül olarak desteden otomatik +1 kapalı Kaynak kartı kazandı.`,
      });
    }
  };

  const handleReject = (offerId: string) => {
    const res = onRejectOffer(offerId);
    if (!res.ok) {
      setFeedback({ type: 'error', message: res.error || 'Teklif reddedilemedi.' });
    }
  };

  const handleCancel = () => {
    const res = onCancelTrade();
    if (!res.ok) {
      setFeedback({ type: 'error', message: res.error || 'Ticaret iptal edilemedi.' });
    } else {
      setFeedback(null);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-[2px] p-3 md:p-5 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trade-modal-title"
    >
      <div className="w-full max-w-2xl bg-[#3b0404]/95 border-2 border-amber-400/50 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.85)] text-amber-50 overflow-hidden my-auto">
        {/* Üst Başlık & Sekme Geçişi */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-[#240203]/90 border-b border-amber-400/30">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-400/40">
              <ArrowLeftRight className="w-4 h-4" />
            </div>
            <div>
              <h2 id="trade-modal-title" className="text-sm md:text-base font-extrabold text-amber-100">
                Masaüstü Ticaret Paneli
              </h2>
              <p className="text-[11px] text-amber-200/75">
                Aktif Oyuncu: <strong className="text-amber-300">{activePlayer?.nickname}</strong> • Serbest Oranlı Takas
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Birleşik Ticaret Sekmeleri */}
            <div className="flex items-center bg-[#160102] p-1 rounded-xl border border-amber-400/30 text-xs">
              <span className="px-2.5 py-1 rounded-lg bg-amber-500 text-stone-950 font-extrabold flex items-center gap-1 shadow">
                <ArrowLeftRight className="w-3.5 h-3.5" />
                Oyuncu Takası (+1 Bonus)
              </span>
              {onSwitchToHarbor && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onSwitchToHarbor();
                  }}
                  className="px-2.5 py-1 rounded-lg text-amber-200/80 hover:text-amber-100 hover:bg-amber-500/15 font-bold flex items-center gap-1 transition cursor-pointer"
                >
                  <Anchor className="w-3.5 h-3.5 text-amber-400" />
                  Deniz/Liman Ticareti
                </button>
              )}
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

        {/* +1 Bonus Kaynak Kartı Ödül Kuralı & Test Perspektif Çubuğu */}
        <div className="px-4 pt-3 space-y-2">
          <div className="px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-950/90 to-teal-950/90 border border-emerald-400/40 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] text-emerald-100">
              <Gift className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                <strong className="text-emerald-300">+1 Rastgele Kart Bonusu:</strong> Aktif oyuncu teklifi kabul ettiğinde, takas ortağına desteden <strong>otomatik +1 kapalı Kaynak</strong> çekilir!
              </span>
            </div>
          </div>

          {onSwitchTestPlayer && (
            <div className="px-3 py-1.5 rounded-xl bg-[#220305]/80 border border-amber-400/25 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="text-amber-200/80 flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-amber-400" />
                Hızlı Oyuncu Görünümü:
              </span>
              <div className="flex flex-wrap gap-1">
                {gameView.players.map((p, idx) => (
                  <button
                    key={p.playerId}
                    type="button"
                    onClick={() => {
                      setFeedback(null);
                      resetSelections();
                      onSwitchTestPlayer(p.playerId);
                    }}
                    className={`px-2 py-0.5 rounded-lg font-bold transition cursor-pointer ${
                      p.playerId === gameView.myPlayerId
                        ? 'bg-amber-400 text-stone-950 shadow'
                        : 'bg-[#3b0404] text-amber-100/80 hover:bg-amber-500/20 border border-amber-400/20'
                    }`}
                  >
                    {p.nickname} {idx === gameView.activePlayerIndex ? '★' : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {feedback && (
            <div
              className={`px-3 py-2 rounded-xl text-xs font-medium border flex items-center justify-between ${
                feedback.type === 'error'
                  ? 'bg-red-950/90 border-red-400/60 text-red-100'
                  : 'bg-emerald-950/90 border-emerald-400/60 text-emerald-100'
              }`}
            >
              <span>{feedback.message}</span>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="text-[11px] underline ml-3 cursor-pointer"
              >
                Kapat
              </button>
            </div>
          )}
        </div>

        {/* Ana İçerik Gövdesi */}
        <div className="p-4 space-y-3.5">
          {/* Hedef Rakip Seçici & Eldeki Kart Sayıları */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#240203]/75 border border-amber-400/25 rounded-xl px-3 py-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300/90">
              {isMyTurn ? 'Hedef Rakip / Masa:' : 'Teklif Gönderilecek Aktif Oyuncu:'}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {isMyTurn ? (
                <>
                  <button
                    type="button"
                    onClick={() => setSelectedTargetPlayerId('all')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition cursor-pointer ${
                      selectedTargetPlayerId === 'all'
                        ? 'bg-amber-400 text-stone-950 border-amber-300 shadow'
                        : 'bg-[#3b0404] text-amber-100 border-amber-400/30 hover:border-amber-400'
                    }`}
                  >
                    Tüm Masa ({opponents.length} Rakip)
                  </button>
                  {opponents.map((opp) => (
                    <button
                      key={opp.playerId}
                      type="button"
                      onClick={() => setSelectedTargetPlayerId(opp.playerId)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition cursor-pointer ${
                        selectedTargetPlayerId === opp.playerId
                          ? 'bg-amber-400 text-stone-950 border-amber-300 shadow'
                          : 'bg-[#3b0404] text-amber-100 border-amber-400/30 hover:border-amber-400'
                      }`}
                    >
                      {opp.nickname} ({opp.handCount} Kart)
                    </button>
                  ))}
                </>
              ) : (
                <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-amber-400/20 border border-amber-400/50 text-amber-200">
                  {activePlayer?.nickname} ({activePlayer?.handCount ?? 0} Kart)
                </span>
              )}
            </div>
          </div>

          {/* DURUM 1: GÖRÜNTÜLEYEN OYUNCU AKTİF OYUNCU İSE */}
          {isMyTurn ? (
            <div className="space-y-3.5">
              {gameView.hasTradedThisTurn ? (
                <div className="p-4 rounded-xl bg-[#240203]/90 border border-amber-400/30 text-center text-xs text-amber-200">
                  Bu turdaki oyuncu takası hakkınızı (1/1) kullandınız.
                </div>
              ) : !activeTrade ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* 1. Vereceğim Kaynaklar (1-Tık Görsel Kart Seçici) */}
                    <div className="p-3 rounded-xl bg-[#240203]/85 border border-amber-400/30 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-amber-300">
                          1. Vereceğim Kaynak ({totalOffered} Seçildi)
                        </span>
                        {totalOffered > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setOfferedCounts({ brick: 0, wood: 0, wool: 0, wheat: 0, ore: 0 })
                            }
                            className="text-[10px] text-amber-300/80 hover:text-amber-200 flex items-center gap-0.5 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" /> Sıfırla
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-5 gap-1.5">
                        {ALL_RESOURCES.map((res) => {
                          const inHand = myHandCounts[res] || 0;
                          const offered = offeredCounts[res] || 0;
                          const canAdd = offered < inHand;

                          return (
                            <div
                              key={res}
                              className={`flex flex-col items-center rounded-xl p-1 border transition ${
                                offered > 0
                                  ? 'bg-amber-500/25 border-amber-400 shadow'
                                  : 'bg-[#1a0203]/80 border-white/10'
                              } ${inHand === 0 ? 'opacity-45' : ''}`}
                            >
                              <button
                                type="button"
                                disabled={!canAdd}
                                onClick={() => adjustOffered(res, 1)}
                                className="relative w-full aspect-[3/4] rounded-lg overflow-hidden border border-amber-300/40 cursor-pointer disabled:cursor-not-allowed group"
                                title={`${RESOURCE_LABELS_TR[res]} ekle (Eldeki: ${inHand})`}
                              >
                                <img
                                  src={getResourceImage(res)}
                                  alt={RESOURCE_LABELS_TR[res]}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                />
                                <span className="absolute top-0.5 right-0.5 bg-black/80 text-amber-200 text-[9px] font-bold px-1 rounded">
                                  /{inHand}
                                </span>
                                {offered > 0 && (
                                  <span className="absolute inset-0 bg-amber-500/35 flex items-center justify-center font-black text-sm text-white drop-shadow">
                                    +{offered}
                                  </span>
                                )}
                              </button>

                              <span className="text-[10px] font-bold text-amber-100 mt-1 truncate">
                                {RESOURCE_LABELS_TR[res]}
                              </span>

                              <div className="flex items-center gap-1 mt-0.5">
                                <button
                                  type="button"
                                  onClick={() => adjustOffered(res, -1)}
                                  disabled={offered <= 0}
                                  className="p-0.5 rounded bg-black/50 hover:bg-black/80 text-amber-200 disabled:opacity-30 cursor-pointer"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="text-[11px] font-extrabold w-3.5 text-center text-amber-300">
                                  {offered}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => adjustOffered(res, 1)}
                                  disabled={!canAdd}
                                  className="p-0.5 rounded bg-black/50 hover:bg-black/80 text-amber-200 disabled:opacity-30 cursor-pointer"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* 2. İstediğim Kaynaklar (1-Tık Görsel Kart Seçici) */}
                    <div className="p-3 rounded-xl bg-[#240203]/85 border border-emerald-400/30 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-emerald-300">
                          2. İstediğim Kaynak ({totalWanted} Seçildi)
                        </span>
                        {totalWanted > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setWantedCounts({ brick: 0, wood: 0, wool: 0, wheat: 0, ore: 0 })
                            }
                            className="text-[10px] text-emerald-300/80 hover:text-emerald-200 flex items-center gap-0.5 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" /> Sıfırla
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-5 gap-1.5">
                        {ALL_RESOURCES.map((res) => {
                          const wanted = wantedCounts[res] || 0;

                          return (
                            <div
                              key={res}
                              className={`flex flex-col items-center rounded-xl p-1 border transition ${
                                wanted > 0
                                  ? 'bg-emerald-500/25 border-emerald-400 shadow'
                                  : 'bg-[#1a0203]/80 border-white/10'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => adjustWanted(res, 1)}
                                className="relative w-full aspect-[3/4] rounded-lg overflow-hidden border border-emerald-300/40 cursor-pointer group"
                                title={`${RESOURCE_LABELS_TR[res]} iste`}
                              >
                                <img
                                  src={getResourceImage(res)}
                                  alt={RESOURCE_LABELS_TR[res]}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                />
                                {wanted > 0 && (
                                  <span className="absolute inset-0 bg-emerald-600/45 flex items-center justify-center font-black text-sm text-white drop-shadow">
                                    +{wanted}
                                  </span>
                                )}
                              </button>

                              <span className="text-[10px] font-bold text-amber-100 mt-1 truncate">
                                {RESOURCE_LABELS_TR[res]}
                              </span>

                              <div className="flex items-center gap-1 mt-0.5">
                                <button
                                  type="button"
                                  onClick={() => adjustWanted(res, -1)}
                                  disabled={wanted <= 0}
                                  className="p-0.5 rounded bg-black/50 hover:bg-black/80 text-emerald-200 disabled:opacity-30 cursor-pointer"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="text-[11px] font-extrabold w-3.5 text-center text-emerald-300">
                                  {wanted}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => adjustWanted(res, 1)}
                                  className="p-0.5 rounded bg-black/50 hover:bg-black/80 text-emerald-200 cursor-pointer"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleOpenTradeSession}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:to-yellow-300 text-stone-950 font-black text-xs md:text-sm shadow-lg transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    Ticaret Masasını Aç (Teklifleri Bekle)
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-[#240203]/80 px-3 py-2 rounded-xl border border-amber-400/30">
                    <h3 className="text-xs md:text-sm font-extrabold text-amber-200">
                      Gelen Karşı Teklifler ({activeTrade.counterOffers.length})
                    </h3>
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="text-xs px-3 py-1 rounded-lg bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-400/40 font-bold transition cursor-pointer"
                    >
                      Ticareti İptal Et
                    </button>
                  </div>

                  {activeTrade.counterOffers.length === 0 ? (
                    <div className="p-5 rounded-xl bg-[#240203]/60 border border-dashed border-amber-400/30 text-center text-xs text-amber-200/70">
                      Diğer oyuncuların teklif göndermesi bekleniyor... (Test için üstten oyuncu görünümünü değiştirebilirsiniz)
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {activeTrade.counterOffers.map((offer) => {
                        const sender = gameView.players.find(
                          (p) => p.playerId === offer.fromPlayerId
                        );
                        return (
                          <div
                            key={offer.id}
                            className="p-3 rounded-xl bg-[#240203]/90 border border-amber-400/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="space-y-1">
                              <div className="font-extrabold text-xs text-amber-200">
                                {sender?.nickname || 'Oyuncu'} Teklifi:
                              </div>
                              <div className="text-xs text-emerald-300">
                                Size Vereceği:{' '}
                                <strong>
                                  {offer.offeredResources
                                    .map((r) => RESOURCE_LABELS_TR[r])
                                    .join(', ')}
                                </strong>{' '}
                                ({offer.offeredResources.length} Kart)
                              </div>
                              <div className="text-xs text-amber-300">
                                Sizden İstediği:{' '}
                                <strong>
                                  {offer.requestedResources
                                    .map((r) => RESOURCE_LABELS_TR[r])
                                    .join(', ')}
                                </strong>{' '}
                                ({offer.requestedResources.length} Kart)
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleAccept(offer)}
                                className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-extrabold text-xs transition cursor-pointer shadow"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                Kabul Et
                              </button>
                              <button
                                type="button"
                                onClick={() => handleReject(offer.id)}
                                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-stone-800 hover:bg-red-950 text-stone-200 hover:text-red-200 text-xs font-bold transition cursor-pointer"
                              >
                                <XCircle className="w-4 h-4" />
                                Reddet
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* DURUM 2: GÖRÜNTÜLEYEN OYUNCU AKTİF OLMAYAN OYUNCU İSE */
            <div className="space-y-3">
              <div className="p-2.5 rounded-xl bg-amber-950/60 border border-amber-400/30 flex items-center gap-2 text-xs text-amber-100">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Sıra <strong>{activePlayer?.nickname}</strong> oyuncusunda. Yalnızca aktif oyuncuya karşı teklif sunabilirsiniz.
                </span>
              </div>

              {!activeTrade ? (
                <div className="p-5 rounded-xl bg-[#240203]/60 border border-amber-400/20 text-center text-xs text-amber-200/70">
                  Aktif oyuncu ({activePlayer?.nickname}) henüz ticaret oturumu başlatmadı.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Aktif Oyuncuya Vereceğim Kaynaklar */}
                    <div className="p-3 rounded-xl bg-[#240203]/85 border border-amber-400/30 space-y-2">
                      <div className="text-xs font-extrabold text-amber-300">
                        Vereceğim Kaynak ({totalOffered} Seçildi)
                      </div>
                      <div className="grid grid-cols-5 gap-1.5">
                        {ALL_RESOURCES.map((res) => {
                          const inHand = myHandCounts[res] || 0;
                          const offered = offeredCounts[res] || 0;
                          const canAdd = offered < inHand;

                          return (
                            <div
                              key={res}
                              className={`flex flex-col items-center rounded-xl p-1 border transition ${
                                offered > 0
                                  ? 'bg-amber-500/25 border-amber-400 shadow'
                                  : 'bg-[#1a0203]/80 border-white/10'
                              } ${inHand === 0 ? 'opacity-45' : ''}`}
                            >
                              <button
                                type="button"
                                disabled={!canAdd}
                                onClick={() => adjustOffered(res, 1)}
                                className="relative w-full aspect-[3/4] rounded-lg overflow-hidden border border-amber-300/40 cursor-pointer disabled:cursor-not-allowed"
                              >
                                <img
                                  src={getResourceImage(res)}
                                  alt={RESOURCE_LABELS_TR[res]}
                                  className="w-full h-full object-cover"
                                />
                                <span className="absolute top-0.5 right-0.5 bg-black/80 text-amber-200 text-[9px] font-bold px-1 rounded">
                                  /{inHand}
                                </span>
                                {offered > 0 && (
                                  <span className="absolute inset-0 bg-amber-500/35 flex items-center justify-center font-black text-sm text-white drop-shadow">
                                    +{offered}
                                  </span>
                                )}
                              </button>
                              <span className="text-[10px] font-bold text-amber-100 mt-1 truncate">
                                {RESOURCE_LABELS_TR[res]}
                              </span>
                              <div className="flex items-center gap-1 mt-0.5">
                                <button
                                  type="button"
                                  onClick={() => adjustOffered(res, -1)}
                                  disabled={offered <= 0}
                                  className="p-0.5 rounded bg-black/50 text-amber-200 disabled:opacity-30 cursor-pointer"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="text-[11px] font-extrabold w-3.5 text-center text-amber-300">
                                  {offered}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => adjustOffered(res, 1)}
                                  disabled={!canAdd}
                                  className="p-0.5 rounded bg-black/50 text-amber-200 disabled:opacity-30 cursor-pointer"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Aktif Oyuncudan İstediğim Kaynaklar */}
                    <div className="p-3 rounded-xl bg-[#240203]/85 border border-emerald-400/30 space-y-2">
                      <div className="text-xs font-extrabold text-emerald-300">
                        İstediğim Kaynak ({totalWanted} Seçildi)
                      </div>
                      <div className="grid grid-cols-5 gap-1.5">
                        {ALL_RESOURCES.map((res) => {
                          const wanted = wantedCounts[res] || 0;

                          return (
                            <div
                              key={res}
                              className={`flex flex-col items-center rounded-xl p-1 border transition ${
                                wanted > 0
                                  ? 'bg-emerald-500/25 border-emerald-400 shadow'
                                  : 'bg-[#1a0203]/80 border-white/10'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => adjustWanted(res, 1)}
                                className="relative w-full aspect-[3/4] rounded-lg overflow-hidden border border-emerald-300/40 cursor-pointer"
                              >
                                <img
                                  src={getResourceImage(res)}
                                  alt={RESOURCE_LABELS_TR[res]}
                                  className="w-full h-full object-cover"
                                />
                                {wanted > 0 && (
                                  <span className="absolute inset-0 bg-emerald-600/45 flex items-center justify-center font-black text-sm text-white drop-shadow">
                                    +{wanted}
                                  </span>
                                )}
                              </button>
                              <span className="text-[10px] font-bold text-amber-100 mt-1 truncate">
                                {RESOURCE_LABELS_TR[res]}
                              </span>
                              <div className="flex items-center gap-1 mt-0.5">
                                <button
                                  type="button"
                                  onClick={() => adjustWanted(res, -1)}
                                  disabled={wanted <= 0}
                                  className="p-0.5 rounded bg-black/50 text-emerald-200 disabled:opacity-30 cursor-pointer"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="text-[11px] font-extrabold w-3.5 text-center text-emerald-300">
                                  {wanted}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => adjustWanted(res, 1)}
                                  className="p-0.5 rounded bg-black/50 text-emerald-200 cursor-pointer"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSendCounterOffer}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-stone-950 font-black text-xs md:text-sm shadow-lg transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    Aktif Oyuncuya Teklif Gönder (+1 Kapalı Kaynak Ödülü!)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TradeModal;
