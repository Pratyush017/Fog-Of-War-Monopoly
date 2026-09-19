"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "@/store/game-store";
import { Trophy, Skull, Home, Eye, ArrowLeft } from "lucide-react";

interface GameOverScreenProps {
  gameOver: {
    winnerId: string;
    winnerName: string;
  };
}

export default function GameOverScreen({ gameOver }: GameOverScreenProps) {
  const router = useRouter();
  const { players, tiles, myPlayerId } = useGameStore();
  const [minimized, setMinimized] = useState(false);

  const isWinner = gameOver.winnerId === myPlayerId;
  const winner = players.find((p) => p.id === gameOver.winnerId);

  // Calculate stats for standings table
  const rankedPlayers = [...players].sort((a, b) => {
    // Winner always 1st
    if (a.id === gameOver.winnerId) return -1;
    if (b.id === gameOver.winnerId) return 1;
    // Non-bankrupt over bankrupt
    if (!a.isBankrupt && b.isBankrupt) return -1;
    if (a.isBankrupt && !b.isBankrupt) return 1;
    // Highest cash next
    return (b.cash || 0) - (a.cash || 0);
  });

  const getPlayerPropertiesCount = (playerId: string) => {
    return tiles.filter((t) => t.ownerId === playerId).length;
  };

  if (minimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4">
        <button
          onClick={() => setMinimized(false)}
          className="btn-terracotta px-5 py-3 rounded-lg text-white font-serif font-bold text-xs uppercase tracking-widest shadow-2xl flex items-center gap-2 border-2 border-[#d4af62]"
        >
          <Trophy size={16} className="text-amber-300" />
          <span>View Victory Proclamation</span>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-black/60 body-texture overflow-y-auto">
      {/* Outer Leather Box Frame */}
      <div className="relative w-full max-w-xl my-auto leather-panel rounded-xl p-3 md:p-4 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] animate-in zoom-in-95 duration-300">
        {/* Antique Brass Corner Brackets */}
        <div className="brass-corner-tl" />
        <div className="brass-corner-tr" />
        <div className="brass-corner-bl" />
        <div className="brass-corner-br" />

        {/* Inner Parchment Scroll */}
        <div className="parchment-card deckled-edges rounded p-6 md:p-8 text-[#3d2410] border-2 border-[#b89758]/50">
          {/* Header Flourish & Crest */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="mb-2">
              <span className="inline-block px-3 py-1 rounded bg-[#e8d5ae] border border-[#cca97f] font-serif text-[10px] font-bold tracking-[0.25em] text-[#7a5937] uppercase">
                {isWinner ? "Royal Proclamation • Grand Victory" : "Decree of Final Standing"}
              </span>
            </div>

            {/* Emblem Crest */}
            <div className="my-3 relative flex items-center justify-center">
              <div
                className={`w-20 h-20 rounded-full flex items-center justify-center border-4 shadow-xl ${
                  isWinner
                    ? "bg-gradient-to-b from-[#fceabb] via-[#f8b500] to-[#b8860b] border-[#5c3e10] text-[#3d2410]"
                    : "bg-gradient-to-b from-[#d9a779] via-[#8c5230] to-[#4a2612] border-[#2e1708] text-[#fceabb]"
                }`}
              >
                {isWinner ? (
                  <Trophy size={42} strokeWidth={2.2} className="text-[#3d2410] drop-shadow" />
                ) : (
                  <Skull size={38} strokeWidth={2} className="text-[#fceabb] drop-shadow" />
                )}
              </div>
            </div>

            {/* Title */}
            <h1 className="font-serif font-black tracking-widest text-2xl md:text-3xl uppercase text-[#361f0c] drop-shadow-sm mt-1">
              {isWinner ? "Sovereign of the Realm" : "Conquest Concluded"}
            </h1>

            {/* Decorative Divider */}
            <div className="flex items-center justify-center gap-2 my-2 w-full max-w-xs">
              <div className="h-[1px] flex-1 bg-[#cca97f]/60" />
              <span className="text-[#99783f] text-xs">✦ ✦ ✦</span>
              <div className="h-[1px] flex-1 bg-[#cca97f]/60" />
            </div>

            {/* Subtext */}
            <p className="text-xs md:text-sm text-[#61452a] font-serif italic max-w-md leading-relaxed">
              {isWinner
                ? "Through cunning strategy and absolute financial dominion, you have vanquished all rivals and claimed total mastery of the board."
                : `${gameOver.winnerName} has outmaneuvered all contenders and established absolute supremacy over the realm.`}
            </p>
          </div>

          {/* Standings Ledger */}
          <div className="mb-6">
            <div className="flex items-center justify-between pb-1.5 border-b border-[#cca97f]/50 mb-2 text-[10px] font-serif uppercase tracking-widest text-[#7a5937] font-bold">
              <span>Merchant / Monopolist</span>
              <span>Final Holdings</span>
            </div>

            <div className="space-y-1.5">
              {rankedPlayers.map((player, idx) => {
                const isThisPlayerWinner = player.id === gameOver.winnerId;
                const isMe = player.id === myPlayerId;
                const propCount = getPlayerPropertiesCount(player.id);

                return (
                  <div
                    key={player.id}
                    className={`flex items-center justify-between px-3 py-2 rounded border transition-colors ${
                      isThisPlayerWinner
                        ? "bg-[#ecd7a9] border-[#c29d5b] text-[#361f0c] shadow-sm font-semibold"
                        : isMe
                        ? "bg-[#fbf4e2] border-[#cca97f] text-[#4a3420]"
                        : "bg-[#e8dbbf]/40 border-[#cca97f]/30 text-[#61452a]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-xs font-bold text-[#8c6536] w-4">
                        {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}.`}
                      </span>
                      <div
                        className="w-3 h-3 rounded-full border border-black/30 shadow-inner shrink-0"
                        style={{ backgroundColor: player.color || "#888" }}
                      />
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="text-xs font-serif truncate">{player.name}</span>
                        {isMe && (
                          <span className="text-[9px] font-sans font-bold bg-[#7a5937]/15 text-[#58412b] px-1.5 py-0.2 rounded uppercase">
                            You
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-right">
                      <div className="text-[11px] font-mono">
                        <span className="text-[#361f0c] font-bold">
                          ${player.isBankrupt ? "0" : player.cash.toLocaleString()}
                        </span>
                      </div>
                      <div className="text-[10px] font-serif text-[#7a5937] flex items-center gap-0.5 w-12 justify-end">
                        <Home size={11} className="text-[#8c6536]" />
                        <span>{propCount}</span>
                      </div>
                      <div className="w-16 text-right">
                        {player.isBankrupt ? (
                          <span className="text-[9px] font-sans font-bold text-red-800 uppercase tracking-wider bg-red-100 px-1.5 py-0.5 rounded border border-red-200">
                            Bankrupt
                          </span>
                        ) : isThisPlayerWinner ? (
                          <span className="text-[9px] font-sans font-bold text-amber-900 uppercase tracking-wider bg-amber-200/80 px-1.5 py-0.5 rounded border border-amber-300">
                            Winner
                          </span>
                        ) : (
                          <span className="text-[9px] font-sans font-bold text-stone-700 uppercase tracking-wider bg-stone-200 px-1.5 py-0.5 rounded">
                            Active
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={() => setMinimized(true)}
              className="btn-dark-slate flex-1 py-3 px-4 rounded text-white font-serif font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-98 shadow-md"
            >
              <Eye size={14} className="text-slate-300" />
              <span>Inspect Board</span>
            </button>

            <button
              onClick={() => router.push("/")}
              className="btn-terracotta flex-1 py-3 px-4 rounded text-white font-serif font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-98 shadow-lg"
            >
              <ArrowLeft size={14} className="text-amber-200" />
              <span>Back to Home</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
