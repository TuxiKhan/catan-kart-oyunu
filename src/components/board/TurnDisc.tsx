'use client';

import React from 'react';
import { CheckCircle2, Clock, Hourglass } from 'lucide-react';

export interface TurnDiscProps {
  isMyTurn: boolean;
  canAct: boolean;
  remainingSeconds: number | null;
  onEndTurn: () => void;
  activePlayerNickname?: string;
  turnPhase?: string;
  className?: string;
}

/**
 * Hearthstone Tarzı Şık, Dokunsal 'Turu Bitir' Diski
 * Masanın sağ kenarında yer alır, ekranı kaplayan dev paneller olmadan
 * sadece tek bir dokunuşla turu bitirmeyi sağlar.
 */
export const TurnDisc: React.FC<TurnDiscProps> = ({
  isMyTurn,
  canAct,
  remainingSeconds,
  onEndTurn,
  activePlayerNickname,
  turnPhase,
  className = '',
}) => {
  const isActionReady = isMyTurn && canAct;

  return (
    <div className={`relative select-none shrink-0 ${className}`}>
      {/* Hearthstone Dış Altın/Bronz Metalik Çerçeve */}
      <button
        type="button"
        disabled={!isActionReady}
        onClick={onEndTurn}
        aria-label={isActionReady ? 'Turu Bitir' : 'Rakibin Hamlesi Bekleniyor'}
        className={`group relative flex flex-col items-center justify-center transition-all duration-300 ${
          isActionReady
            ? 'cursor-pointer hover:scale-105 active:scale-95'
            : 'cursor-not-allowed opacity-80'
        }`}
      >
        {/* Metalik 3D Dış Halka */}
        <div
          className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full p-1.5 shadow-[0_10px_25px_rgba(0,0,0,0.85)] transition-all ${
            isActionReady
              ? 'bg-gradient-to-b from-amber-300 via-amber-600 to-amber-900 ring-2 ring-emerald-400/80 hearthstone-turn-disc-active'
              : 'bg-gradient-to-b from-stone-600 via-stone-700 to-stone-900 border border-stone-600'
          }`}
        >
          {/* İç Zümrüt / Taş Diski */}
          <div
            className={`w-full h-full rounded-full flex flex-col items-center justify-center p-1 text-center transition-all ${
              isActionReady
                ? 'bg-gradient-to-b from-emerald-500 via-emerald-600 to-emerald-900 text-amber-50 shadow-inner'
                : 'bg-gradient-to-b from-stone-800 via-stone-900 to-stone-950 text-stone-400 shadow-inner'
            }`}
          >
            {isActionReady ? (
              <>
                <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-300 mb-0.5 filter drop-shadow group-hover:scale-110 transition-transform" />
                <span className="text-[10px] sm:text-xs font-black tracking-wider uppercase drop-shadow-md leading-tight text-white">
                  TURU BİTİR
                </span>
                {remainingSeconds !== null && (
                  <span
                    className={`mt-0.5 text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-full ${
                      remainingSeconds <= 15
                        ? 'bg-rose-600 text-white animate-pulse'
                        : 'bg-black/40 text-emerald-200'
                    }`}
                  >
                    {remainingSeconds}s
                  </span>
                )}
              </>
            ) : (
              <>
                <Hourglass className="w-4 h-4 sm:w-5 sm:h-5 text-stone-500 mb-0.5 animate-pulse" />
                <span className="text-[9px] sm:text-[10px] font-bold tracking-tight uppercase text-stone-400 leading-tight">
                  {turnPhase === 'production'
                    ? 'HASAT'
                    : turnPhase === 'resolving_event'
                    ? 'OLAY'
                    : 'BEKLENİYOR'}
                </span>
                {activePlayerNickname && (
                  <span className="text-[8px] text-amber-300/80 truncate max-w-[64px] font-medium mt-0.5">
                    {activePlayerNickname}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* 3D Altın Tırnak / Rozet Efekti */}
        {isActionReady && (
          <div className="absolute -bottom-1 inset-x-0 flex justify-center">
            <span className="bg-amber-400 text-stone-950 font-black text-[8px] px-2 py-0.2 rounded-full shadow border border-amber-200">
              SIRANDA
            </span>
          </div>
        )}
      </button>
    </div>
  );
};
