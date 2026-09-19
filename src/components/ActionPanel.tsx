"use client";

import { useState, useEffect, useCallback } from "react";
import { useGameStore } from "@/store/game-store";
import { useGameSounds } from "@/hooks/useGameSounds";
import { getPurchasePrice, registerOptimisticAction } from "@/lib/game-engine";

export default function ActionPanel() {
  const { match, players, myPlayerId, pendingAction, setPendingAction, auction, setAuction, resetAuction } = useGameStore();
  const myPlayer = players.find((p) => p.id === myPlayerId);
  const { playPurchase, playBoughtAllSets } = useGameSounds();
  const [loading, setLoading] = useState(false);

  const isMyTurn = match?.currentTurnId === myPlayerId;

  // Auction countdown timer
  useEffect(() => {
    if (!auction.active) return;

    const interval = setInterval(() => {
      const store = useGameStore.getState();
      const currentTimer = store.auction.timeLeft;
      
      if (currentTimer <= 1) {
        clearInterval(interval);
        // We use store state directly here to avoid stale closures if handleAuctionEnd is recreated
        const currentAuction = store.auction;
        const currentMatch = store.match;
        
        if (!currentAuction.currentBidderId || !currentMatch) {
          store.resetAuction();
          return;
        }

        // Winner buys the tile
        fetch("/api/game/buy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            matchId: currentMatch.id,
            playerId: currentAuction.currentBidderId,
            tileIndex: currentAuction.boardIndex,
            price: currentAuction.currentBid,
          }),
        }).catch(err => console.error("Auction finalize failed:", err));
        
        store.resetAuction();
      } else {
        store.setAuction({ timeLeft: currentTimer - 1 });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [auction.active]);

  const handleBuy = useCallback(async () => {
    if (!match || !myPlayerId || !pendingAction || pendingAction.type !== "buy-prompt") return;
    
    const actionId = registerOptimisticAction("buy");
    const start = performance.now();
    if (process.env.NODE_ENV !== 'production') {
      (window as any)._lastAction = { type: 'buy', start, actionId };
    }
    
    const store = useGameStore.getState();
    const myPlayer = store.players.find(p => p.id === myPlayerId);
    const tile = store.tiles.find(t => t.boardIndex === pendingAction.boardIndex);
    
    if (!myPlayer || !tile || !tile.property) return;
    const propertyPrice = getPurchasePrice(tile, tile.property);
    if (myPlayer.cash < propertyPrice) {
      alert("Not enough cash!");
      return;
    }

    // Check if completing set
    let completedSet = false;
    const colorSet = tile.property.colorSet;
    if (colorSet) {
      const allInSet = store.tiles.filter(t => t.property?.colorSet === colorSet);
      const ownedCount = allInSet.filter(t => t.ownerId === myPlayerId).length + 1; // +1 for this new one
      completedSet = (ownedCount === allInSet.length) && (allInSet.length > 0);
    }

    if (completedSet && colorSet) {
      playBoughtAllSets();
      store.setCompletedSetHighlight({ colorSet, color: myPlayer.color, timestamp: Date.now() });
    } else {
      playPurchase();
    }

    // Save previous state for rollback
    const prevCash = myPlayer.cash;
    const prevOwnerId = tile.ownerId;
    const prevIsRevealed = tile.isRevealed;

    // Apply optimistic updates instantly
    store.updatePlayer(myPlayerId, { cash: prevCash - propertyPrice });
    store.updateTile(pendingAction.boardIndex, { ownerId: myPlayerId, isRevealed: true });
    setPendingAction(null);
    setLoading(true);
    
    (window as any)._lastAction.local = performance.now();

    try {
      const res = await fetch("/api/game/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: match.id,
          playerId: myPlayerId,
          tileIndex: pendingAction.boardIndex,
          actionId,
        }),
      });

      const data = await res.json();
      
      (window as any)._lastAction.netEnd = performance.now();
      const a = (window as any)._lastAction;
if (process.env.NODE_ENV !== 'production') {
      console.log(`[TIMELINE: BUY] Click -> Local: ${(a.local - a.start).toFixed(2)}ms | Click -> NetEnd: ${(a.netEnd - a.start).toFixed(2)}ms`);
    }
      
      if (!res.ok) {
        // Rollback
        store.updatePlayer(myPlayerId, { cash: prevCash });
        store.updateTile(pendingAction.boardIndex, { ownerId: prevOwnerId, isRevealed: prevIsRevealed });
        setPendingAction(pendingAction);
        alert(data.error || "Buy failed");
        setLoading(false);
        return;
      }
      
    } catch (error) {
      console.error("Buy failed:", error);
      // Rollback
      store.updatePlayer(myPlayerId, { cash: prevCash });
      store.updateTile(pendingAction.boardIndex, { ownerId: prevOwnerId, isRevealed: prevIsRevealed });
      setPendingAction(pendingAction);
      alert("Network error: Buy failed");
    } finally {
      setLoading(false);
    }
  }, [match, myPlayerId, pendingAction, setPendingAction, playPurchase]);

  const handlePass = useCallback(async () => {
    if (!match || !myPlayerId) return;
    setLoading(true);

    const prevAction = pendingAction;
    setPendingAction(null);

    // Optimistic Update
    if (match.passUpRule === "AUCTION" && prevAction) {
      setAuction({
        active: true,
        boardIndex: "boardIndex" in prevAction ? prevAction.boardIndex : 0,
        currentBid: 1,
        currentBidderId: null,
        currentBidderName: null,
        timeLeft: 15,
      });
    }

    const actionId = registerOptimisticAction("pass");
    (window as any)._lastAction = { start: performance.now(), local: performance.now() };

    try {
      const res = await fetch("/api/game/pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: match.id, playerId: myPlayerId, actionId }),
      });

      const data = await res.json();
      
      (window as any)._lastAction.netEnd = performance.now();
      const a = (window as any)._lastAction;
if (process.env.NODE_ENV !== 'production') {
      console.log(`[TIMELINE: PASS] Click -> Local: ${(a.local - a.start).toFixed(2)}ms | Click -> NetEnd: ${(a.netEnd - a.start).toFixed(2)}ms`);
    }

      if (!res.ok) {
        // Rollback
        setPendingAction(prevAction);
        if (match.passUpRule === "AUCTION") {
          setAuction({ active: false, boardIndex: 0, currentBid: 0, currentBidderId: null, currentBidderName: null, timeLeft: 0 });
        }
        alert(data.error || "Pass action failed");
      }
    } catch (error) {
      console.error("Pass failed:", error);
      // Rollback
      setPendingAction(prevAction);
      if (match.passUpRule === "AUCTION") {
        setAuction({ active: false, boardIndex: 0, currentBid: 0, currentBidderId: null, currentBidderName: null, timeLeft: 0 });
      }
      alert("Network error: Pass failed");
    } finally {
      setLoading(false);
    }
  }, [match, myPlayerId, pendingAction, setPendingAction, setAuction]);

  const handleJailAction = useCallback(async (action: "bail" | "wait") => {
    if (!match || !myPlayerId) return;
    
    const store = useGameStore.getState();
    const player = store.players.find((p) => p.id === myPlayerId);
    if (!player) return;

    if (action === "bail" || action === "wait") {
      playPurchase();
    }
    setLoading(true);

    const prevCash = player.cash;
    const prevInJail = player.inJail;
    const prevJailTurns = player.jailTurns;

    const fee = action === "bail" ? 75 : (prevCash >= 200 ? 50 : 0);

    // Optimistic Update
    if (action === "bail") {
      store.updatePlayer(myPlayerId, { cash: prevCash - 75, inJail: false, jailTurns: 0 });
    } else {
      store.updatePlayer(myPlayerId, { cash: prevCash - fee });
      // We don't optimistically assume freedom after 3 turns because it's complex logic
    }
    
    const actionId = registerOptimisticAction("jail");
    (window as any)._lastAction = { start: performance.now() };
    (window as any)._lastAction.local = performance.now();

    try {
      const res = await fetch("/api/game/jail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: match.id, playerId: myPlayerId, action, actionId }),
      });
      const data = await res.json();
      
      (window as any)._lastAction.netEnd = performance.now();
      const a = (window as any)._lastAction;
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[TIMELINE: JAIL] Click -> Local: ${(a.local - a.start).toFixed(2)}ms | Click -> NetEnd: ${(a.netEnd - a.start).toFixed(2)}ms`);
      }

      if (!res.ok) {
        // Rollback
        store.updatePlayer(myPlayerId, { cash: prevCash, inJail: prevInJail, jailTurns: prevJailTurns });
        alert(data.error || "Jail action failed");
      }
    } catch (error) {
      console.error("Jail action failed:", error);
      // Rollback
      store.updatePlayer(myPlayerId, { cash: prevCash, inJail: prevInJail, jailTurns: prevJailTurns });
      alert("Network error: Jail action failed");
    } finally {
      setPendingAction(null);
      setLoading(false);
    }
  }, [match, myPlayerId, setPendingAction, playPurchase]);

  const handleQuickBid = useCallback(async (increment: number) => {
    if (!match || !myPlayerId) return;
    const targetBid = auction.currentBid + increment;

    try {
      // Optimistically update the UI to ensure high responsiveness
      setAuction({
        currentBid: targetBid,
        currentBidderId: myPlayerId,
        currentBidderName: "You",
        timeLeft: 15, // Reset timer
      });

      await fetch("/api/game/auction-bid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: match.id,
          playerId: myPlayerId,
          amount: targetBid,
        }),
      });
    } catch (error) {
      console.error("Bid failed:", error);
    }
  }, [match, myPlayerId, auction.currentBid, setAuction]);

  const handleAuctionEnd = useCallback(async () => {
    if (!auction.currentBidderId || !match) {
      resetAuction();
      return;
    }

    // Winner buys the tile
    try {
      await fetch("/api/game/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: match.id,
          playerId: auction.currentBidderId,
          tileIndex: auction.boardIndex,
        }),
      });
    } catch (error) {
      console.error("Auction finalize failed:", error);
    }
    resetAuction();
  }, [auction, match, resetAuction]);

  // ── Auto-Pass Countdown ──
  const [promptTimeLeft, setPromptTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (pendingAction?.type === "buy-prompt" && isMyTurn && match?.turnEndsAt) {
      const turnEndsAtTime = new Date(match.turnEndsAt).getTime();
      const diffSec = Math.floor((turnEndsAtTime - Date.now()) / 1000);
      
      if (diffSec <= 10 && diffSec > 0) {
        setPromptTimeLeft(diffSec);
      } else if (diffSec <= 0) {
        handlePass();
      } else {
        setPromptTimeLeft(null);
      }
    } else {
      setPromptTimeLeft(null);
    }
  }, [pendingAction, isMyTurn, match?.turnEndsAt, handlePass]);

  useEffect(() => {
    if (promptTimeLeft === null) return;
    if (promptTimeLeft <= 0) {
      handlePass();
      return;
    }
    const timer = setTimeout(() => {
      setPromptTimeLeft(promptTimeLeft - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [promptTimeLeft, handlePass]);

  // ── Buy/Pass Prompt ──
  if (pendingAction?.type === "buy-prompt" && isMyTurn) {
    const tile = useGameStore.getState().tiles.find(t => t.boardIndex === pendingAction.boardIndex);
    const propertyPrice = tile && tile.property ? getPurchasePrice(tile, tile.property) : 200;
    const isBlind = !tile?.isRevealed;
    
    return (
      <div className="deckled-edges parchment-card shadow-2xl rounded-sm p-4 w-full max-w-xs border border-[#d4ba96] text-[#4a3420] animate-in">
        <h3 className="text-sm font-bold text-center mb-2 uppercase tracking-widest font-serif border-b border-[#cca97f]/40 pb-2">
          {isBlind ? "Hidden Property" : "Property Available"}
        </h3>
        <p className="text-xs text-[#58412b] text-center mb-4">
          {isBlind ? "Buy this property sight unseen for" : `Buy ${tile?.property?.name} for`} <span className="text-[#3a7c36] font-mono font-bold px-1 bg-[#d3ebd2]/50 rounded">${propertyPrice}</span>?
        </p>
        {promptTimeLeft !== null && (
          <p className="text-[10px] text-red-600 font-bold text-center mb-3 animate-pulse uppercase tracking-wider">
            Auto-passing in {promptTimeLeft}s
          </p>
        )}
        <div className="flex gap-2">
          <button
            onClick={handleBuy}
            disabled={loading || !myPlayer || myPlayer.cash < propertyPrice}
            className={`flex-1 text-[11px] font-bold uppercase tracking-wider py-2 rounded border shadow-sm transition-colors ${
              (!myPlayer || myPlayer.cash < propertyPrice) 
                ? "bg-gray-200 text-gray-500 border-gray-300 cursor-not-allowed"
                : "bg-[#e6f4e6] hover:bg-[#d0ebd0] text-[#1f4a1c] border-[#a3c9a0]"
            }`}
          >
            {loading ? "..." : `Buy $${propertyPrice}`}
          </button>
          <button
            onClick={handlePass}
            disabled={loading}
            className="flex-1 text-[11px] font-bold uppercase tracking-wider py-2 rounded bg-[#f4e6e6] hover:bg-[#ebd0d0] text-[#4a1c1c] border border-[#c9a0a0] shadow-sm transition-colors"
          >
            {loading ? "..." : (match.passUpRule === "AUCTION" ? "Auction" : "Pass")}
          </button>
        </div>
      </div>
    );
  }

  // ── Jail Choice ──
  if (pendingAction?.type === "jail-choice" && isMyTurn) {
    const isLowBalance = (myPlayer?.cash ?? 0) < 200;
    const turnsServed = myPlayer?.jailTurns ?? 0;

    return (
      <div className="deckled-edges parchment-card shadow-2xl rounded-sm p-4 w-full max-w-xs border border-[#d4ba96] text-[#4a3420] animate-in">
        <h3 className="text-sm font-bold text-center mb-1 uppercase tracking-widest font-serif border-b border-[#cca97f]/40 pb-2 text-red-900">
          You're in Jail
        </h3>
        <p className="text-[11px] text-center text-[#58412b] mb-3">
          {isLowBalance ? (
            <span className="text-emerald-700 font-semibold block">
              Balance under $200: Maintenance fee waived ($0)! Roll for free (Turn {turnsServed + 1}/3).
            </span>
          ) : (
            <span>
              Turn {turnsServed + 1}/3 in Jail. Pay $50 maintenance or pay $75 bail to roll immediately.
            </span>
          )}
        </p>
        <div className="flex flex-col gap-2">
          {isLowBalance ? (
            <button
              onClick={() => {
                setPendingAction(null);
                useGameStore.getState().setAutoRollRequested(true);
              }}
              disabled={loading}
              className="w-full text-[11px] font-bold uppercase tracking-wider py-2.5 rounded bg-emerald-800 hover:bg-emerald-700 text-white shadow-sm transition-colors flex items-center justify-center gap-1.5"
            >
              🎲 Roll for Doubles (Free)
            </button>
          ) : (
            <button
              onClick={() => handleJailAction("wait")}
              disabled={loading || (myPlayer?.cash ?? 0) < 50}
              className="w-full text-[11px] font-bold uppercase tracking-wider py-2.5 rounded bg-stone-200/80 hover:bg-stone-200 text-stone-800 border border-stone-300 shadow-sm transition-colors"
            >
              Pay $50 Maintenance
            </button>
          )}

          <button
            onClick={() => handleJailAction("bail")}
            disabled={loading || (myPlayer?.cash ?? 0) < 75}
            className={`w-full text-[11px] font-bold uppercase tracking-wider py-2.5 rounded border shadow-sm transition-colors ${
              (myPlayer?.cash ?? 0) >= 75
                ? "bg-[#f4e8d3] hover:bg-white text-[#3d2915] border-[#d6ba8e]"
                : "bg-gray-200 text-gray-400 border-gray-300 cursor-not-allowed"
            }`}
          >
            Pay $75 Bail &amp; Roll
          </button>
        </div>
      </div>
    );
  }

  return null;
}

export function AuctionOverlay() {
  const { auction, match, myPlayerId, setAuction } = useGameStore();

  const handleQuickBid = useCallback(async (increment: number) => {
    if (!match || !myPlayerId) return;
    const targetBid = auction.currentBid + increment;

    try {
      // Optimistically update the UI to ensure high responsiveness
      setAuction({
        currentBid: targetBid,
        currentBidderId: myPlayerId,
        currentBidderName: "You",
        timeLeft: 15, // Reset timer to 15s
      });

      await fetch("/api/game/auction-bid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: match.id,
          playerId: myPlayerId,
          amount: targetBid,
        }),
      });
    } catch (error) {
      console.error("Bid failed:", error);
    }
  }, [match, myPlayerId, auction.currentBid, setAuction]);

  if (!auction.active) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-md bg-black/40" style={{ pointerEvents: "auto" }}>
      <div className="deckled-edges parchment-card shadow-[0_0_50px_rgba(0,0,0,0.8)] rounded-sm p-6 w-full max-w-sm border-2 border-[#d4ba96] text-[#4a3420] animate-in zoom-in-95 pointer-events-auto">
        <h3 className="text-xl font-bold text-center mb-4 uppercase tracking-widest font-serif border-b border-[#cca97f]/40 pb-3">Live Auction</h3>

        {/* Timer bar */}
        <div className="w-full h-2 bg-[#e4ccaa] rounded-full mb-4 overflow-hidden shadow-inner border border-[#d4ba96]">
          <div
            className="h-full bg-gradient-to-r from-amber-600 to-red-600 transition-all duration-1000"
            style={{ width: `${(auction.timeLeft / 15) * 100}%` }}
          />
        </div>

        <div className="text-center mb-6">
          <p className="text-xs font-bold uppercase tracking-widest text-[#7a5937]">Current Bid</p>
          <p className="text-4xl font-mono font-black text-amber-900 drop-shadow-sm my-2">
            ${auction.currentBid}
          </p>
          {auction.currentBidderName ? (
            <p className="text-sm text-[#58412b] font-medium">
              by <span className="font-bold">{auction.currentBidderName}</span>
            </p>
          ) : (
            <p className="text-sm text-[#58412b] font-medium italic">
              No bids yet
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => handleQuickBid(2)}
            className="flex-1 btn-terracotta text-sm font-bold uppercase tracking-wider py-3 rounded transition-all active:scale-95 shadow-md"
          >
            +$2
          </button>
          <button
            onClick={() => handleQuickBid(10)}
            className="flex-1 btn-terracotta text-sm font-bold uppercase tracking-wider py-3 rounded transition-all active:scale-95 shadow-md"
          >
            +$10
          </button>
          <button
            onClick={() => handleQuickBid(50)}
            className="flex-1 btn-terracotta text-sm font-bold uppercase tracking-wider py-3 rounded transition-all active:scale-95 shadow-md"
          >
            +$50
          </button>
        </div>
      </div>
    </div>
  );
}
