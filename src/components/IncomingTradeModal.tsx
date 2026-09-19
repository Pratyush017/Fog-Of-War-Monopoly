"use client";

import { useState } from "react";
import { useGameStore, TradeProperty } from "@/store/game-store";
import { useGameSounds } from "@/hooks/useGameSounds";
import { registerOptimisticAction } from "@/lib/game-engine";

export default function IncomingTradeModal() {
  const { incomingTradeOffer, setIncomingTradeOffer, match, myPlayerId, players } = useGameStore();
  const { playPurchase } = useGameSounds();
  const [loading, setLoading] = useState<"accept" | "decline" | null>(null);

  if (!incomingTradeOffer || !match || incomingTradeOffer.targetPlayerId !== myPlayerId) {
    return null;
  }

  const offeringPlayer = players.find((p) => p.id === incomingTradeOffer.offeringPlayerId);

  const handleRespond = async (accepted: boolean) => {
    setLoading(accepted ? "accept" : "decline");
    
    const store = useGameStore.getState();
    const prevOffer = incomingTradeOffer;
    
    const myPlayer = store.players.find(p => p.id === myPlayerId);
    const offeringPlayerState = store.players.find(p => p.id === incomingTradeOffer.offeringPlayerId);
    
    const prevMyCash = myPlayer?.cash || 0;
    const prevOfferingCash = offeringPlayerState?.cash || 0;
    
    const offeredTileIds = incomingTradeOffer.offeredProperties.map((p: TradeProperty) => p.tileId);
    const requestedTileIds = incomingTradeOffer.requestedProperties.map((p: TradeProperty) => p.tileId);
    
    const prevTiles = store.tiles.filter(t => offeredTileIds.includes(t.id) || requestedTileIds.includes(t.id)).map(t => ({ ...t }));

    // Optimistic Update
    setIncomingTradeOffer(null);
    if (accepted && myPlayer && offeringPlayerState) {
      const myInDebt = (myPlayer.debtAmount ?? 0) > 0;
      const offeringInDebt = (offeringPlayerState.debtAmount ?? 0) > 0;
      
      if (!myInDebt) {
        store.updatePlayer(myPlayerId, { cash: prevMyCash + incomingTradeOffer.offeredCash - incomingTradeOffer.requestedCash });
      }
      if (!offeringInDebt) {
        store.updatePlayer(incomingTradeOffer.offeringPlayerId, { cash: prevOfferingCash + incomingTradeOffer.requestedCash - incomingTradeOffer.offeredCash });
      }
      
      offeredTileIds.forEach(id => {
        const t = store.tiles.find(tile => tile.id === id);
        if (t) store.updateTile(t.boardIndex, { ownerId: myPlayerId });
      });
      requestedTileIds.forEach(id => {
        const t = store.tiles.find(tile => tile.id === id);
        if (t) store.updateTile(t.boardIndex, { ownerId: incomingTradeOffer.offeringPlayerId });
      });
    }

    const actionId = registerOptimisticAction("trade-respond");
    (window as any)._lastAction = { start: performance.now(), local: performance.now() };

    try {
      const res = await fetch("/api/game/trade/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: match.id,
          tradeId: incomingTradeOffer.tradeId,
          accepted,
          actionId,
          offeringPlayerId: incomingTradeOffer.offeringPlayerId,
          targetPlayerId: incomingTradeOffer.targetPlayerId,
          offeredCash: incomingTradeOffer.offeredCash,
          requestedCash: incomingTradeOffer.requestedCash,
          offeredPropertyTileIds: offeredTileIds,
          requestedPropertyTileIds: requestedTileIds,
        }),
      });

      const data = await res.json();
      
      (window as any)._lastAction.netEnd = performance.now();
      const a = (window as any)._lastAction;
