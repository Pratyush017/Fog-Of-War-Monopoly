"use client";

import { useState } from "react";
import { useGameStore } from "@/store/game-store";
import { useGameSounds } from "@/hooks/useGameSounds";

export default function LiquidationModal() {
  const { match, myPlayerId, players, tiles, addEvent } = useGameStore();
  const { playPurchase } = useGameSounds();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const me = players.find((p) => p.id === myPlayerId);
  const isLiquidating = me?.isLiquidating || false;

  if (!isLiquidating || !match || !me) {
    return null;
  }

  const ownedTiles = tiles.filter((t) => t.ownerId === me.id && t.property);
  const totalHousesOwned = ownedTiles.reduce((sum, t) => sum + t.houses, 0);
  const totalDebt = me.loanPrincipal + me.loanInterest;
  const canSettle = me.cash >= totalDebt;
  const progressPercent = Math.min(100, Math.max(0, Math.round((me.cash / totalDebt) * 100)));

  const handleDegradeHouse = async (tileId: string) => {
    setLoadingAction(`degrade-${tileId}`);
    try {
      const res = await fetch("/api/game/loan/liquidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: match.id,
          playerId: me.id,
          action: "DEGRADE_HOUSE",
          tileId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to sell house");
      } else {
        playPurchase();
      }
    } catch (err) {
      console.error("Degrade house error:", err);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSurrenderProperty = async (tileId: string) => {
    if (totalHousesOwned > 0) {
      alert("You must sell all houses on your properties before surrendering any property to the bank!");
      return;
    }

    setLoadingAction(`surrender-${tileId}`);
    try {
      const res = await fetch("/api/game/loan/liquidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: match.id,
          playerId: me.id,
          action: "SURRENDER_PROPERTY",
          tileId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to surrender property");
      } else {
        playPurchase();
      }
    } catch (err) {
      console.error("Surrender property error:", err);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSettleDebt = async () => {
    setLoadingAction("settle");
    try {
      const res = await fetch("/api/game/loan/liquidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: match.id,
          playerId: me.id,
          action: "SETTLE_DEBT",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to settle debt");
      } else {
        playPurchase();
      }
    } catch (err) {
      console.error("Settle debt error:", err);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleDeclareDefault = async () => {
    if (
      !confirm(
        "Are you sure you want to declare total default? This will forfeit all assets and eliminate you from the game."
      )
    ) {
      return;
    }

    setLoadingAction("default");
    try {
      const res = await fetch("/api/game/loan/liquidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: match.id,
          playerId: me.id,
          action: "DECLARE_DEFAULT",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to declare default");
      }
    } catch (err) {
      console.error("Declare default error:", err);
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[#e3d8c4] border-4 border-[#8e291c] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="bg-[#8e291c] text-[#fbf6ee] px-6 py-4 flex items-center justify-between border-b-2 border-[#5e1a12]">
          <div className="flex items-center gap-3">
            <span className="text-2xl animate-pulse">⚠️</span>
            <div>
              <h2 className="text-lg font-black tracking-widest uppercase font-serif">
                Forced Debt Liquidation
              </h2>
              <p className="text-[11px] text-amber-200/90 font-medium">
                Loan maturity deadline passed. Your turn is locked until debt is repaid.
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-black/30 border border-white/20">
              {me.loanType || "LOAN"} DEBT
            </span>
          </div>
        </div>

        {/* Debt Status Card */}
        <div className="p-6 bg-[#d9cdb6] border-b border-[#cca97f]/60 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3.5 rounded-xl bg-[#cbbfa6] border border-[#b8ab90]">
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#58412b]">
                Total Outstanding Debt
              </div>
              <div className="text-2xl font-mono font-black text-[#8e291c] mt-1">
                ${totalDebt.toLocaleString()}
              </div>
              <div className="text-[10px] text-[#6e543b] mt-0.5 font-medium">
                Principal: ${me.loanPrincipal} + Interest: ${me.loanInterest}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#cbbfa6] border border-[#b8ab90]">
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#58412b]">
                Your Current Cash
              </div>
              <div className="text-2xl font-mono font-black text-[#2e5d32] mt-1">
                ${me.cash.toLocaleString()}
              </div>
              <div className="text-[10px] text-[#6e543b] mt-0.5 font-medium">
                {canSettle ? "✓ Ready to clear debt" : `Need $${Math.max(0, totalDebt - me.cash)} more`}
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] font-bold text-[#58412b]">
              <span>Debt Recovery Progress</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="w-full h-3 bg-[#beae90] rounded-full overflow-hidden shadow-inner border border-[#ab9b7e]">
              <div
                className={`h-full transition-all duration-500 ${
                  canSettle ? "bg-emerald-600" : "bg-gradient-to-r from-amber-600 to-[#8e291c]"
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Rules Reminder */}
          {totalHousesOwned > 0 && (
            <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-600/30 flex items-center gap-2.5 text-xs text-amber-950 font-bold">
              <span>⚠️</span>
              <span>
                You have {totalHousesOwned} active house(s)/hotel(s). You must sell all houses before surrendering properties.
              </span>
            </div>
          )}
        </div>

        {/* Properties List */}
        <div className="flex-1 p-6 overflow-y-auto space-y-3 min-h-[160px]">
          <div className="text-xs font-black uppercase tracking-wider text-[#4a3420]">
            Owned Properties ({ownedTiles.length})
          </div>

          {ownedTiles.length === 0 ? (
            <div className="text-center py-8 text-[#7a6552]">
              <p className="text-sm font-bold">No properties remaining to liquidate.</p>
              <p className="text-xs mt-1">
                If you cannot pay the remaining debt, you must declare default.
              </p>
            </div>
          ) : (
            ownedTiles.map((tile) => {
              const prop = tile.property;
              if (!prop) return null;
              const hasHouses = tile.houses > 0;

              return (
                <div
                  key={tile.id}
                  className="p-3.5 rounded-xl bg-[#efe7d8] border border-[#d4c3a5] flex items-center justify-between shadow-sm gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-10 rounded-[4px] shadow-sm border border-black/20 shrink-0"
                      style={{ backgroundColor: prop.colorSet ? undefined : "#78909C" }}
                    />
                    <div>
                      <div className="text-sm font-bold text-[#2e1d0f] font-serif">
                        {prop.name}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-[#6b5239] mt-0.5">
                        <span>Buy Price: <strong className="text-[#3b2715]">${prop.price}</strong></span>
                        <span>•</span>
                        <span>
                          {tile.houses === 0
                            ? "No Upgrades"
                            : tile.houses === 5
                            ? "1 Hotel"
                            : `${tile.houses} House(s)`}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Sell House button */}
                    {hasHouses && (
                      <button
                        onClick={() => handleDegradeHouse(tile.id)}
                        disabled={loadingAction !== null}
                        className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow transition-colors disabled:opacity-50"
                      >
                        {loadingAction === `degrade-${tile.id}` ? "..." : `Sell House (+$${prop.houseCost})`}
                      </button>
                    )}

                    {/* Surrender Property button */}
                    <button
                      onClick={() => handleSurrenderProperty(tile.id)}
                      disabled={loadingAction !== null || totalHousesOwned > 0}
                      title={totalHousesOwned > 0 ? "Must sell all houses first" : `Surrender to bank for $${prop.price}`}
                      className={`px-3 py-2 rounded-lg font-bold text-xs shadow transition-colors ${
                        totalHousesOwned > 0
                          ? "bg-stone-300 text-stone-500 border border-stone-400 cursor-not-allowed opacity-60"
                          : "bg-[#8e291c] hover:bg-[#6e1e14] text-white"
                      }`}
                    >
                      {loadingAction === `surrender-${tile.id}` ? "..." : `Surrender (+$${prop.price})`}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 bg-[#362719] border-t-2 border-[#20160d] flex items-center justify-between gap-4">
          <button
            onClick={handleDeclareDefault}
            disabled={loadingAction !== null}
            className="px-4 py-3 rounded-xl bg-red-950/80 hover:bg-red-900 border border-red-700 text-red-200 text-xs font-extrabold uppercase tracking-wider transition-colors disabled:opacity-50"
          >
            Declare Total Default
          </button>

          <button
            onClick={handleSettleDebt}
            disabled={!canSettle || loadingAction !== null}
            className={`flex-1 py-3.5 px-6 rounded-xl font-black text-sm uppercase tracking-widest shadow-lg transition-all flex items-center justify-center gap-2 ${
              canSettle
                ? "bg-emerald-600 hover:bg-emerald-500 text-white active:scale-[0.98] animate-pulse"
                : "bg-stone-700 text-stone-400 cursor-not-allowed opacity-60"
            }`}
          >
            {loadingAction === "settle" ? (
              "Settling Debt..."
            ) : (
              <>
                <span>Settle Debt &amp; Resume Game (${totalDebt})</span>
                <span className="text-lg">✓</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
