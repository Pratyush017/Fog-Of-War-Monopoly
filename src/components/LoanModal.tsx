"use client";

import { useState } from "react";
import { useGameStore } from "@/store/game-store";
import { useGameSounds } from "@/hooks/useGameSounds";

interface LoanModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LoanModal({ isOpen, onClose }: LoanModalProps) {
  const { match, myPlayerId, players, tiles } = useGameStore();
  const { playPurchase } = useGameSounds();
  
  const me = players.find((p) => p.id === myPlayerId);
  const isMyTurn = match?.currentTurnId === myPlayerId;
  const isBankruptState = (me?.cash ?? 0) <= 0;

  const [loanTab, setLoanTab] = useState<"NORMAL" | "BANKRUPTCY">(
    isBankruptState ? "BANKRUPTCY" : "NORMAL"
  );
  const [selectedTier, setSelectedTier] = useState<number>(200);
  const [bankruptcyAmount, setBankruptcyAmount] = useState<number>(100);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !me || !match) return null;

  // Calculate propertyNetWorth (sum of buy prices of owned properties)
  const ownedTiles = tiles.filter((t) => t.ownerId === me.id && t.property);
  const propertyNetWorth = ownedTiles.reduce((sum, t) => sum + (t.property?.price || 0), 0);

  const tiers = [
    {
      principal: 200,
      interestRate: 0.50,
      interest: 100,
      totalRepay: 300,
      turns: 5,
      eligible: propertyNetWorth > 200,
    },
    {
      principal: 400,
      interestRate: 0.30,
      interest: 120,
      totalRepay: 520,
      turns: 8,
      eligible: propertyNetWorth > 400,
    },
    {
      principal: 600,
      interestRate: 0.25,
      interest: 150,
      totalRepay: 750,
      turns: 10,
      eligible: propertyNetWorth > 600,
    },
  ];

  const handleTakeLoan = async () => {
    if (!isMyTurn) {
      setErrorMessage("You can only take a loan during your active turn.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const payload: any = {
        matchId: match.id,
        playerId: me.id,
        loanType: loanTab,
      };

      if (loanTab === "NORMAL") {
        payload.tier = selectedTier;
      } else {
        payload.amount = bankruptcyAmount;
      }

      const res = await fetch("/api/game/loan/take", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || "Failed to take loan");
      } else {
        playPurchase();
        onClose();
      }
    } catch (err: any) {
      console.error("Take loan error:", err);
      setErrorMessage("Network error while applying for loan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[190] bg-black/70 backdrop-blur-sm flex items-center justify-center p-0 md:p-4">
      <div className="w-full h-full md:h-auto md:max-w-lg bg-[#e3d8c4] border-0 md:border-4 border-[#362719] rounded-none md:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[100dvh] md:max-h-[90vh] animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="bg-[#362719] text-[#e3d8c4] px-4 md:px-6 py-3.5 md:py-4 flex items-center justify-between border-b-2 border-[#20160d] shrink-0">
          <div className="flex items-center gap-2.5 md:gap-3 min-w-0">
            <span className="text-xl md:text-2xl shrink-0">🏦</span>
            <div className="min-w-0">
              <h2 className="text-sm md:text-base font-black tracking-widest uppercase font-serif truncate">
                Bank of Monopoly • Credit Vault
              </h2>
              <p className="text-[10px] md:text-[11px] text-[#b8a992] truncate">
                Borrow against your property portfolio with structured terms
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#4a3420] hover:bg-[#5e4229] text-stone-300 flex items-center justify-center text-sm font-bold transition-colors shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Player Status Overview */}
        <div className="px-6 py-3.5 bg-[#d6caa7] border-b border-[#cca97f]/70 flex items-center justify-between text-xs text-[#4a3420]">
          <div>
            <span className="font-medium text-[#6e543b]">Current Cash: </span>
            <strong className={`font-mono text-sm ${me.cash <= 0 ? "text-red-700" : "text-emerald-800"}`}>
              ${me.cash.toLocaleString()}
            </strong>
          </div>
          <div>
            <span className="font-medium text-[#6e543b]">Property Net Worth: </span>
            <strong className="font-mono text-sm text-[#3b2715]">
              ${propertyNetWorth.toLocaleString()}
            </strong>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#cca97f]/60 bg-[#cebfa8]">
          <button
            onClick={() => { setLoanTab("NORMAL"); setErrorMessage(null); }}
            className={`flex-1 py-3 text-xs font-black uppercase tracking-wider transition-colors border-r border-[#cca97f]/60 flex items-center justify-center gap-1.5 ${
              loanTab === "NORMAL"
                ? "bg-[#e3d8c4] text-[#2e1d0f] shadow-inner"
                : "text-[#6b5239] hover:bg-[#d8ccb6]"
            }`}
          >
            <span>📜 Normal Credit</span>
          </button>

          <button
            onClick={() => { setLoanTab("BANKRUPTCY"); setErrorMessage(null); }}
            className={`flex-1 py-3 text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 ${
              loanTab === "BANKRUPTCY"
                ? "bg-[#e3d8c4] text-[#8e291c] shadow-inner"
                : "text-[#8e291c]/70 hover:bg-[#d8ccb6]"
            }`}
          >
            <span>🚨 Bankruptcy Bailout</span>
            {isBankruptState && (
              <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
            )}
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 space-y-4">
          
          {/* TAB 1: NORMAL LOANS */}
          {loanTab === "NORMAL" && (
            <div className="space-y-3">
              <div className="text-xs text-[#5a4430] font-medium">
                Choose a loan tier. Requires your Property Net Worth to strictly exceed the principal amount:
              </div>

              <div className="space-y-2.5">
                {tiers.map((t) => {
                  const isSelected = selectedTier === t.principal;
                  return (
                    <div
                      key={t.principal}
                      onClick={() => { if (t.eligible) setSelectedTier(t.principal); }}
                      className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                        !t.eligible
                          ? "opacity-50 grayscale bg-[#dfd4be] border-[#c0b399] cursor-not-allowed"
                          : isSelected
                          ? "bg-[#efe6d5] border-[#362719] shadow-md scale-[1.01]"
                          : "bg-[#e9ded0] border-[#cca97f]/80 hover:border-[#8e6840]"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          isSelected ? "border-[#362719] bg-[#362719]" : "border-stone-500"
                        }`}>
                          {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                        <div>
                          <div className="text-base font-black font-mono text-[#2e1d0f]">
                            ${t.principal} Loan
                          </div>
                          <div className="text-[11px] text-[#6b5239] font-medium mt-0.5">
                            {(t.interestRate * 100).toFixed(0)}% Interest (+${t.interest}) • Due in {t.turns} turns
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs font-mono font-bold text-[#8e291c]">
                          Repay: ${t.totalRepay}
                        </div>
                        {!t.eligible && (
                          <div className="text-[10px] font-bold text-red-700 mt-0.5">
                            Requires Net Worth &gt; ${t.principal}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: BANKRUPTCY LOAN */}
          {loanTab === "BANKRUPTCY" && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-red-950/10 border border-red-800/30 text-xs text-red-950 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-red-900">
                  <span>⚠️</span>
                  <span>Emergency Bankruptcy Loan Terms</span>
                </div>
                <p className="text-[11px] leading-relaxed text-red-900/90">
                  • Available only when cash is $0 or negative.<br />
                  • Borrow up to your full Property Net Worth (${propertyNetWorth}).<br />
                  • Strict 20% interest, due in 10 personal turns.<br />
                  • If you default at deadline, you will be permanently eliminated!
                </p>
              </div>

              {!isBankruptState ? (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-600/30 text-xs text-amber-900 font-bold text-center">
                  You currently have positive cash (${me.cash}). Bankruptcy loans are reserved for players with $0 or negative cash.
                </div>
              ) : me.hasDefaulted ? (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-600/30 text-xs text-red-900 font-bold text-center">
                  You previously defaulted on a loan and are no longer eligible for bankruptcy credit.
                </div>
              ) : propertyNetWorth <= 0 ? (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-600/30 text-xs text-red-900 font-bold text-center">
                  You do not own any properties to secure this loan.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs font-bold text-[#4a3420]">
                    <span>Borrow Amount:</span>
                    <span className="font-mono text-base font-black text-[#2e1d0f]">
                      ${bankruptcyAmount}
                    </span>
                  </div>

                  <input
                    type="range"
                    min={10}
                    max={propertyNetWorth}
                    step={10}
                    value={bankruptcyAmount}
                    onChange={(e) => setBankruptcyAmount(Number(e.target.value))}
                    className="w-full h-2.5 bg-[#beae90] rounded-lg appearance-none cursor-pointer accent-[#8e291c]"
                  />

                  <div className="p-3 rounded-xl bg-[#dfd4be] border border-[#cca97f]/70 text-xs flex justify-between">
                    <div>
                      <span className="text-[#6b5239]">20% Interest: </span>
                      <strong className="font-mono text-[#8e291c]">
                        +${Math.ceil(bankruptcyAmount * 0.20)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[#6b5239]">Total Due (Turn +10): </span>
                      <strong className="font-mono text-[#2e1d0f]">
                        ${bankruptcyAmount + Math.ceil(bankruptcyAmount * 0.20)}
                      </strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-500/15 border border-red-600/40 text-xs text-red-900 font-bold animate-in">
              {errorMessage}
            </div>
          )}

          {/* Trade Lock Notice */}
          <div className="text-[10px] text-[#7a6552] flex items-center gap-1.5 bg-[#dfd4be]/60 p-2.5 rounded-lg border border-[#cca97f]/40">
            <span>🔒</span>
            <span>
              <strong>Trade Lock:</strong> While you have an active loan, you cannot trade properties with other players (cash trades only).
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 bg-[#362719] border-t-2 border-[#20160d] flex items-center justify-between gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-3 rounded-xl bg-[#4a3420] hover:bg-[#5e4229] active:scale-95 text-stone-300 font-bold text-xs uppercase tracking-wider transition-colors min-h-[48px]"
          >
            Cancel
          </button>

          <button
            onClick={handleTakeLoan}
            disabled={
              loading ||
              !isMyTurn ||
              (loanTab === "NORMAL" && !tiers.find((t) => t.principal === selectedTier)?.eligible) ||
              (loanTab === "BANKRUPTCY" && (!isBankruptState || me.hasDefaulted || propertyNetWorth <= 0))
            }
            className="flex-1 py-3.5 px-6 rounded-xl bg-[#33684a] hover:bg-[#254f38] active:scale-[0.98] text-white font-black text-xs sm:text-sm uppercase tracking-widest shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[48px]"
          >
            {loading ? "Processing..." : "Confirm & Take Loan"}
          </button>
        </div>

      </div>
    </div>
  );
}
