'use client';

import React, { useState } from 'react';
import {
  ClientGameView,
  ResourceType,
  RESOURCE_LABELS_TR,
} from '../../types/game';
import { CardVisual } from '../cards/CardVisual';
import { ShieldAlert, HeartHandshake, CheckCircle2, Clock } from 'lucide-react';

export interface EventResolutionModalProps {
  gameView: ClientGameView;
  onSubmitRobberDiscard: (discardedResources: ResourceType[]) => void;
  onSubmitCharityGive: (targetPlayerId: string, resource: ResourceType) => void;
}

export const EventResolutionModal: React.FC<EventResolutionModalProps> = ({
  gameView,
  onSubmitRobberDiscard,
  onSubmitCharityGive,
}) => {
  const pendingEvent = gameView.pendingEvent;
  const [selectedHandIndices, setSelectedHandIndices] = useState<number[]>([]);
  const [selectedCharityIndex, setSelectedCharityIndex] = useState<number | null>(null);
  const [selectedTargetPlayerId, setSelectedTargetPlayerId] = useState<string>('');

  if (!pendingEvent) return null;

  const isRobber = pendingEvent.eventType === 'robber';
  const isCharity = pendingEvent.eventType === 'charity';

  if (!isRobber && !isCharity) return null;

  const myRobberTask = pendingEvent.pendingRobberDiscards?.find(
    (d) => d.playerId === gameView.myPlayerId && !d.completed
  );

  const myCharityTask = pendingEvent.pendingCharityGives?.find(
    (c) => c.fromPlayerId === gameView.myPlayerId && !c.completed
  );

  const toggleRobberCardIndex = (idx: number, requiredCount: number) => {
    setSelectedHandIndices((prev) => {
      if (prev.includes(idx)) {
        return prev.filter((i) => i !== idx);
      }
      if (prev.length >= requiredCount) {
        return prev;
      }
      return [...prev, idx];
    });
  };

  const handleConfirmRobber = () => {
    if (!myRobberTask) return;
    if (selectedHandIndices.length !== myRobberTask.requiredDiscardCount) return;
    const chosen = selectedHandIndices
      .map((idx) => gameView.myHand[idx])
      .filter((r): r is ResourceType => Boolean(r));
    onSubmitRobberDiscard(chosen);
    setSelectedHandIndices([]);
  };

  const activeTargetId =
    selectedTargetPlayerId ||
    (myCharityTask?.eligibleTargetPlayerIds[0] ?? '');

  const handleConfirmCharity = () => {
    if (!myCharityTask) return;
    if (selectedCharityIndex === null || !activeTargetId) return;
    const res = gameView.myHand[selectedCharityIndex];
    if (!res) return;
    onSubmitCharityGive(activeTargetId, res);
    setSelectedCharityIndex(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-3 md:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-resolution-title"
    >
      <div className="relative w-full max-w-2xl rounded-2xl border-2 border-red-500/80 bg-gradient-to-b from-stone-900 via-stone-950 to-black text-amber-50 shadow-2xl overflow-hidden my-auto">
        {/* Üst Başlık */}
        <div className="flex items-center justify-between px-4 py-3 bg-red-950/80 border-b border-red-500/40">
          <div className="flex items-center gap-2">
            {isRobber ? (
              <ShieldAlert className="w-5 h-5 text-red-400" />
            ) : (
              <HeartHandshake className="w-5 h-5 text-teal-400" />
            )}
            <h2 id="event-resolution-title" className="text-base md:text-lg font-extrabold text-white">
              {isRobber
                ? 'Olay Kartı: HIRSIZ! (>(7 + Şövalye) Kartı Olanlar Yarısını Atar)'
                : 'Olay Kartı: SADAKA! (En Çok ZP\'li Oyuncu(lar) 1 Kaynak Verir)'}
            </h2>
          </div>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-red-500/20 border border-red-400/50 text-red-200 font-bold">
            Olay Çözümlemesi
          </span>
        </div>

        <div className="p-4 md:p-5 space-y-4">
          {/* Olay Özeti */}
          <div className="rounded-xl bg-stone-900/90 border border-white/10 p-3 text-xs md:text-sm text-stone-200">
            {pendingEvent.summaryLogTr}
          </div>

          {/* SENARYO 1: HIRSIZ OLAYI */}
          {isRobber && (
            <>
              {myRobberTask ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs md:text-sm font-bold text-amber-200">
                      Elinden Iskartaya Atacağın {myRobberTask.requiredDiscardCount} Kaynağı Seç ({selectedHandIndices.length} / {myRobberTask.requiredDiscardCount}):
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 py-2">
                    {gameView.myHand.map((res, idx) => {
                      const isSelected = selectedHandIndices.includes(idx);
                      return (
                        <div key={`${res}-${idx}`} className="flex flex-col items-center">
                          <CardVisual
                            card={{ category: 'resource', type: res }}
                            size="xs"
                            selected={isSelected}
                            statusBadge={isSelected ? 'Atılacak' : undefined}
                            onClick={() =>
                              toggleRobberCardIndex(idx, myRobberTask.requiredDiscardCount)
                            }
                          />
                          <span className="mt-1 text-[10px] font-bold text-stone-300">
                            {RESOURCE_LABELS_TR[res]}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      disabled={selectedHandIndices.length !== myRobberTask.requiredDiscardCount}
                      onClick={handleConfirmRobber}
                      className={`px-5 py-2 rounded-xl font-extrabold text-xs md:text-sm transition ${
                        selectedHandIndices.length === myRobberTask.requiredDiscardCount
                          ? 'bg-red-500 hover:bg-red-400 text-white cursor-pointer shadow'
                          : 'bg-stone-800 text-stone-500 cursor-not-allowed'
                      }`}
                    >
                      Seçilen {myRobberTask.requiredDiscardCount} Kartı Iskartaya At
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-stone-900 border border-amber-500/30 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-amber-300 font-bold text-xs md:text-sm">
                    <Clock className="w-4 h-4 animate-spin" />
                    <span>Diğer oyuncuların Hırsız için kart seçmesi bekleniyor...</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {pendingEvent.pendingRobberDiscards?.map((d) => {
                      const p = gameView.players.find((pl) => pl.playerId === d.playerId);
                      return (
                        <span
                          key={d.playerId}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                            d.completed
                              ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                              : 'bg-amber-500/15 border-amber-400 text-amber-200'
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {p?.nickname || 'Oyuncu'}: {d.requiredDiscardCount} Kart{' '}
                          {d.completed ? '(Tamamlandı)' : '(Seçiyor...)'}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* SENARYO 2: SADAKA OLAYI */}
          {isCharity && (
            <>
              {myCharityTask ? (
                <div className="space-y-4">
                  {/* 1. Hedef Oyuncu Seç */}
                  <div>
                    <h3 className="text-xs md:text-sm font-bold text-teal-300 mb-2">
                      1. Kendinden Daha Düşük Zafer Puanlı Hedef Oyuncuyu Seç:
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {myCharityTask.eligibleTargetPlayerIds.map((targetId) => {
                        const targetPlayer = gameView.players.find(
                          (p) => p.playerId === targetId
                        );
                        const isSelected = activeTargetId === targetId;

                        return (
                          <button
                            key={targetId}
                            type="button"
                            onClick={() => setSelectedTargetPlayerId(targetId)}
                            className={`px-3.5 py-2 rounded-xl border font-bold text-xs md:text-sm cursor-pointer transition ${
                              isSelected
                                ? 'bg-teal-500 text-stone-950 border-teal-300 shadow'
                                : 'bg-stone-900 text-stone-200 border-stone-700 hover:border-teal-400'
                            }`}
                          >
                            {targetPlayer?.nickname || targetId} ({targetPlayer?.victoryPoints ?? 0} ZP)
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. Verilecek 1 Kaynağı Seç */}
                  <div>
                    <h3 className="text-xs md:text-sm font-bold text-amber-200 mb-2">
                      2. Elinden Vereceğin 1 Kaynak Kartını Seç:
                    </h3>
                    <div className="flex flex-wrap items-center gap-2.5 py-1">
                      {gameView.myHand.map((res, idx) => {
                        const isSelected = selectedCharityIndex === idx;
                        return (
                          <div key={`${res}-${idx}`} className="flex flex-col items-center">
                            <CardVisual
                              card={{ category: 'resource', type: res }}
                              size="xs"
                              selected={isSelected}
                              statusBadge={isSelected ? 'Verilecek' : undefined}
                              onClick={() => setSelectedCharityIndex(idx)}
                            />
                            <span className="mt-1 text-[10px] font-bold text-stone-300">
                              {RESOURCE_LABELS_TR[res]}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      disabled={selectedCharityIndex === null || !activeTargetId}
                      onClick={handleConfirmCharity}
                      className={`px-5 py-2 rounded-xl font-extrabold text-xs md:text-sm transition ${
                        selectedCharityIndex !== null && activeTargetId
                          ? 'bg-teal-500 hover:bg-teal-400 text-stone-950 cursor-pointer shadow'
                          : 'bg-stone-800 text-stone-500 cursor-not-allowed'
                      }`}
                    >
                      Seçilen Kaynağı Sadaka Olarak Ver
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-stone-900 border border-teal-500/30 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-teal-300 font-bold text-xs md:text-sm">
                    <Clock className="w-4 h-4 animate-spin" />
                    <span>En yüksek Zafer Puanlı oyuncu(lar)ın Sadaka kaynağı seçmesi bekleniyor...</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {pendingEvent.pendingCharityGives?.map((c) => {
                      const p = gameView.players.find((pl) => pl.playerId === c.fromPlayerId);
                      return (
                        <span
                          key={c.fromPlayerId}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                            c.completed
                              ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                              : 'bg-teal-500/15 border-teal-400 text-teal-200'
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {p?.nickname || 'Oyuncu'}{' '}
                          {c.completed ? '(Verdi)' : '(Seçiyor...)'}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
