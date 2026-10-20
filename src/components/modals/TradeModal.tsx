'use client';

import React, { useMemo, useState } from 'react';
import {
  ClientGameView,
  RESOURCE_LABELS_TR,
  ResourceType,
  TradeCounterOffer,
} from '@/types/game';
import {
  ArrowLeftRight,
  CheckCircle2,
  Gift,
  Minus,
  Plus,
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
  /**
   * Masaüstü Çoklu Test Modu için opsiyonel hızlı oyuncu perspektifi değiştirici
   */
  onSwitchTestPlayer?: (playerId: string) => void;
}

const ALL_RESOURCES: ResourceType[] = ['brick', 'wood', 'wool', 'wheat', 'ore'];

const RESOURCE_COLORS: Record<ResourceType, string> = {
  brick: 'bg-red-900/50 border-red-500/50 text-red-100',
  wood: 'bg-emerald-900/50 border-emerald-500/50 text-emerald-100',
  wool: 'bg-lime-900/50 border-lime-500/50 text-lime-100',
  wheat: 'bg-amber-800/50 border-amber-400/50 text-amber-100',
  ore: 'bg-slate-800/70 border-slate-400/50 text-slate-100',
};

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
  const [feedback, setFeedback] = useState<{
    type: 'error' | 'success';
    message: string;
  } | null>(null);

  const activePlayer = gameView.players[gameView.activePlayerIndex];
  const isMyTurn = activePlayer?.playerId === gameView.myPlayerId;
  const myHandCounts = useMemo(() => countResources(gameView.myHand), [gameView.myHand]);
  const activeTrade = gameView.activeTrade;

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

  const handleOpenTradeSession = () => {
    const offered = expandResourceCounts(offeredCounts);
    const wanted = expandResourceCounts(wantedCounts);
    const res = onInitiateTrade(wanted, offered);
    if (!res.ok) {
      setFeedback({ type: 'error', message: res.error || 'Ticaret başlatılamadı.' });
    } else {
      setFeedback({
        type: 'success',
        message: 'Canlı ticaret oturumu açıldı! Diğer oyuncular teklif gönderebilir.',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-3xl bg-stone-900 border border-amber-500/40 rounded-2xl shadow-2xl text-amber-50 overflow-hidden">
        {/* Üst Başlık */}
        <div className="flex items-center justify-between px-6 py-4 bg-stone-950/80 border-b border-amber-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-amber-100">
                Canlı Oyuncu Ticareti (Serbest Oranlı Takas)
              </h2>
              <p className="text-xs text-stone-400">
                Aktif Oyuncu:{' '}
                <strong className="text-amber-300">{activePlayer?.nickname}</strong> •
                Sadece aktif oyuncuyla takas yapılabilir (1:1 oran zorunluluğu yoktur).
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-stone-400 hover:text-amber-200 hover:bg-stone-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* +1 Bonus Kaynak Kartı Ödül Kuralı Bilgisi */}
        <div className="mx-6 mt-4 p-3.5 rounded-xl bg-gradient-to-r from-emerald-950/90 to-teal-950/90 border border-emerald-500/40 flex items-center gap-3">
          <Gift className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="text-xs text-emerald-100 leading-relaxed">
            <strong className="text-emerald-300">Ticaret Ödülü Kuralı:</strong> Aktif oyuncu
            bir karşı teklifi kabul ettiğinde, takas yapılan diğer oyuncuya ödül olarak
            desteden <strong>otomatik +1 kapalı Kaynak kartı</strong> çekilir!
          </div>
        </div>

        {/* Opsiyonel: Masaüstü Çoklu Test Modu Hızlı Perspektif Değiştirici */}
        {onSwitchTestPlayer && (
          <div className="mx-6 mt-3 px-3.5 py-2.5 rounded-xl bg-stone-950/70 border border-stone-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-stone-400 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-amber-400" />
              Hızlı Oyuncu Görünümü (Test Modu):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {gameView.players.map((p, idx) => (
                <button
                  key={p.playerId}
                  type="button"
                  onClick={() => {
                    setFeedback(null);
                    resetSelections();
                    onSwitchTestPlayer(p.playerId);
                  }}
                  className={`px-2.5 py-1 rounded-lg font-medium transition ${
                    p.playerId === gameView.myPlayerId
                      ? 'bg-amber-500 text-stone-950 font-bold'
                      : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                  }`}
                >
                  {p.nickname} {idx === gameView.activePlayerIndex ? '(Aktif)' : ''}
                </button>
              ))}
            </div>
          </div>
        )}

        {feedback && (
          <div
            className={`mx-6 mt-4 p-3 rounded-xl text-xs font-medium border flex items-center justify-between ${
              feedback.type === 'error'
                ? 'bg-red-950/80 border-red-500/50 text-red-200'
                : 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200'
            }`}
          >
            <span>{feedback.message}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-xs underline ml-3"
            >
              Kapat
            </button>
          </div>
        )}

        {/* İçerik Gövdesi */}
        <div className="p-6 space-y-6">
          {/* Elimdeki Mevcut Kaynaklar */}
          <div className="bg-stone-950/60 border border-stone-800 rounded-xl p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-2.5">
              Elinizdeki Kaynak Kartları ({gameView.myHand.length} Kart)
            </div>
            <div className="grid grid-cols-5 gap-2">
              {ALL_RESOURCES.map((res) => (
                <div
                  key={res}
                  className={`px-3 py-2 rounded-lg border text-center ${RESOURCE_COLORS[res]}`}
                >
                  <div className="text-xs font-medium">{RESOURCE_LABELS_TR[res]}</div>
                  <div className="text-lg font-extrabold">{myHandCounts[res] || 0}</div>
                </div>
              ))}
            </div>
          </div>

          {/* DURUM 1: GÖRÜNTÜLEYEN OYUNCU AKTİF OYUNCU İSE */}
          {isMyTurn ? (
            <div className="space-y-5">
              {gameView.hasTradedThisTurn ? (
                <div className="p-4 rounded-xl bg-stone-800/70 border border-stone-700 text-center text-sm text-stone-300">
                  Bu turdaki oyuncu takası hakkınızı (1/1) kullandınız.
                </div>
              ) : !activeTrade ? (
                <div className="space-y-4 bg-stone-950/40 border border-amber-500/20 rounded-xl p-5">
                  <div className="text-sm font-semibold text-amber-200">
                    1. Ticaret Çağrısı Başlatın (Opsiyonel olarak ne verip ne aradığınızı belirtebilirsiniz)
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Teklif Ettiğim Kaynaklar */}
                    <div className="p-3.5 rounded-xl bg-stone-900 border border-stone-800 space-y-2">
                      <div className="text-xs font-bold text-amber-300">
                        Vermek İstediğim Kaynaklar (Elimden)
                      </div>
                      {ALL_RESOURCES.map((res) => (
                        <div
                          key={res}
                          className="flex items-center justify-between text-xs py-1"
                        >
                          <span>
                            {RESOURCE_LABELS_TR[res]} (Max: {myHandCounts[res] || 0})
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => adjustOffered(res, -1)}
                              className="p-1 rounded bg-stone-800 hover:bg-stone-700"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-5 text-center font-bold">
                              {offeredCounts[res] || 0}
                            </span>
                            <button
                              type="button"
                              onClick={() => adjustOffered(res, 1)}
                              className="p-1 rounded bg-stone-800 hover:bg-stone-700"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Aradığım Kaynaklar */}
                    <div className="p-3.5 rounded-xl bg-stone-900 border border-stone-800 space-y-2">
                      <div className="text-xs font-bold text-emerald-300">
                        Aradığım Kaynaklar (Diğer Oyunculardan)
                      </div>
                      {ALL_RESOURCES.map((res) => (
                        <div
                          key={res}
                          className="flex items-center justify-between text-xs py-1"
                        >
                          <span>{RESOURCE_LABELS_TR[res]}</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => adjustWanted(res, -1)}
                              className="p-1 rounded bg-stone-800 hover:bg-stone-700"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-5 text-center font-bold">
                              {wantedCounts[res] || 0}
                            </span>
                            <button
                              type="button"
                              onClick={() => adjustWanted(res, 1)}
                              className="p-1 rounded bg-stone-800 hover:bg-stone-700"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleOpenTradeSession}
                    className="w-full py-3 px-5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-stone-950 font-bold text-sm transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    Ticaret Masasını Aç (Teklifleri Bekle)
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-amber-200">
                      Diğer Oyunculardan Gelen Karşı Teklifler (
                      {activeTrade.counterOffers.length})
                    </h3>
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="text-xs px-3 py-1.5 rounded-lg bg-red-950/70 hover:bg-red-900/80 text-red-200 border border-red-500/40 transition"
                    >
                      Ticareti İptal Et
                    </button>
                  </div>

                  {activeTrade.counterOffers.length === 0 ? (
                    <div className="p-6 rounded-xl bg-stone-950/60 border border-dashed border-stone-700 text-center text-xs text-stone-400">
                      Diğer oyuncuların size teklif göndermesi bekleniyor...
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {activeTrade.counterOffers.map((offer) => {
                        const sender = gameView.players.find(
                          (p) => p.playerId === offer.fromPlayerId
                        );
                        return (
                          <div
                            key={offer.id}
                            className="p-4 rounded-xl bg-stone-950/80 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                          >
                            <div className="space-y-1">
                              <div className="font-bold text-sm text-amber-200">
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
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-bold text-xs transition cursor-pointer"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                Kabul Et
                              </button>
                              <button
                                type="button"
                                onClick={() => handleReject(offer.id)}
                                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-stone-800 hover:bg-red-950 text-stone-300 hover:text-red-200 text-xs transition cursor-pointer"
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
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 flex items-center gap-2.5 text-xs text-amber-200">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Sıra şu anda <strong>{activePlayer?.nickname}</strong> oyuncusunda.
                  Diğer oyuncular kendi aralarında ticaret yapamaz; yalnızca aktif oyuncuya
                  karşı teklif sunabilirsiniz.
                </span>
              </div>

              {!activeTrade ? (
                <div className="p-6 rounded-xl bg-stone-950/60 border border-stone-800 text-center text-xs text-stone-400">
                  Aktif oyuncu ({activePlayer?.nickname}) henüz ticaret oturumu başlatmadı.
                </div>
              ) : (
                <div className="space-y-4 bg-stone-950/50 border border-amber-500/20 rounded-xl p-4">
                  <div className="text-sm font-bold text-amber-100">
                    Aktif Oyuncuya ({activePlayer?.nickname}) Serbest Oranlı Teklif Gönder
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Aktif Oyuncuya Vereceğim Kaynaklar */}
                    <div className="p-3.5 rounded-xl bg-stone-900 border border-stone-800 space-y-2">
                      <div className="text-xs font-bold text-amber-300">
                        Vereceğim Kaynaklar (Elimden)
                      </div>
                      {ALL_RESOURCES.map((res) => (
                        <div
                          key={res}
                          className="flex items-center justify-between text-xs py-1"
                        >
                          <span>
                            {RESOURCE_LABELS_TR[res]} (Elimde: {myHandCounts[res] || 0})
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => adjustOffered(res, -1)}
                              className="p-1 rounded bg-stone-800 hover:bg-stone-700"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-5 text-center font-bold">
                              {offeredCounts[res] || 0}
                            </span>
                            <button
                              type="button"
                              onClick={() => adjustOffered(res, 1)}
                              className="p-1 rounded bg-stone-800 hover:bg-stone-700"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Aktif Oyuncudan İstediğim Kaynaklar */}
                    <div className="p-3.5 rounded-xl bg-stone-900 border border-stone-800 space-y-2">
                      <div className="text-xs font-bold text-emerald-300">
                        Aktif Oyuncudan İstediğim Kaynaklar
                      </div>
                      {ALL_RESOURCES.map((res) => (
                        <div
                          key={res}
                          className="flex items-center justify-between text-xs py-1"
                        >
                          <span>{RESOURCE_LABELS_TR[res]}</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => adjustWanted(res, -1)}
                              className="p-1 rounded bg-stone-800 hover:bg-stone-700"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-5 text-center font-bold">
                              {wantedCounts[res] || 0}
                            </span>
                            <button
                              type="button"
                              onClick={() => adjustWanted(res, 1)}
                              className="p-1 rounded bg-stone-800 hover:bg-stone-700"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSendCounterOffer}
                    className="w-full py-3 px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-stone-950 font-bold text-sm transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    Aktif Oyuncuya Teklif Gönder (Kabul Edilirse +1 Kapalı Kaynak Ödülü!)
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