if (process.env.NODE_ENV !== 'production') {
      console.log(`[TIMELINE: TRADE RESPOND] Click -> Local: ${(a.local - a.start).toFixed(2)}ms | Click -> NetEnd: ${(a.netEnd - a.start).toFixed(2)}ms`);
    }

      if (accepted) {
        if (!res.ok) {
          // Rollback
          setIncomingTradeOffer(prevOffer);
          const myInDebt = (myPlayer?.debtAmount ?? 0) > 0;
          const offeringInDebt = (offeringPlayerState?.debtAmount ?? 0) > 0;
          if (!myInDebt) store.updatePlayer(myPlayerId, { cash: prevMyCash });
          if (!offeringInDebt) store.updatePlayer(incomingTradeOffer.offeringPlayerId, { cash: prevOfferingCash });
          prevTiles.forEach(t => store.updateTile(t.boardIndex, { ownerId: t.ownerId }));
          alert(data.error || "Failed to accept trade");
        } else {
          playPurchase();
        }
      }
    } catch (error) {
      console.error("Trade response error:", error);
      if (accepted) {
        // Rollback
        setIncomingTradeOffer(prevOffer);
        const myInDebt = (myPlayer?.debtAmount ?? 0) > 0;
        const offeringInDebt = (offeringPlayerState?.debtAmount ?? 0) > 0;
        if (!myInDebt) store.updatePlayer(myPlayerId, { cash: prevMyCash });
        if (!offeringInDebt) store.updatePlayer(incomingTradeOffer.offeringPlayerId, { cash: prevOfferingCash });
        prevTiles.forEach(t => store.updateTile(t.boardIndex, { ownerId: t.ownerId }));
        alert("Network error: Failed to accept trade");
      }
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[210] bg-black/80 backdrop-blur-md flex items-center justify-center p-0 md:p-4">
      <div className="w-full h-full md:h-auto md:max-w-xl bg-[#e3d8c4] border-0 md:border-4 border-[#362719] rounded-none md:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[100dvh] md:max-h-[90vh] animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="bg-[#362719] text-[#e3d8c4] px-4 md:px-6 py-3.5 md:py-4 flex items-center justify-between border-b-2 border-[#20160d] shrink-0">
          <div className="flex items-center gap-2.5 md:gap-3 min-w-0">
            <span className="text-xl md:text-2xl animate-bounce shrink-0">🤝</span>
            <div className="min-w-0">
              <h2 className="text-sm md:text-base font-black tracking-widest uppercase font-serif truncate">
                Incoming Trade Offer
              </h2>
              <p className="text-[10px] md:text-[11px] text-[#b8a992] truncate">
                {incomingTradeOffer.offeringPlayerName} wants to make a deal with you!
              </p>
            </div>
          </div>
          <span className="text-[9px] md:text-[10px] font-bold px-2 py-0.5 rounded bg-amber-800 text-amber-100 uppercase tracking-wider shrink-0">
            PROPOSAL
          </span>
        </div>

        {/* Trade Comparison Cards */}
        <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto bg-[#efe7d8]">
          
          {/* Card 1: What You Will RECEIVE (Green) */}
          <div className="p-4 rounded-xl bg-[#d5ecd3] border-2 border-[#93c78f] shadow-sm space-y-2">
            <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-[#1e5225]">
              <span className="flex items-center gap-1.5">
                <span>📥</span>
                <span>You Will Receive</span>
              </span>
              <span className="font-mono text-sm font-black text-[#1e5225]">
                +${incomingTradeOffer.offeredCash.toLocaleString()} Cash
              </span>
            </div>

            <div className="pt-2 border-t border-[#93c78f]/60 space-y-1.5">
              <div className="text-[10px] font-bold text-[#35633b] uppercase">Properties:</div>
              {incomingTradeOffer.offeredProperties.length === 0 ? (
                <div className="text-xs text-[#527e58] italic">No properties included.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {incomingTradeOffer.offeredProperties.map((prop: TradeProperty) => (
                    <div
                      key={prop.tileId}
                      className="p-2 rounded-lg bg-white/70 border border-[#93c78f] flex items-center justify-between text-xs shadow-sm"
                    >
                      <span className="font-bold text-[#1b4321] font-serif">{prop.name}</span>
                      <span className="font-mono text-[11px] font-bold text-[#2e6836]">${prop.price}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Card 2: What You Will GIVE (Amber/Red) */}
          <div className="p-4 rounded-xl bg-[#edd8d5] border-2 border-[#caa4a0] shadow-sm space-y-2">
            <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-[#6e2722]">
              <span className="flex items-center gap-1.5">
                <span>📤</span>
                <span>You Will Give</span>
              </span>
              <span className="font-mono text-sm font-black text-[#6e2722]">
                -${incomingTradeOffer.requestedCash.toLocaleString()} Cash
              </span>
            </div>

            <div className="pt-2 border-t border-[#caa4a0]/60 space-y-1.5">
              <div className="text-[10px] font-bold text-[#793c37] uppercase">Properties:</div>
              {incomingTradeOffer.requestedProperties.length === 0 ? (
                <div className="text-xs text-[#8c524d] italic">No properties requested.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {incomingTradeOffer.requestedProperties.map((prop: TradeProperty) => (
                    <div
                      key={prop.tileId}
                      className="p-2 rounded-lg bg-white/70 border border-[#caa4a0] flex items-center justify-between text-xs shadow-sm"
                    >
                      <span className="font-bold text-[#571e1a] font-serif">{prop.name}</span>
                      <span className="font-mono text-[11px] font-bold text-[#6e2722]">${prop.price}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 bg-[#362719] border-t-2 border-[#20160d] flex items-center justify-between gap-3 shrink-0">
          <button
            onClick={() => handleRespond(false)}
            disabled={loading !== null}
            className="px-5 py-3.5 rounded-xl bg-red-900/80 hover:bg-red-800 active:scale-95 border border-red-700 text-red-100 font-bold text-xs uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 min-h-[48px]"
          >
            <span>✕</span>
            <span>{loading === "decline" ? "Declining..." : "Decline Deal"}</span>
          </button>

          <button
            onClick={() => handleRespond(true)}
            disabled={loading !== null}
            className="flex-1 py-3.5 px-6 rounded-xl bg-[#2e6836] hover:bg-[#23532a] active:scale-[0.98] text-white font-black text-xs sm:text-sm uppercase tracking-widest shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 min-h-[48px]"
          >
            {loading === "accept" ? (
              "Accepting Deal..."
            ) : (
              <>
                <span>Accept Trade Deal</span>
                <span className="text-lg">✓</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
