"use client";

import React, { useEffect, useMemo, useState } from "react";

export interface TableDealOverlayProps {
  active: boolean;
  playerCount?: number;
  mode?: "opening_deal" | "shuffle_only";
  triggerShuffleKey?: number;
  onComplete: () => void;
}

interface DealCardDescriptor {
  id: string;
  src: string;
  label: string;
  toX: string;
  toY: string;
  rot: string;
  delayMs: number;
  widthClass?: string;
}

const BUILDING_PREVIEW_CARDS = [
  "/cards/building/building_road.png",
  "/cards/building/building_settlement.png",
  "/cards/building/building_city.png",
  "/cards/building/building_knight.png",
  "/cards/building/building_back.png",
];

// Corner coordinates relative to viewport center for 3 or 4 players
function getPlayerCornerTargets(playerCount: number): Array<{
  name: string;
  handX: string;
  handY: string;
  boardX: string;
  boardY: string;
  baseRot: number;
}> {
  if (playerCount === 3) {
    return [
      {
        name: "Oyuncu 1 (Sen)",
        handX: "0vw",
        handY: "32vh",
        boardX: "-10vw",
        boardY: "22vh",
        baseRot: 0,
      },
      {
        name: "Oyuncu 2 (Sol Üst)",
        handX: "-34vw",
        handY: "-28vh",
        boardX: "-24vw",
        boardY: "-18vh",
        baseRot: 14,
      },
      {
        name: "Oyuncu 3 (Sağ Üst)",
        handX: "34vw",
        handY: "-28vh",
        boardX: "24vw",
        boardY: "-18vh",
        baseRot: -14,
      },
    ];
  }

  return [
    {
      name: "Oyuncu 1 (Sen)",
      handX: "-26vw",
      handY: "30vh",
      boardX: "-18vw",
      boardY: "20vh",
      baseRot: -6,
    },
    {
      name: "Oyuncu 2 (Sol Üst)",
      handX: "-34vw",
      handY: "-28vh",
      boardX: "-24vw",
      boardY: "-18vh",
      baseRot: 14,
    },
    {
      name: "Oyuncu 3 (Sağ Üst)",
      handX: "34vw",
      handY: "-28vh",
      boardX: "24vw",
      boardY: "-18vh",
      baseRot: -14,
    },
    {
      name: "Oyuncu 4 (Sağ Alt)",
      handX: "26vw",
      handY: "30vh",
      boardX: "18vw",
      boardY: "20vh",
      baseRot: 6,
    },
  ];
}

