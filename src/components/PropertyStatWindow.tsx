"use client";

import { useGameStore } from "@/store/game-store";
import { useEffect, useRef, useState } from "react";
import { useGameSounds } from "@/hooks/useGameSounds";
import { 
  validateAndCalculateUpgrade, 
  validateAndCalculateDegrade, 
  validateAndCalculateMortgage, 
  validateAndCalculateUnmortgage, 
  validateAndCalculateSell,
  registerOptimisticAction
} from "@/lib/game-engine";

export default function PropertyStatWindow() {
  const { selectedTileIndex, setSelectedTileIndex, tiles, players, myPlayerId } = useGameStore();
  const windowRef = useRef<HTMLDivElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const { playUpgradeDegrade, playFullUpgrade } = useGameSounds();

  // Click outside to dismiss
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Don't close if they clicked a tile (tiles handle their own clicks to open this window)
      // We only close if they click completely outside the stat window and not on a tile
      if (
        selectedTileIndex !== null &&
        windowRef.current &&
        !windowRef.current.contains(event.target as Node)
      ) {
        // We add a specific class to tiles so we can ignore clicks on them here
        if (!(event.target as Element).closest(".monopoly-tile") && !(event.target as Element).closest(".tile-green") && !(event.target as Element).closest(".tile-parchment")) {
          setSelectedTileIndex(null);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [selectedTileIndex, setSelectedTileIndex]);

  // If no tile selected or invalid index, still render but keep it hidden for animation
  const tile = selectedTileIndex !== null ? tiles.find((t) => t.boardIndex === selectedTileIndex) : null;
  const isVisible = selectedTileIndex !== null && tile?.property;

  // Derive data
  const property = tile?.property;
  const owner = tile?.ownerId ? players.find((p) => p.id === tile.ownerId) : null;
  const isMe = owner?.id === myPlayerId;
  const isRevealed = tile?.isRevealed;

  // Calculate rent values based on standard Monopoly rules (base Rent array logic from DB or hardcoded multiples)
  const rentArray = property?.rent || [0, 0, 0, 0, 0, 0];
  const baseRent = rentArray[0] || 0;
  const rentWithSet = baseRent * 2;
  const rent1House = rentArray[1] || 0;
  const rent2Houses = rentArray[2] || 0;
  const rent3Houses = rentArray[3] || 0;
  const rent4Houses = rentArray[4] || 0;
  const rentHotel = rentArray[5] || 0;
  
  const houseCost = property?.houseCost || 0;
  const mortgageValue = property?.originalMortgage || 0;
  const price = property?.price || 0;

  // Emojis are built into the new names, e.g., "🇵🇪 Peru". We can extract it or just use the whole string
  const fullName = property?.name || "Unknown";
  
  const handleAction = async (action: string) => {
    if (!property || !tile || !myPlayerId) return;
    setIsProcessing(true);

    const store = useGameStore.getState();
    const player = store.players.find(p => p.id === myPlayerId);
    if (!player) return;

    const prevCash = player.cash;
    const prevHouses = tile.houses;
    const prevMortgaged = tile.isMortgaged;
    const prevOwnerId = tile.ownerId;
    
    let cashChange = 0;
    let newHouses = prevHouses;
    let newMortgaged = prevMortgaged;
    let newOwnerId = prevOwnerId;

    try {
      const match = store.match;
      const evenBuild = match ? match.evenBuild : true;

      switch (action) {
        case "UPGRADE":
          ({ cashChange, newHouses } = validateAndCalculateUpgrade(tile, property, store.tiles, evenBuild));
          break;
        case "DEGRADE":
          ({ cashChange, newHouses } = validateAndCalculateDegrade(tile, property, store.tiles, evenBuild));
          break;
        case "MORTGAGE":
          ({ cashChange, newIsMortgaged: newMortgaged } = validateAndCalculateMortgage(tile, property));
          break;
        case "UNMORTGAGE":
          ({ cashChange, newIsMortgaged: newMortgaged } = validateAndCalculateUnmortgage(tile, property));
          break;
        case "SELL":
          ({ cashChange, newOwnerId, newIsMortgaged: newMortgaged } = validateAndCalculateSell(tile, property));
          break;
      }
    } catch (e: any) {
      alert(e.message);
      setIsProcessing(false);
      return;
    }

    // Optimistic Update
    store.updatePlayer(myPlayerId, { cash: prevCash + cashChange });
    store.updateTile(tile.boardIndex, { houses: newHouses, isMortgaged: newMortgaged, ownerId: newOwnerId });

    const actionId = registerOptimisticAction("property-action");
    (window as any)._lastAction = { start: performance.now(), local: performance.now() };

    try {
      const res = await fetch("/api/game/property-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: tile.matchId,
          playerId: myPlayerId,
          tileId: tile.id,
          action,
          actionId,
        }),
      });
      const data = await res.json();
      
      (window as any)._lastAction.netEnd = performance.now();
      const a = (window as any)._lastAction;
      console.log(`[TIMELINE: PROPERTY ${action}] Click -> Local: ${(a.local - a.start).toFixed(2)}ms | Click -> NetEnd: ${(a.netEnd - a.start).toFixed(2)}ms`);

      if (!res.ok) {
        // Rollback
        store.updatePlayer(myPlayerId, { cash: prevCash });
        store.updateTile(tile.boardIndex, { houses: prevHouses, isMortgaged: prevMortgaged, ownerId: prevOwnerId });
        alert(data.error);
      }
    } catch (error) {
      console.error(error);
      // Rollback
      store.updatePlayer(myPlayerId, { cash: prevCash });
      store.updateTile(tile.boardIndex, { houses: prevHouses, isMortgaged: prevMortgaged, ownerId: prevOwnerId });
      alert("Failed to perform action");
    } finally {
      setIsProcessing(false);
    }
  };

  const isUtility = property?.isUtility;
  const isTransit = property?.isTransit;
  const isStandard = !isUtility && !isTransit;

  let ownsFullSet = false;
  if (isStandard && property?.colorSet && myPlayerId) {
    const setTiles = tiles.filter(t => t.property?.colorSet === property.colorSet);
    const ownedTiles = setTiles.filter(t => t.ownerId === myPlayerId);
    ownsFullSet = setTiles.length > 0 && setTiles.length === ownedTiles.length;
  }

  return (
    <div
      ref={windowRef}
      className={`absolute z-[100] transition-all duration-300 ease-out origin-center ${
        isVisible
          ? "opacity-100 scale-100 pointer-events-auto translate-y-0"
          : "opacity-0 scale-95 pointer-events-none translate-y-4"
      }`}
    >
      <div className="deckled-edges parchment-card shadow-2xl rounded-sm p-5 w-72 border border-[#d4ba96] text-[#4a3420]">
        {/* Header Row */}
        <div className="flex items-center justify-between pb-3 border-b border-[#cca97f]/40">
          <div className="flex items-center gap-2">
            {owner ? (
              <span
                className="w-3 h-3 rounded-full inline-block shadow-inner border border-black/20"
                style={{ backgroundColor: owner.color }}
              ></span>
            ) : (
              <span className="w-3 h-3 rounded-full bg-stone-400 inline-block border border-black/10"></span>
            )}
            <h2 className="text-[15px] font-bold text-[#3d2915] tracking-tight font-serif uppercase">
              {fullName}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setSelectedTileIndex(null)}
            className="w-6 h-6 rounded flex items-center justify-center text-[#8e6840] hover:text-black hover:bg-[#ebd5b3] transition-colors text-xs font-bold"
          >
            ✕
          </button>
        </div>

        {/* Ownership Badge */}
        <div className="mt-3.5 mb-4 text-center">
          {!isRevealed ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-[#e8d5b5]/50 border border-[#cba77d] text-[10px] font-bold tracking-widest uppercase shadow-inner">
              <span className="w-1.5 h-1.5 rounded-full bg-stone-500"></span>
              <span className="text-stone-700 font-mono">Unexplored</span>
            </div>
          ) : owner ? (
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-[10px] font-bold tracking-widest uppercase border shadow-inner"
              style={{
                backgroundColor: owner.color + "22",
                borderColor: owner.color + "44",
                color: owner.color,
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse shadow-sm"
                style={{ backgroundColor: owner.color }}
              ></span>
              <span className="font-mono">
                Owned by {isMe ? "You" : owner.name}
              </span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-[#e8d5b5]/50 border border-[#cba77d] text-[10px] font-bold tracking-widest uppercase shadow-inner">
              <span className="w-1.5 h-1.5 rounded-full bg-stone-400"></span>
              <span className="text-stone-600 font-mono">Unowned Sector</span>
            </div>
          )}
        </div>

        {/* Rent Table */}
        <div className="space-y-1.5 text-xs text-[#58412b]">
          {isStandard && (
            <>
              <div className="flex justify-between items-center py-0.5">
                <span className="font-semibold uppercase tracking-wider text-[10px]">Rent</span>
                <span className="font-mono font-bold">${baseRent}</span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="font-semibold uppercase tracking-wider text-[10px]">With Full Set</span>
                <span className="font-mono font-bold">${rentWithSet}</span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="font-semibold uppercase tracking-wider text-[10px]">1 Upgrade</span>
                <span className="font-mono font-bold">${rent1House}</span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="font-semibold uppercase tracking-wider text-[10px]">2 Upgrades</span>
                <span className="font-mono font-bold">${rent2Houses}</span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="font-semibold uppercase tracking-wider text-[10px]">3 Upgrades</span>
                <span className="font-mono font-bold">${rent3Houses}</span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="font-semibold uppercase tracking-wider text-[10px]">4 Upgrades</span>
                <span className="font-mono font-bold">${rent4Houses}</span>
              </div>
              <div className="flex justify-between items-center pt-2 pb-0.5 border-t border-[#cca97f]/40 mt-1">
                <span className="font-black uppercase tracking-wider text-[10px] text-[#8e291c]">Max Upgrade</span>
                <span className="font-mono font-black text-[#8e291c] text-[13px]">
                  ${rentHotel}
                </span>
              </div>
            </>
          )}
          {isUtility && (
            <>
              <div className="flex justify-between items-center py-0.5">
                <span className="font-semibold uppercase tracking-wider text-[10px]">Rent (1 owned)</span>
                <span className="font-mono font-bold">4x Dice</span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="font-semibold uppercase tracking-wider text-[10px]">Rent (2 owned)</span>
                <span className="font-mono font-bold">10x Dice</span>
              </div>
            </>
          )}
          {isTransit && (
            <>
              <div className="flex justify-between items-center py-0.5">
                <span className="font-semibold uppercase tracking-wider text-[10px]">Rent (1 owned)</span>
                <span className="font-mono font-bold">$25</span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="font-semibold uppercase tracking-wider text-[10px]">Rent (2 owned)</span>
                <span className="font-mono font-bold">$50</span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="font-semibold uppercase tracking-wider text-[10px]">Rent (3 owned)</span>
                <span className="font-mono font-bold">$100</span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="font-semibold uppercase tracking-wider text-[10px]">Rent (4 owned)</span>
                <span className="font-mono font-bold">$200</span>
              </div>
            </>
          )}
        </div>

        {/* Subtle Separator */}
        <div className="my-3 border-t border-[#cca97f]/40"></div>

        {/* Costs Section */}
        <div className="space-y-1.5 text-xs text-[#58412b]">
          <div className="flex justify-between items-center py-0.5">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Buy Price</span>
            <span className="font-mono font-bold text-amber-900">${price}</span>
          </div>
          {isStandard && (
            <div className="flex justify-between items-center py-0.5">
              <span className="font-semibold uppercase tracking-wider text-[10px]">Upgrade Cost</span>
              <span className="font-mono font-bold">
                ${houseCost} <span className="text-[9px] font-sans font-normal opacity-70">each</span>
              </span>
            </div>
          )}
          <div className="flex justify-between items-center py-0.5">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Mortgage Value</span>
            <span className="font-mono font-bold">${mortgageValue}</span>
          </div>
        </div>

        {/* Control Panel (Visible only if owned by me) */}
        {isMe && tile && (
          <div className="mt-4 pt-3 border-t border-[#cca97f]/40 flex justify-between items-center gap-1.5">
            {/* Upgrade */}
            <button
              onClick={() => {
                if (tile.houses === 4) {
                  playFullUpgrade();
                } else {
                  playUpgradeDegrade();
                }
                handleAction("UPGRADE");
              }}
              disabled={isProcessing || !isStandard || !ownsFullSet || tile.houses >= 5 || tile.isMortgaged || (players.find(p=>p.id===myPlayerId)?.cash || 0) < houseCost}
              className="flex-1 py-1.5 rounded bg-[#f4e8d3] hover:bg-white text-[#3d2915] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-[10px] font-bold uppercase tracking-wider flex items-center justify-center border border-[#d6ba8e] shadow-sm"
              title={!ownsFullSet ? "Must own full color set to upgrade" : "Upgrade (Buy House/Hotel)"}
            >
              UP
            </button>
            {/* Degrade */}
            <button
              onClick={() => {
                playUpgradeDegrade();
                handleAction("DEGRADE");
              }}
              disabled={isProcessing || !isStandard || !ownsFullSet || tile.houses <= 0 || tile.isMortgaged}
              className="flex-1 py-1.5 rounded bg-[#f4e8d3] hover:bg-white text-[#3d2915] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-[10px] font-bold uppercase tracking-wider flex items-center justify-center border border-[#d6ba8e] shadow-sm"
              title={!ownsFullSet ? "Must own full color set to degrade" : "Degrade (Sell House/Hotel)"}
            >
              DOWN
            </button>
            {/* Mortgage / Unmortgage */}
            {!tile.isMortgaged ? (
              <button
                onClick={() => handleAction("MORTGAGE")}
                disabled={isProcessing || tile.houses > 0}
                className="flex-1 py-1.5 rounded bg-[#f4e8d3] hover:bg-white text-[#3d2915] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-[10px] font-bold uppercase tracking-wider flex items-center justify-center border border-[#d6ba8e] shadow-sm"
                title="Mortgage Property"
              >
                LOCK
              </button>
            ) : (
              <button
                onClick={() => handleAction("UNMORTGAGE")}
                disabled={isProcessing || (players.find(p=>p.id===myPlayerId)?.cash || 0) < Math.ceil((property?.price || 0) / 2 * 1.1)}
                className="flex-1 py-1.5 rounded bg-[#e3d1b5] hover:bg-white text-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-[10px] font-bold uppercase tracking-wider flex items-center justify-center border border-[#c5a87b] shadow-sm"
                title={`Unmortgage ($${Math.ceil((property?.price || 0) / 2 * 1.1)})`}
              >
                UNLOCK
              </button>
            )}
            {/* Sell */}
            <button
              onClick={() => handleAction("SELL")}
              disabled={isProcessing || tile.houses > 0}
              className="flex-1 py-1.5 rounded bg-red-900/10 hover:bg-red-900/20 text-red-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-[10px] font-bold uppercase tracking-wider flex items-center justify-center border border-red-900/20 shadow-sm"
              title="Sell to Bank"
            >
              SELL
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
