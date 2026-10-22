'use client';

import React, { useMemo, useState } from 'react';
import { ClientGameView, PublicPlayerState } from '@/types/game';
import {
  Award,
  Building2,
  Castle,
  Crown,
  Eye,
  EyeOff,
  Home,
  LogOut,
  Play,
  Route,
  Shield,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';

export interface VictoryModalProps {
  gameView: ClientGameView;
  onNewDemoGame: (playerCount?: number) => void;
  onReturnToLobby: () => void;
  isOpen?: boolean;
}

interface PlayerScoreBreakdown {
  player: PublicPlayerState;
  visibleVillages: number;
  visibleCities: number;
  metropolises: number;
  buildingsVp: number;
  longestRoadVp: number;
  largestArmyVp: number;
  totalVp: number;
}

function computeBreakdown(player: PublicPlayerState): PlayerScoreBreakdown {
  let visibleVillages = 0;
  let visibleCities = 0;
  let metropolises = 0;

  for (const slot of player.villageSlots) {
    if (slot.upgradedTo === 'none') {
      visibleVillages += 1;
    } else if (slot.upgradedTo === 'city') {
      visibleCities += 1;
    } else if (slot.upgradedTo === 'metropolis') {
      metropolises += 1;
    }
  }

  const buildingsVp = visibleVillages * 1 + visibleCities * 2 + metropolises * 3;
  const longestRoadVp = player.hasLongestRoad ? 2 : 0;
  const largestArmyVp = player.hasLargestArmy ? 2 : 0;

  return {
    player,
    visibleVillages,
    visibleCities,
    metropolises,
    buildingsVp,
    longestRoadVp,
    largestArmyVp,
    totalVp: player.victoryPoints,
  };
}

export const VictoryModal: React.FC<VictoryModalProps> = ({
  gameView,
  onNewDemoGame,
  onReturnToLobby,
  isOpen,
}) => {
  const [isInspectingTable, setIsInspectingTable] = useState(false);

  const shouldShow = isOpen !== undefined ? isOpen : gameView.status === 'finished';

  const rankedBreakdowns = useMemo(() => {
    return [...gameView.players]
      .map(computeBreakdown)
      .sort((a, b) => {
        if (b.totalVp !== a.totalVp) return b.totalVp - a.totalVp;
        if (a.player.playerId === gameView.winnerPlayerId) return -1;
        if (b.player.playerId === gameView.winnerPlayerId) return 1;
        return b.buildingsVp - a.buildingsVp;
      });
  }, [gameView.players, gameView.winnerPlayerId]);

  if (!shouldShow) return null;

  const winner =
    gameView.players.find((p) => p.playerId === gameView.winnerPlayerId) ??
    rankedBreakdowns[0]?.player;
  const activePlayer = gameView.players[gameView.activePlayerIndex];
  const wonOnOwnTurn = winner && activePlayer?.playerId === winner.playerId;

  // Masayı İncele (Küçültülmüş Yüzer Bar Modu)
  if (isInspectingTable) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-2xl">
        <div className="bg-[#3b0404]/95 border-2 border-amber-400 rounded-2xl px-4 py-3 shadow-[0_20px_50px_rgba(0,0,0,0.9)] flex flex-wrap items-center justify-between gap-3 text-amber-50 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-400 text-stone-950 shadow">
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                Masa İnceleme Modu • Oyun Tamamlandı
              </div>
              <div className="text-sm font-black text-white">
                Kazanan: {winner?.nickname} ({winner?.victoryPoints ?? 7} ZP)
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsInspectingTable(false)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-950 font-extrabold text-xs cursor-pointer shadow transition"
            >
              <Eye className="w-4 h-4" />
              Sonuç Tablosunu Göster
            </button>
            <button
              type="button"
              onClick={() => onNewDemoGame(3)}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-[#240203] hover:bg-amber-500/20 text-amber-200 border border-amber-400/40 font-bold text-xs cursor-pointer transition"
            >
              <Play className="w-3.5 h-3.5" />
              Yeni Oyun
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-3 md:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="victory-modal-title"
    >
      <div className="relative w-full max-w-4xl bg-gradient-to-b from-[#3b0404]/95 via-[#240203]/95 to-[#140102]/95 border-2 border-amber-400/70 rounded-2xl shadow-[0_25px_80px_rgba(0,0,0,0.9)] text-amber-50 overflow-hidden my-auto">
        {/* Üst Kazanan Hero Banner */}
        <div className="relative px-6 py-6 bg-gradient-to-r from-[#4a0607] via-[#60080a] to-[#3a0404] border-b border-amber-400/40 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-center md:text-left flex-col md:flex-row">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-yellow-300 via-amber-400 to-amber-600 text-stone-950 flex items-center justify-center shadow-[0_0_30px_rgba(251,191,36,0.5)] border-2 border-yellow-100 shrink-0">
              <Crown className="w-9 h-9" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-400/20 border border-amber-300/40 text-amber-200 text-xs font-extrabold mb-1">
                <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                {wonOnOwnTurn
                  ? 'Kendi Turunda 7+ Zafer Puanına Ulaştı!'
                  : 'Oyun Tamamlandı — 7+ Zafer Puanı!'}
              </div>
              <h2
                id="victory-modal-title"
                className="text-2xl md:text-3xl font-black tracking-tight text-white drop-shadow"
              >
                Kazanan: <span className="text-amber-300">{winner?.nickname}</span>
              </h2>
              <p className="text-xs text-amber-200/80 mt-0.5">
                Oda #{gameView.roomCode} • {gameView.turnNumber}. Turda Tamamlandı
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-4 py-2.5 rounded-2xl bg-[#1a0102]/90 border-2 border-amber-400/60 text-center shadow-inner">
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300/90">
                Zafer Puanı
              </div>
              <div className="text-2xl md:text-3xl font-black text-yellow-300">
                {winner?.victoryPoints ?? 7} ZP
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsInspectingTable(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#240203] hover:bg-amber-500/20 text-amber-200 border border-amber-400/50 font-bold text-xs transition cursor-pointer shadow"
              title="Sonuç penceresini küçültüp oyun masasını incele"
            >
              <EyeOff className="w-4 h-4 text-amber-400" />
              <span>Masayı İncele / Sonucu Gizle</span>
            </button>
          </div>
        </div>

        {/* Oyuncu Sıralaması ve Puan Dağılımı Tablosu */}
        <div className="p-5 md:p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm md:text-base font-extrabold text-amber-200 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              Oyuncu Sıralaması ve Detaylı Puan Dağılımı
            </h3>
            <span className="text-xs text-amber-200/70">
              Hedef: Kendi turunda 7 Zafer Puanı (ZP)
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-amber-400/30 bg-[#180102]/90 shadow-inner">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-amber-400/25 bg-[#2a0304] text-amber-300 text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-3">Sıra & Oyuncu</th>
                  <th className="py-3 px-2.5 text-center">Toplam ZP</th>
                  <th className="py-3 px-2.5 text-center">Köyler (1 ZP)</th>
                  <th className="py-3 px-2.5 text-center">Şehirler (2 ZP)</th>
                  <th className="py-3 px-2.5 text-center">Metropoller (3 ZP)</th>
                  <th className="py-3 px-2.5 text-center">Binalar (+ZP)</th>
                  <th className="py-3 px-2.5 text-center">En Uzun Yol</th>
                  <th className="py-3 px-2.5 text-center">En Güçlü Ordu</th>
                  <th className="py-3 px-3 text-center">Yol & Şövalye</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-400/15">
                {rankedBreakdowns.map((item, idx) => {
                  const isWinner = item.player.playerId === winner?.playerId;
                  const isMe = item.player.playerId === gameView.myPlayerId;

                  return (
                    <tr
                      key={item.player.playerId}
                      className={`transition ${
                        isWinner
                          ? 'bg-amber-500/15 text-amber-50 font-semibold'
                          : 'hover:bg-white/5 text-amber-100/90'
                      }`}
                    >
                      {/* Sıra & Oyuncu */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center font-black text-xs shrink-0 ${
                              idx === 0
                                ? 'bg-amber-400 text-stone-950 shadow'
                                : 'bg-stone-800 text-amber-200 border border-amber-400/30'
                            }`}
                          >
                            {idx + 1}
                          </span>
                          <div>
                            <div className="flex items-center gap-1.5 font-extrabold text-sm">
                              <span>{item.player.nickname}</span>
                              {isWinner && (
                                <Crown className="w-4 h-4 text-yellow-400 inline shrink-0" />
                              )}
                              {isMe && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-300">
                                  Sen
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-amber-200/60">
                              Eldeki Kaynak: {item.player.handCount} Kart
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Toplam ZP */}
                      <td className="py-3 px-2.5 text-center">
                        <span
                          className={`inline-flex items-center justify-center px-2.5 py-1 rounded-lg font-black text-sm ${
                            isWinner
                              ? 'bg-amber-400 text-stone-950 shadow'
                              : 'bg-[#2c0304] text-amber-200 border border-amber-400/30'
                          }`}
                        >
                          {item.totalVp} ZP
                        </span>
                      </td>

                      {/* Köyler (1 ZP) */}
                      <td className="py-3 px-2.5 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-orange-950/70 border border-orange-400/30 text-orange-200 font-bold">
                          <Home className="w-3 h-3 text-orange-400" />
                          {item.visibleVillages} ({item.visibleVillages * 1} ZP)
                        </span>
                      </td>

                      {/* Şehirler (2 ZP) */}
                      <td className="py-3 px-2.5 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-950/70 border border-indigo-400/30 text-indigo-200 font-bold">
                          <Building2 className="w-3 h-3 text-indigo-400" />
                          {item.visibleCities} ({item.visibleCities * 2} ZP)
                        </span>
                      </td>

                      {/* Metropoller (3 ZP) */}
                      <td className="py-3 px-2.5 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-950/70 border border-purple-400/30 text-purple-200 font-bold">
                          <Castle className="w-3 h-3 text-purple-300" />
                          {item.metropolises} ({item.metropolises * 3} ZP)
                        </span>
                      </td>

                      {/* Binalar (+ZP) */}
                      <td className="py-3 px-2.5 text-center">
                        <span className="font-extrabold text-amber-200">
                          +{item.buildingsVp} ZP
                        </span>
                      </td>

                      {/* En Uzun Yol */}
                      <td className="py-3 px-2.5 text-center">
                        {item.player.hasLongestRoad ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-400/20 border border-yellow-400 text-yellow-200 font-extrabold">
                            <Award className="w-3.5 h-3.5 text-yellow-300" />
                            Aktif (+{item.longestRoadVp} ZP)
                          </span>
                        ) : (
                          <span className="text-stone-500">—</span>
                        )}
                      </td>

                      {/* En Büyük Şövalye Gücü */}
                      <td className="py-3 px-2.5 text-center">
                        {item.player.hasLargestArmy ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-400 text-rose-200 font-extrabold">
                            <Shield className="w-3.5 h-3.5 text-rose-300" />
                            Aktif (+{item.largestArmyVp} ZP)
                          </span>
                        ) : (
                          <span className="text-stone-500">—</span>
                        )}
                      </td>

                      {/* Yol & Şövalye Sayısı */}
                      <td className="py-3 px-3 text-center">
                        <div className="inline-flex items-center gap-2 text-[11px] font-bold">
                          <span className="px-2 py-0.5 rounded bg-amber-950/80 border border-amber-400/30 text-amber-200 inline-flex items-center gap-1">
                            <Route className="w-3 h-3 text-amber-400" />
                            {item.player.roadsCount} Yol
                          </span>
                          <span className="px-2 py-0.5 rounded bg-rose-950/80 border border-rose-400/30 text-rose-200 inline-flex items-center gap-1">
                            <Shield className="w-3 h-3 text-rose-400" />
                            {item.player.knightsCount} Şövalye
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Alt Aksiyon Butonları */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-amber-400/20">
            <button
              type="button"
              onClick={() => setIsInspectingTable(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#240203] hover:bg-amber-500/20 text-amber-200 border border-amber-400/40 font-bold text-xs md:text-sm transition cursor-pointer"
            >
              <Eye className="w-4 h-4 text-amber-400" />
              Masayı İncele / Sonucu Gizle
            </button>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => onNewDemoGame(3)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:to-yellow-300 text-stone-950 font-black text-xs md:text-sm shadow-lg transition cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                Yeni Hızlı Oyun (3 Kişi)
              </button>

              <button
                type="button"
                onClick={() => onNewDemoGame(4)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 border border-amber-400/50 font-extrabold text-xs md:text-sm transition cursor-pointer"
              >
                <Users className="w-4 h-4 text-amber-300" />
                Yeni 4 Kişilik Oyun
              </button>

              <button
                type="button"
                onClick={onReturnToLobby}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-stone-200 border border-stone-700 font-bold text-xs md:text-sm transition cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                Lobiye Dön
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VictoryModal;