export function TableDealOverlay({
  active,
  playerCount = 4,
  mode = "opening_deal",
  triggerShuffleKey = 0,
  onComplete,
}: TableDealOverlayProps) {
  const [phase, setPhase] = useState<"shuffle" | "deal">("shuffle");

  // Keep a stable ref to onComplete so timer doesn't restart when parent re-renders
  const onCompleteRef = React.useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!active) return;

    setPhase("shuffle");

    if (mode === "shuffle_only") {
      const doneTimer = window.setTimeout(() => {
        onCompleteRef.current();
      }, 900);
      return () => window.clearTimeout(doneTimer);
    }

    const phaseTimer = window.setTimeout(() => {
      setPhase("deal");
    }, 850);

    const completeTimer = window.setTimeout(() => {
      onCompleteRef.current();
    }, 2400);

    return () => {
      window.clearTimeout(phaseTimer);
      window.clearTimeout(completeTimer);
    };
  }, [active, mode, triggerShuffleKey]);

  const handleSkip = () => {
    onCompleteRef.current();
  };

  const dealCards = useMemo<DealCardDescriptor[]>(() => {
    const cards: DealCardDescriptor[] = [];
    const corners = getPlayerCornerTargets(playerCount);

    // 1. 5 Building cards fanning into the central building row slots
    const buildingOffsets = ["-18vw", "-9vw", "0vw", "9vw", "18vw"];
    buildingOffsets.forEach((offsetX, idx) => {
      cards.push({
        id: `bldg-row-${idx}`,
        src: BUILDING_PREVIEW_CARDS[idx % BUILDING_PREVIEW_CARDS.length],
        label: `Yapı Havuzu #${idx + 1}`,
        toX: offsetX,
        toY: "-4vh",
        rot: `${(idx - 2) * 2.5}deg`,
        delayMs: idx * 70,
        widthClass: "w-20 sm:w-24",
      });
    });

    // 2. Starting Village & Road cards sliding to each player's board area
    corners.forEach((corner, pIdx) => {
      cards.push({
        id: `start-village-p${pIdx}`,
        src:
          pIdx === 0
            ? "/cards/starting/starting_settlement_front_starting_player.png"
            : "/cards/starting/starting_settlement_front.png",
        label: `${corner.name} Köy`,
        toX: corner.boardX,
        toY: corner.boardY,
        rot: `${corner.baseRot}deg`,
        delayMs: 360 + pIdx * 80,
        widthClass: "w-16 sm:w-20",
      });

      cards.push({
        id: `start-road-p${pIdx}`,
        src: "/cards/starting/starting_road_front.png",
        label: `${corner.name} Yol`,
        toX: `calc(${corner.boardX} + 3.5vw)`,
        toY: `calc(${corner.boardY} + 1.5vh)`,
        rot: `${corner.baseRot + 5}deg`,
        delayMs: 410 + pIdx * 80,
        widthClass: "w-16 sm:w-20",
      });
    });

    // 3. Resource cards (3 per player) flying out to each player's corner hand fan
    corners.forEach((corner, pIdx) => {
      for (let c = 0; c < 3; c++) {
        const fanOffset = (c - 1) * 2.2;
        cards.push({
          id: `res-p${pIdx}-c${c}`,
          src: "/cards/resource/resource_back.png",
          label: `${corner.name} Kaynak`,
          toX: `calc(${corner.handX} + ${fanOffset}vw)`,
          toY: corner.handY,
          rot: `${corner.baseRot + (c - 1) * 8}deg`,
          delayMs: 680 + pIdx * 95 + c * 45,
          widthClass: "w-14 sm:w-18",
        });
      }
    });

    return cards;
  }, [playerCount]);

  if (!active) return null;

  const isShufflePhase = phase === "shuffle" || mode === "shuffle_only";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/65 backdrop-blur-[3px] select-none"
      role="dialog"
      aria-label={
        isShufflePhase ? "Kartlar Karılıyor" : "Kartlar Masaya Diziliyor"
      }
    >
      {/* Ambient burgundy & gold tabletop radial spotlight */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(122, 28, 36, 0.48) 0%, rgba(20, 15, 11, 0.88) 72%)",
        }}
      />

      {/* Top status banner */}
      <div className="pointer-events-none absolute top-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-20">
        <div className="inline-flex items-center gap-2.5 rounded-full border border-[#d99b26]/50 bg-[#221a13]/90 px-5 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.65)]">
          <span className="h-2.5 w-2.5 rounded-full bg-[#d99b26] animate-ping" />
          <span className="text-sm sm:text-base font-semibold tracking-wider uppercase text-[#f5ebd6]">
            {isShufflePhase
              ? "Kartlar Karılıyor..."
              : "Kartlar Masaya Diziliyor..."}
          </span>
        </div>
        <p className="text-xs text-[#f5ebd6]/70">
          {isShufflePhase
            ? "Kaynak ve yapı desteleri harmanlanıyor"
            : `${playerCount} kişilik Catan masası kuruluyor`}
        </p>
      </div>

      {/* Skip ("Geç") button in the top-right corner */}
      <button
        type="button"
        onClick={handleSkip}
        className="absolute top-7 right-7 z-30 inline-flex items-center gap-2 rounded-lg border border-[#d99b26]/50 bg-[#221a13]/90 px-4 py-2 text-xs sm:text-sm font-medium text-[#f5ebd6] shadow-lg transition hover:border-[#d99b26] hover:bg-[#332419] active:scale-95 cursor-pointer"
      >
        <span>Geç (Skip)</span>
        <span aria-hidden="true" className="text-[#d99b26]">
          ⏭
        </span>
      </button>

      {/* Center Deck & Animation Stage */}
      <div className="relative flex items-center justify-center w-full h-full">
        {/* Phase 1: Riffle Shuffle Stack */}
        {isShufflePhase && (
          <div className="relative flex items-center justify-center">
            {/* Left Half of Deck (Resource Back Stack) */}
            {[0, 1, 2, 3].map((layer) => (
              <div
                key={`left-riffle-${layer}-${triggerShuffleKey}`}
                className="animate-catan-riffle-left absolute"
                style={{
                  animationDelay: `${layer * 38}ms`,
                  zIndex: 10 + layer,
                }}
              >
                <img
                  src="/cards/resource/resource_back.png"
                  alt="Kaynak Destesi"
                  className="w-24 sm:w-28 rounded-xl border border-[#d99b26]/40 shadow-[0_14px_28px_rgba(0,0,0,0.75)]"
                  draggable={false}
                />
              </div>
            ))}

            {/* Right Half of Deck (Building Back Stack) */}
            {[0, 1, 2, 3].map((layer) => (
              <div
                key={`right-riffle-${layer}-${triggerShuffleKey}`}
                className="animate-catan-riffle-right absolute"
                style={{
                  animationDelay: `${layer * 38 + 18}ms`,
                  zIndex: 11 + layer,
                }}
              >
                <img
                  src="/cards/building/building_back.png"
                  alt="Yapı Destesi"
                  className="w-24 sm:w-28 rounded-xl border border-[#d99b26]/40 shadow-[0_14px_28px_rgba(0,0,0,0.75)]"
                  draggable={false}
                />
              </div>
            ))}
          </div>
        )}

        {/* Phase 2: Opening Table Deal */}
        {!isShufflePhase && (
          <>
            {/* Central Anchor Deck */}
            <div className="relative z-10 flex items-center justify-center">
              <img
                src="/cards/building/building_back.png"
                alt="Merkez Deste"
                className="w-20 sm:w-24 rounded-xl border border-[#d99b26]/50 shadow-2xl opacity-75"
                draggable={false}
              />
            </div>

            {/* Flying Dealt Cards */}
            {dealCards.map((card) => (
              <div
                key={card.id}
                className="animate-catan-deal-card pointer-events-none absolute z-20"
                style={
                  {
                    "--deal-from-x": "0px",
                    "--deal-from-y": "0px",
                    "--deal-to-x": card.toX,
                    "--deal-to-y": card.toY,
                    "--deal-rot": card.rot,
                    "--deal-delay": `${card.delayMs}ms`,
                    "--deal-duration": "540ms",
                  } as React.CSSProperties
                }
              >
                <img
                  src={card.src}
                  alt={card.label}
                  className={`${card.widthClass ?? "w-16 sm:w-20"} rounded-lg border border-[#d99b26]/45 shadow-[0_10px_24px_rgba(0,0,0,0.7)]`}
                  draggable={false}
                />
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export default TableDealOverlay;
