"use client";

import { useState, useEffect, useRef } from "react";
import { useGameStore } from "@/store/game-store";
import { calculatePlayerNetWorth } from "@/lib/game-engine";
import EventLog from "./EventLog";
import LoanModal from "./LoanModal";
import LiquidationModal from "./LiquidationModal";
import TradePlayerSelectModal from "./TradePlayerSelectModal";
import TradeNegotiationModal from "./TradeNegotiationModal";

const getAvatarImage = (id: string | null) => {
  if (!id) return <span className="text-xl">🎩</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/avatars/${id}.svg`} alt={id} className="w-5 h-5" />;
};
function AnimatedCash({ cash }: { cash: number }) {
  const prevCash = useRef(cash);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (cash > prevCash.current) {
      setFlash("up");
    } else if (cash < prevCash.current) {
      setFlash("down");
    }
    
    if (cash !== prevCash.current) {
      prevCash.current = cash;
      const timer = setTimeout(() => setFlash(null), 1000);
      return () => clearTimeout(timer);
    }
  }, [cash]);

  return (
    <div className={`text-[16px] font-black tracking-tight transition-all duration-500 ease-out transform
      ${cash < 0 ? 'text-red-800' : 'text-[#1a1a1a]'}
      ${flash === "up" ? 'text-emerald-500 drop-shadow-[0_0_12px_rgba(16,185,129,1)] scale-110 -translate-y-0.5' : ''}
      ${flash === "down" ? 'text-rose-600 drop-shadow-[0_0_12px_rgba(225,29,72,1)] scale-95 translate-y-0.5' : ''}
    `}>
      ${cash.toLocaleString()}
    </div>
  );
}

export default function PlayerHUD() {
  const { players, match, myPlayerId, tiles, setHoveredPlayerId } = useGameStore();
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [isTradeSelectOpen, setIsTradeSelectOpen] = useState(false);
  const [tradePartnerId, setTradePartnerId] = useState<string | null>(null);
  const [showBankruptcyConfirm, setShowBankruptcyConfirm] = useState(false);

  const sortedPlayers = [...players].sort((a, b) => a.turnOrder - b.turnOrder);
  const activeCount = players.filter((p) => !p.isBankrupt).length;
  
  const me = players.find((p) => p.id === myPlayerId);
  const isMyTurn = match?.currentTurnId === myPlayerId;

  const handleBankruptcy = async () => {
    if (!match) return;
    setShowBankruptcyConfirm(false);
    try {
      await fetch("/api/game/bank-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          matchId: match.id, 
          playerId: myPlayerId,
          action: "BANKRUPTCY"
        }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Avatar Color Map for PlayerHUD
  const getAvatarColor = (avatarId: string | null) => {
    switch (avatarId) {
      case "cat": return "#06b6d4";
      case "fox": return "#f43f5e";
      case "dog": return "#f59e0b";
      case "bear": return "#10b981";
      case "bunny": return "#a855f7";
      case "owl": return "#6366f1";
      default: return "#534031";
    }
  };

  return (
    <aside className="w-full lg:w-[380px] shrink-0 h-full flex flex-col relative rounded-[12px] border-[3px] border-[#362719] overflow-hidden shadow-2xl bg-[#e3d8c4]" data-purpose="right-sidebar">
      
      {/* Top Header */}
      <div className="bg-[#362719] px-5 py-4 flex items-center justify-between shrink-0">
        <h1 className="text-[17px] font-black tracking-widest text-[#dfd5c5] uppercase font-serif drop-shadow-sm">Fog of War</h1>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#9a8875] font-bold tracking-widest uppercase">ROOM</span>
          <div 
            className="flex items-center bg-[#1d2729] rounded border border-[#2b3a3d] overflow-hidden shadow-inner cursor-pointer group" 
            onClick={() => match?.inviteCode && navigator.clipboard.writeText(match.inviteCode)} 
            title="Copy Room Code"
          >
            <span className="text-xs font-mono font-bold text-[#62a1af] px-2 py-0.5 tracking-widest">{match?.inviteCode || "..."}</span>
            <div className="px-1.5 py-1 border-l border-[#2b3a3d] bg-[#141b1d] group-hover:bg-[#202a2d] transition-colors flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-[#62a1af] opacity-60 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col p-3 sm:p-4 overflow-hidden">
        
        {/* Main Content Wrapper */}
        <div className="flex-1 flex flex-col space-y-4 px-1 min-h-0">

          {/* 1. PLAYERS SECTION */}
          <section className="space-y-2 shrink-0">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[#4a4a4a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                <h2 className="text-xs font-extrabold tracking-widest text-[#4a4a4a] uppercase">Players</h2>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#d4e4cd] text-[#33684a] border border-[#a4c7af] uppercase tracking-wider">
                {activeCount} ACTIVE
              </span>
            </div>

            <div className="space-y-1.5">
              {sortedPlayers.map((player) => {
                const isCurrentTurn = match?.currentTurnId === player.id;
                const isMe = player.id === myPlayerId;
                const ownedTiles = tiles.filter((t) => t.ownerId === player.id);
                const ownedCount = ownedTiles.length;
                const netWorth = calculatePlayerNetWorth(player.cash, ownedTiles);

                const pColor = getAvatarColor(player.avatar);
                
                const cardStyle = isCurrentTurn 
                  ? {
                      background: 'linear-gradient(to right, ' + pColor + '33, ' + pColor + '1A, transparent)',
                      borderColor: pColor + '80',
                      boxShadow: '0 0 0 1px ' + pColor + '66'
                    } 
                  : {
                      background: pColor + '14',
                      borderColor: pColor + '33'
                    };

                const baseClasses = isCurrentTurn 
                  ? "p-2.5 rounded-lg border shadow-sm transition-all duration-200"
                  : "p-2.5 rounded-lg border hover:brightness-95 transition-all duration-200 cursor-pointer";

                const hasActiveLoan = player.loanPrincipal > 0;
                const turnsRemaining = Math.max(0, (player.loanDeadlineTurn ?? 0) - player.turnsPlayed);

                return (
                  <div 
                    key={player.id} 
                    className={`${baseClasses} ${player.isBankrupt ? 'opacity-40 grayscale' : ''}`}
                    style={cardStyle}
                    onMouseEnter={() => setHoveredPlayerId(player.id)}
                    onMouseLeave={() => setHoveredPlayerId(null)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div 
                          className={`w-9 h-9 rounded-[8px] border-2 border-[#3d2e22] shadow-inner flex items-center justify-center transition-colors`}
                          style={{ backgroundColor: getAvatarColor(player.avatar) }}
                        >
                          {getAvatarImage(player.avatar)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            {isCurrentTurn && <span className={`w-2 h-2 rounded-full animate-pulse shadow-md`} style={{ backgroundColor: pColor, boxShadow: `0 0 5px ${pColor}` }}></span>}
                            <span className={`text-[13px] font-black tracking-tight text-[#1a1a1a]`}>
                              {player.name} {isMe && "(You)"}
                            </span>
                            {isCurrentTurn && <span className={`ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider`} style={{ backgroundColor: `${pColor}33`, color: pColor, border: `1px solid ${pColor}80` }}>TURN</span>}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11.5px] font-semibold text-[#5a5a5a]">{ownedCount} Properties</span>
                            {player.isLiquidating ? (
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-red-600 text-white animate-pulse">
                                🚨 LIQUIDATING
                              </span>
                            ) : hasActiveLoan ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-700/20 text-amber-900 border border-amber-800/30">
                                🏦 ${player.loanPrincipal + player.loanInterest} ({turnsRemaining}t)
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <AnimatedCash cash={player.cash} />
                        <div className="font-mono text-[10px] font-bold text-[#5a5a5a] tracking-tight">Net: ${netWorth.toLocaleString()}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 2. BANK VAULT SECTION */}
          <section className="space-y-2 pt-1 shrink-0">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[#4a4a4a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <h2 className="text-xs font-extrabold tracking-widest text-[#4a4a4a] uppercase">Bank Vault</h2>
              </div>
              <span className="font-serif text-[14px] font-bold text-[#4a4a4a]">
                §∞
              </span>
            </div>

            <div className="space-y-1.5">
              {me?.loanPrincipal && me.loanPrincipal > 0 ? (
                <div className="p-2.5 rounded-lg bg-amber-600/15 border border-amber-700/30 flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🏦</span>
                    <div>
                      <div className="text-xs font-black text-amber-950 uppercase tracking-wide">
                        Active {me.loanType || "Bank"} Loan
                      </div>
                      <div className="text-[11px] text-amber-900 font-medium">
                        Due: ${me.loanPrincipal + me.loanInterest} • {Math.max(0, (me.loanDeadlineTurn ?? 0) - me.turnsPlayed)} turns left
                      </div>
                    </div>
                  </div>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-amber-800 text-amber-100 uppercase">
                    LOCKED
                  </span>
                </div>
              ) : (
                <button 
                  onClick={() => setIsLoanModalOpen(true)}
                  disabled={!isMyTurn || (me?.isLiquidating ?? false) || !(match?.enableBank ?? true)}
                  className={`w-full group px-3 py-2.5 rounded-lg border transition-all duration-200 flex items-center justify-between shadow-sm ${
                    isMyTurn && !me?.isLiquidating && (match?.enableBank ?? true)
                      ? "bg-[#e5ecdb] border-[#c0d5ae] hover:bg-[#d8e2cb] active:scale-[0.98]" 
                      : "bg-[#e5ecdb]/60 border-[#c0d5ae]/60 opacity-60 cursor-not-allowed"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <svg className="w-4 h-4 text-[#33684a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="20" height="14" x="2" y="5" rx="2"/>
                      <line x1="2" x2="22" y1="10" y2="10"/>
                    </svg>
                    <span className="text-[12px] font-bold text-[#1a1a1a]">Bank Loans &amp; Credit</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-[6px] bg-[#d4e4cd] text-[#33684a] border border-[#a4c7af] uppercase tracking-wider">
                    CREDIT
                  </span>
                </button>
              )}

              {/* Initiate Trade Button */}
              <button 
                onClick={() => setIsTradeSelectOpen(true)}
                disabled={!isMyTurn || (me?.isLiquidating ?? false) || (me?.isBankrupt ?? false)}
                className={`w-full group px-3 py-2.5 rounded-lg border transition-all duration-200 flex items-center justify-between shadow-sm ${
                  isMyTurn && !me?.isLiquidating && !me?.isBankrupt
                    ? "bg-[#dbe5f0] border-[#a3bdd6] hover:bg-[#cddbec] active:scale-[0.98]" 
                    : "bg-[#dbe5f0]/60 border-[#a3bdd6]/60 opacity-60 cursor-not-allowed"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <svg className="w-4 h-4 text-[#2c5e8a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 3h5v5"/>
                    <path d="M8 21H3v-5"/>
                    <line x1="21" y1="3" x2="14" y2="10"/>
                    <line x1="3" y1="21" x2="10" y2="14"/>
                  </svg>
                  <span className="text-[12px] font-bold text-[#1a1a1a]">Initiate Trade</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-1 rounded-[6px] bg-[#c4d5e6] text-[#2c5e8a] border border-[#a3bdd6] uppercase tracking-wider">
                  DEAL
                </span>
              </button>

              <button 
                onClick={() => setShowBankruptcyConfirm(true)}
                className="w-full group px-3 py-2.5 rounded-lg bg-[#ead4d3] hover:bg-[#e0c4c2] active:scale-[0.98] border border-[#d6afae] transition-all duration-200 flex items-center justify-between shadow-sm"
              >
                <div className="flex items-center gap-2.5">
                  <svg className="w-4 h-4 text-[#9c3636]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <span className="text-[12px] font-bold text-[#9c3636]">Declare Bankruptcy</span>
                </div>
                <span className="text-[10px] tracking-wider font-bold px-2 py-1 rounded-[6px] bg-[#d9afaf] text-[#7a2828] border border-[#c49292] uppercase">
                  FORFEIT
                </span>
              </button>
            </div>
          </section>

          {/* 3. GAME LOG SECTION */}
          <section className="flex-1 flex flex-col space-y-2 pt-2 pb-2 min-h-0 shrink">
            <div className="flex items-center justify-between px-1 shrink-0">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[#4a4a4a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
                <h2 className="text-xs font-extrabold tracking-widest text-[#4a4a4a] uppercase">Game Log</h2>
              </div>
              <span className="w-2.5 h-2.5 rounded-full bg-[#35b579] shadow-[0_0_8px_rgba(53,181,121,0.5)]"></span>
            </div>

            <div className="flex-1 p-3 rounded-xl bg-[#dcd0b1] border border-[#c2b28c] shadow-inner font-mono text-[11px] leading-relaxed overflow-y-auto custom-scrollbar text-[#333]">
              <EventLog />
            </div>
          </section>

        </div>

      </div>

      {/* Modals */}
      <LoanModal isOpen={isLoanModalOpen} onClose={() => setIsLoanModalOpen(false)} />
      <LiquidationModal />
      <TradePlayerSelectModal
        isOpen={isTradeSelectOpen}
        onClose={() => setIsTradeSelectOpen(false)}
        onSelectPartner={(partnerId) => {
          setIsTradeSelectOpen(false);
          setTradePartnerId(partnerId);
        }}
      />
      <TradeNegotiationModal
        partnerId={tradePartnerId}
        onClose={() => setTradePartnerId(null)}
      />

      {showBankruptcyConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
          <div className="deckled-edges parchment-card shadow-2xl rounded-md max-w-sm w-full p-6 text-center border border-[#d4ba96]">
            <h2 className="text-xl font-bold text-[#7a2828] mb-4 uppercase tracking-widest font-serif">Declare Bankruptcy?</h2>
            <p className="text-[#58412b] mb-6 text-sm">
              Are you sure you want to declare bankruptcy? You will lose all properties and be <strong className="text-red-700">eliminated</strong> from the game.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowBankruptcyConfirm(false)}
                className="flex-1 py-2.5 rounded bg-[#f4e8d3] hover:bg-[#ebe0cb] text-[#4a3420] border border-[#d4ba96] font-bold text-sm uppercase tracking-wider transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBankruptcy}
                className="flex-1 py-2.5 rounded bg-[#9c2b2b] hover:bg-[#852323] text-white border border-[#7a2020] font-bold text-sm uppercase tracking-wider shadow-md transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
