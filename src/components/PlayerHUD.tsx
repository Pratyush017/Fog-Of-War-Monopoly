"use client";

import { useState, useEffect, useRef } from "react";
import { useGameStore } from "@/store/game-store";
import { calculatePlayerNetWorth } from "@/lib/game-engine";
import dynamic from "next/dynamic";
import EventLog from "./EventLog";

const LoanModal = dynamic(() => import("./LoanModal"), { ssr: false });
const LiquidationModal = dynamic(() => import("./LiquidationModal"), { ssr: false });
const TradePlayerSelectModal = dynamic(() => import("./TradePlayerSelectModal"), { ssr: false });
const TradeNegotiationModal = dynamic(() => import("./TradeNegotiationModal"), { ssr: false });

const getAvatarImage = (id: string | null) => {
  if (!id) return <span className="text-xl">🎩</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/avatars/${id}.svg`} alt={id} className="w-5 h-5" />;
};
function AnimatedCash({ cash, className = "text-[16px]" }: { cash: number, className?: string }) {
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
    <div className={`${className} font-black tracking-tight transition-all duration-500 ease-out transform
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
  const [isMobilePlayersOpen, setIsMobilePlayersOpen] = useState(false);
  const [isMobileBankOpen, setIsMobileBankOpen] = useState(false);
  const [isMobileLogOpen, setIsMobileLogOpen] = useState(false);

  const sortedPlayers = [...players].sort((a, b) => a.turnOrder - b.turnOrder);
  const activeCount = players.filter((p) => !p.isBankrupt).length;
  
  const me = players.find((p) => p.id === myPlayerId);
  const isMyTurn = match?.currentTurnId === myPlayerId;

  const handleBankruptcy = async () => {
    if (!match) return;
    setShowBankruptcyConfirm(false);
    setIsMobileBankOpen(false);
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

  const renderPlayersList = () => (
    <div className="grid grid-cols-2 gap-1.5">
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
          ? "p-2 rounded-lg border shadow-sm transition-all duration-200"
          : "p-2 rounded-lg border hover:brightness-95 transition-all duration-200 cursor-pointer";

        const hasActiveLoan = player.loanPrincipal > 0;
        const turnsRemaining = Math.max(0, (player.loanDeadlineTurn ?? 0) - player.turnsPlayed);

        return (
          <div 
            key={player.id} 
            className={`${baseClasses} ${player.isBankrupt ? 'opacity-40 grayscale' : ''} flex flex-col gap-1 relative overflow-hidden`}
            style={cardStyle}
            onMouseEnter={() => setHoveredPlayerId(player.id)}
            onMouseLeave={() => setHoveredPlayerId(null)}
          >
            {/* Top row: Avatar & Name */}
            <div className="flex items-center gap-1.5 min-w-0">
              <div 
                className={`w-6 h-6 rounded border border-[#3d2e22] shadow-inner flex items-center justify-center shrink-0`}
                style={{ backgroundColor: pColor }}
              >
                <div className="scale-75">{getAvatarImage(player.avatar)}</div>
              </div>
              <div className="flex-1 min-w-0 flex items-center justify-between gap-1">
                 <span className={`text-[11px] font-black tracking-tight text-[#1a1a1a] truncate`} title={player.name}>
                   {player.name}
                 </span>
                 {isCurrentTurn && <span className={`w-1.5 h-1.5 rounded-full animate-pulse shrink-0`} style={{ backgroundColor: pColor }}></span>}
              </div>
            </div>

            {/* Bottom row: Props & Cash */}
            <div className="flex items-end justify-between mt-1">
               <div className="text-[9px] font-bold text-[#5a5a5a] leading-tight pb-[2px]">
                 {ownedCount} <span className="opacity-70 font-semibold">Prop{ownedCount !== 1 && 's'}</span>
               </div>
               <div className="text-right">
                 <AnimatedCash cash={player.cash} className="text-[13px]" />
                 <div className="font-mono text-[8px] font-bold text-[#6a6a6a] tracking-tight -mt-0.5">Net: ${netWorth.toLocaleString()}</div>
               </div>
            </div>

            {/* Badges row */}
            {(player.isLiquidating || hasActiveLoan) && (
              <div className="mt-0.5">
                 {player.isLiquidating ? (
                   <span className="text-[8px] font-black px-1 py-0.5 rounded bg-red-600 text-white animate-pulse block text-center w-full">
                     LIQUIDATING
                   </span>
                 ) : hasActiveLoan ? (
                   <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-amber-700/20 text-amber-900 border border-amber-800/30 block text-center w-full">
                     LOAN: ${player.loanPrincipal + player.loanInterest} ({turnsRemaining}t)
                   </span>
                 ) : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const renderBankVault = () => (
    <div className="grid grid-cols-2 gap-1.5">
      {me?.loanPrincipal && me.loanPrincipal > 0 ? (
        <div className="col-span-2 p-2 rounded-lg bg-amber-600/15 border border-amber-700/30 flex items-center justify-between shadow-sm min-h-[36px]">
          <div className="flex items-center gap-2">
            <span className="text-sm">🏦</span>
            <div>
              <div className="text-[11px] font-black text-amber-950 uppercase tracking-wide leading-tight">
                Active {me.loanType || "Bank"} Loan
              </div>
              <div className="text-[9px] text-amber-900 font-medium">
                Due: ${me.loanPrincipal + me.loanInterest} • {Math.max(0, (me.loanDeadlineTurn ?? 0) - me.turnsPlayed)} turns left
              </div>
            </div>
          </div>
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-amber-800 text-amber-100 uppercase">
            LOCKED
          </span>
        </div>
      ) : (
        <button 
          onClick={() => { setIsLoanModalOpen(true); setIsMobileBankOpen(false); }}
          disabled={!isMyTurn || (me?.isLiquidating ?? false) || !(match?.enableBank ?? true)}
          className={`col-span-1 group px-2 py-1.5 rounded-lg border transition-all duration-200 flex items-center justify-between shadow-sm min-h-[36px] ${
            isMyTurn && !me?.isLiquidating && (match?.enableBank ?? true)
              ? "bg-[#e5ecdb] border-[#c0d5ae] hover:bg-[#d8e2cb] active:scale-[0.98]" 
              : "bg-[#e5ecdb]/60 border-[#c0d5ae]/60 opacity-60 cursor-not-allowed"
          }`}
        >
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-[#33684a] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect width="20" height="14" x="2" y="5" rx="2"/>
              <line x1="2" x2="22" y1="10" y2="10"/>
            </svg>
            <span className="text-[11px] font-bold text-[#1a1a1a] truncate">Bank Loans</span>
          </div>
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-[#d4e4cd] text-[#33684a] border border-[#a4c7af] uppercase tracking-wider hidden sm:block">
            CREDIT
          </span>
        </button>
      )}

      {/* Initiate Trade Button */}
      <button 
        onClick={() => { setIsTradeSelectOpen(true); setIsMobileBankOpen(false); }}
        disabled={!isMyTurn || (me?.isLiquidating ?? false) || (me?.isBankrupt ?? false)}
        className={`col-span-1 group px-2 py-1.5 rounded-lg border transition-all duration-200 flex items-center justify-between shadow-sm min-h-[36px] ${
          isMyTurn && !me?.isLiquidating && !me?.isBankrupt
            ? "bg-[#dbe5f0] border-[#a3bdd6] hover:bg-[#cddbec] active:scale-[0.98]" 
            : "bg-[#dbe5f0]/60 border-[#a3bdd6]/60 opacity-60 cursor-not-allowed"
        }`}
      >
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-[#2c5e8a] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 3h5v5"/>
            <path d="M8 21H3v-5"/>
            <line x1="21" y1="3" x2="14" y2="10"/>
            <line x1="3" y1="21" x2="10" y2="14"/>
          </svg>
          <span className="text-[11px] font-bold text-[#1a1a1a] truncate">
            Trade
          </span>
        </div>
        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-[#c4d5e6] text-[#2c5e8a] border border-[#a3bdd6] uppercase tracking-wider hidden sm:block">
          DEAL
        </span>
      </button>

      <button 
        onClick={() => { setShowBankruptcyConfirm(true); setIsMobileBankOpen(false); }}
        className="col-span-2 group px-2 py-1.5 rounded-lg bg-[#ead4d3] hover:bg-[#e0c4c2] active:scale-[0.98] border border-[#d6afae] transition-all duration-200 flex items-center justify-center gap-2 shadow-sm min-h-[32px]"
      >
        <svg className="w-3.5 h-3.5 text-[#9c3636]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span className="text-[11px] font-bold text-[#9c3636] uppercase tracking-wider">Declare Bankruptcy</span>
      </button>
    </div>
  );

  return (
    <>
      {/* ── DESKTOP SIDEBAR (lg:flex) ── */}
      <aside className="hidden lg:flex w-[380px] shrink-0 h-full flex-col relative rounded-[12px] border-[3px] border-[#362719] overflow-hidden shadow-2xl bg-[#e3d8c4]" data-purpose="right-sidebar">
      
      {/* Top Header */}
      <div className="bg-[#362719] px-5 py-4 flex items-center justify-between shrink-0">
        <h1 className="text-[17px] font-black tracking-widest text-[#dfd5c5] uppercase font-serif drop-shadow-sm hidden sm:block">Fog of War</h1>
        <div className="flex items-center gap-2 ml-auto">
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
          <section className="flex flex-col min-h-0 shrink-0 max-h-[190px]">
            <div className="flex items-center justify-between pb-1.5 px-1 shrink-0">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[#4a4a4a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                <h2 className="text-xs font-extrabold tracking-widest text-[#4a4a4a] uppercase">Players</h2>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#d4e4cd] text-[#33684a] border border-[#a4c7af] uppercase tracking-wider">
                {activeCount} ACTIVE
              </span>
            </div>
            <div className="overflow-y-auto custom-scrollbar min-h-0 pr-1 pb-1 space-y-1.5">
              {renderPlayersList()}
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
            {renderBankVault()}
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
    </aside>

    {/* ── MOBILE BOTTOM NAVIGATION BAR (lg:hidden) ── */}
    <nav className="flex lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#2a1c12]/95 backdrop-blur-md border-t-2 border-[#54402a] text-[#dfd5c5] px-3 py-2 items-center justify-between shadow-[0_-10px_25px_rgba(0,0,0,0.6)]">
      {/* Player Quick Info */}
      <div className="flex items-center gap-2.5 min-w-0 pr-2">
        <div 
          className="w-9 h-9 rounded-lg border border-[#54402a] shadow-inner flex items-center justify-center shrink-0"
          style={{ backgroundColor: getAvatarColor(me?.avatar ?? null) }}
        >
          {getAvatarImage(me?.avatar ?? null)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-[#f5ebd9] truncate max-w-[80px]">{me?.name || "You"}</span>
            {isMyTurn && (
              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase animate-pulse">
                TURN
              </span>
            )}
          </div>
          <div className="text-xs font-mono font-bold text-emerald-400">
            ${me?.cash?.toLocaleString() ?? 0}
          </div>
        </div>
      </div>

      {/* Mobile Action Buttons with generous 48px touch targets */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => setIsMobilePlayersOpen(true)}
          className="h-11 px-3 rounded-lg bg-[#3d2919] hover:bg-[#4f3621] active:scale-95 border border-[#6b4b2e] flex items-center gap-1.5 text-xs font-bold text-[#e6d8c3] transition-all shadow-sm"
          title="View Players"
        >
          <svg className="w-4 h-4 text-[#cca97f]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <span>{activeCount}</span>
        </button>

        <button
          onClick={() => setIsMobileBankOpen(true)}
          className="h-11 px-3 rounded-lg bg-[#3d2919] hover:bg-[#4f3621] active:scale-95 border border-[#6b4b2e] flex items-center gap-1.5 text-[11px] font-bold text-[#e6d8c3] transition-all shadow-sm"
          title="Bank & Trade"
        >
          <svg className="w-4 h-4 text-[#cca97f]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="14" x="3" y="5" rx="2"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <span className="whitespace-nowrap">Bank/Trade</span>
        </button>

        <button
          onClick={() => setIsMobileLogOpen(true)}
          className="h-11 px-3 rounded-lg bg-[#3d2919] hover:bg-[#4f3621] active:scale-95 border border-[#6b4b2e] flex items-center gap-1.5 text-xs font-bold text-[#e6d8c3] transition-all shadow-sm"
          title="Game Log"
        >
          <svg className="w-4 h-4 text-[#cca97f]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          <span>Log</span>
        </button>
      </div>
    </nav>

    {/* ── MOBILE PLAYERS DRAWER ── */}
    {isMobilePlayersOpen && (
      <div className="lg:hidden fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex flex-col justify-end">
        <div className="w-full max-h-[85vh] bg-[#e3d8c4] rounded-t-2xl border-t-4 border-[#362719] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
          <div className="bg-[#362719] text-[#e3d8c4] px-5 py-3.5 flex items-center justify-between border-b-2 border-[#20160d]">
            <div className="flex items-center gap-2">
              <span className="text-lg">👥</span>
              <h3 className="text-sm font-black uppercase tracking-widest font-serif">Active Players ({activeCount})</h3>
            </div>
            <button
              onClick={() => setIsMobilePlayersOpen(false)}
              className="w-8 h-8 rounded-full bg-[#4a3420] hover:bg-[#5e4229] text-stone-300 flex items-center justify-center text-sm font-bold"
            >
              ✕
            </button>
          </div>
          <div className="p-4 overflow-y-auto max-h-[70vh]">
            {renderPlayersList()}
          </div>
        </div>
      </div>
    )}

    {/* ── MOBILE BANK & ACTIONS DRAWER ── */}
    {isMobileBankOpen && (
      <div className="lg:hidden fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex flex-col justify-end">
        <div className="w-full max-h-[85vh] bg-[#e3d8c4] rounded-t-2xl border-t-4 border-[#362719] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
          <div className="bg-[#362719] text-[#e3d8c4] px-5 py-3.5 flex items-center justify-between border-b-2 border-[#20160d]">
            <div className="flex items-center gap-2">
              <span className="text-lg">🏦</span>
              <h3 className="text-sm font-black uppercase tracking-widest font-serif">Bank Vault &amp; Actions</h3>
            </div>
            <button
              onClick={() => setIsMobileBankOpen(false)}
              className="w-8 h-8 rounded-full bg-[#4a3420] hover:bg-[#5e4229] text-stone-300 flex items-center justify-center text-sm font-bold"
            >
              ✕
            </button>
          </div>
          <div className="p-5 overflow-y-auto max-h-[70vh]">
            {renderBankVault()}
          </div>
        </div>
      </div>
    )}

    {/* ── MOBILE GAME LOG DRAWER ── */}
    {isMobileLogOpen && (
      <div className="lg:hidden fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex flex-col justify-end">
        <div className="w-full h-[80vh] bg-[#e3d8c4] rounded-t-2xl border-t-4 border-[#362719] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
          <div className="bg-[#362719] text-[#e3d8c4] px-5 py-3.5 flex items-center justify-between border-b-2 border-[#20160d]">
            <div className="flex items-center gap-2">
              <span className="text-lg">📜</span>
              <h3 className="text-sm font-black uppercase tracking-widest font-serif">Game Log</h3>
            </div>
            <button
              onClick={() => setIsMobileLogOpen(false)}
              className="w-8 h-8 rounded-full bg-[#4a3420] hover:bg-[#5e4229] text-stone-300 flex items-center justify-center text-sm font-bold"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 p-4 overflow-y-auto bg-[#dcd0b1] font-mono text-xs text-[#333]">
            <EventLog />
          </div>
        </div>
      </div>
    )}

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
      {tradePartnerId && (
        <TradeNegotiationModal
          partnerId={tradePartnerId}
          onClose={() => setTradePartnerId(null)}
        />
      )}

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
    </>
  );
}
