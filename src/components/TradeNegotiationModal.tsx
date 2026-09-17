"use client";

import { useState } from "react";
import { useGameStore } from "@/store/game-store";
import { useGameSounds } from "@/hooks/useGameSounds";

interface TradeNegotiationModalProps {
  partnerId: string | null;
  onClose: () => void;
}

const getAvatarImage = (id: string | null) => {
  if (!id) return <span className="text-xl">🎩</span>;
  return <img src={`/avatars/${id}.svg`} alt={id} className="w-6 h-6" />;
};

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

export default function TradeNegotiationModal({
  partnerId,
  onClose,
}: TradeNegotiationModalProps) {
  const { match, myPlayerId, players, tiles } = useGameStore();
  const { playPurchase } = useGameSounds();

  const me = players.find((p) => p.id === myPlayerId);
  const partner = players.find((p) => p.id === partnerId);
  const isMyTurn = match?.currentTurnId === myPlayerId;

  const [offeredCash, setOfferedCash] = useState<number>(0);
  const [requestedCash, setRequestedCash] = useState<number>(0);
  const [offeredTileIds, setOfferedTileIds] = useState<string[]>([]);
  const [requestedTileIds, setRequestedTileIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!partnerId || !me || !partner || !match) return null;

  const myTiles = tiles.filter((t) => t.ownerId === me.id && t.property);
  const partnerTiles = tiles.filter((t) => t.ownerId === partner.id && t.property);

  const myTradeLocked = me.loanPrincipal > 0;
  const partnerTradeLocked = partner.loanPrincipal > 0;

  // Toggle property selection
  const toggleOfferedTile = (tileId: string) => {
    setOfferedTileIds((prev) =>
      prev.includes(tileId) ? prev.filter((id) => id !== tileId) : [...prev, tileId]
    );
  };

  const toggleRequestedTile = (tileId: string) => {
    setRequestedTileIds((prev) =>
      prev.includes(tileId) ? prev.filter((id) => id !== tileId) : [...prev, tileId]
    );
  };

  // Check if any property in color set has houses
  const hasHousesInColorSet = (colorSet: string | undefined) => {
    if (!colorSet) return false;
    return tiles.some((t) => t.property?.colorSet === colorSet && t.houses > 0);
  };

  const handleSendOffer = async () => {
    if (!isMyTurn) {
      setErrorMessage("You can only send trade offers during your active turn.");
      return;
    }

    if (
      offeredCash === 0 &&
      requestedCash === 0 &&
      offeredTileIds.length === 0 &&
      requestedTileIds.length === 0
    ) {
      setErrorMessage("Please select cash or properties to include in the trade.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/game/trade/offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: match.id,
          offeringPlayerId: me.id,
          targetPlayerId: partner.id,
          offeredCash,
          requestedCash,
          offeredPropertyTileIds: offeredTileIds,
          requestedPropertyTileIds: requestedTileIds,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || "Failed to send trade offer");
      } else {
        playPurchase();
        alert(`Trade offer sent to ${partner.name}! Waiting for their response.`);
        onClose();
      }
    } catch (err: any) {
      console.error("Trade offer error:", err);
      setErrorMessage("Network error while sending trade offer");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[190] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5">
      <div className="w-full max-w-4xl bg-[#e3d8c4] border-4 border-[#362719] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="bg-[#362719] text-[#e3d8c4] px-6 py-4 flex items-center justify-between border-b-2 border-[#20160d]">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚖️</span>
            <div>
              <h2 className="text-base font-black tracking-widest uppercase font-serif">
                Trade Negotiation • {partner.name}
              </h2>
              <p className="text-[11px] text-[#b8a992]">
                Configure cash and property exchange between both parties
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-[#4a3420] hover:bg-[#5e4229] text-stone-300 flex items-center justify-center text-sm font-bold transition-colors"
          >
            ✕
          </button>
        </div>

        {/* 2-Column Side-by-Side Negotiation Layout */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x-2 divide-[#cca97f]/70 overflow-y-auto min-h-0">
          
          {/* ── LEFT COLUMN: YOU (OFFERING) ── */}
          <div className="p-5 flex flex-col space-y-4 bg-[#e8deca]">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#cca97f]/60">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-9 h-9 rounded-[8px] border border-[#3d2e22] shadow-inner flex items-center justify-center"
                  style={{ backgroundColor: getAvatarColor(me.avatar) }}
                >
                  {getAvatarImage(me.avatar)}
                </div>
                <div>
                  <div className="text-xs font-black uppercase text-[#2e1d0f]">You (Giving)</div>
                  <div className="text-[11px] text-[#6b5239] font-medium">{me.name}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold text-[#6b5239] uppercase">Max Cash</div>
                <div className="text-sm font-mono font-black text-[#2e5d32]">
                  ${me.cash.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Money Slider (You Offer) */}
            <div className="p-3.5 rounded-xl bg-[#dcd0b8] border border-[#cca97f] space-y-2">
              <div className="flex justify-between items-center text-xs font-bold text-[#4a3420]">
                <span>Cash to Give:</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-base font-black text-[#2e5d32]">${offeredCash}</span>
                </div>
              </div>

              <input
                type="range"
                min={0}
                max={Math.max(0, me.cash)}
                step={10}
                value={offeredCash}
                onChange={(e) => setOfferedCash(Number(e.target.value))}
                disabled={me.cash <= 0}
                className="w-full h-2 bg-[#beae90] rounded-lg appearance-none cursor-pointer accent-[#2e5d32]"
              />

              <div className="flex gap-1.5 pt-1">
                {[0, 50, 100, 200, me.cash].map((val, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setOfferedCash(Math.min(me.cash, val))}
                    disabled={me.cash < val}
                    className="flex-1 py-1 px-1 rounded bg-[#efe7d8] hover:bg-white text-[#3b2715] text-[10px] font-bold font-mono border border-[#cca97f]/70 transition-colors disabled:opacity-40"
                  >
                    {val === me.cash ? "MAX" : `$${val}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Trade Lock Warning */}
            {myTradeLocked && (
              <div className="p-2.5 rounded-lg bg-amber-600/15 border border-amber-700/30 text-[11px] text-amber-950 font-bold flex items-center gap-2">
                <span>🔒</span>
                <span>Trade Lock Active: You have an active loan and can only trade cash.</span>
              </div>
            )}

            {/* Property Selection (You Offer) */}
            <div className="flex-1 flex flex-col space-y-2 min-h-[140px]">
              <div className="text-xs font-black uppercase tracking-wider text-[#4a3420] flex justify-between">
                <span>Your Properties ({myTiles.length})</span>
                <span className="text-[10px] text-[#7a5c3d] font-normal font-mono">
                  {offeredTileIds.length} Selected
                </span>
              </div>

              <div className="space-y-2 overflow-y-auto max-h-[220px] pr-1">
                {myTiles.length === 0 ? (
                  <div className="text-center py-6 text-xs text-[#7a6552]">
                    You don't own any properties to offer.
                  </div>
                ) : (
                  myTiles.map((tile) => {
                    const prop = tile.property;
                    if (!prop) return null;
                    const isSelected = offeredTileIds.includes(tile.id);
                    const housesInSet = hasHousesInColorSet(prop.colorSet);
                    const isBlocked = myTradeLocked || housesInSet;

                    return (
                      <div
                        key={tile.id}
                        onClick={() => { if (!isBlocked) toggleOfferedTile(tile.id); }}
                        className={`p-2.5 rounded-xl border-2 transition-all flex items-center justify-between ${
                          isBlocked
                            ? "opacity-40 grayscale bg-[#d9cdb7] border-stone-400 cursor-not-allowed"
                            : isSelected
                            ? "bg-[#d8edd6] border-[#2e5d32] shadow-sm cursor-pointer"
                            : "bg-[#efe7d8] hover:bg-[#faefe0] border-[#cca97f]/70 cursor-pointer"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isBlocked}
                            readOnly
                            className="w-4 h-4 rounded text-emerald-600 accent-emerald-700 pointer-events-none"
                          />
                          <div>
                            <div className="text-xs font-bold text-[#1a1a1a] font-serif">
                              {prop.name}
                            </div>
                            <div className="text-[10px] text-[#6b5239]">
                              Value: <strong className="font-mono">${prop.price}</strong>
                              {housesInSet && " • Has Houses (Sell First)"}
                            </div>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#cca97f]/30 text-[#4a3420] uppercase font-mono">
                          ${prop.price}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* ── RIGHT COLUMN: TARGET PARTNER (RECEIVING) ── */}
          <div className="p-5 flex flex-col space-y-4 bg-[#dfd4be]">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#cca97f]/60">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-9 h-9 rounded-[8px] border border-[#3d2e22] shadow-inner flex items-center justify-center"
                  style={{ backgroundColor: getAvatarColor(partner.avatar) }}
                >
                  {getAvatarImage(partner.avatar)}
                </div>
                <div>
                  <div className="text-xs font-black uppercase text-[#2e1d0f]">
                    {partner.name} (Receiving)
                  </div>
                  <div className="text-[11px] text-[#6b5239] font-medium">Partner</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold text-[#6b5239] uppercase">Partner Cash</div>
                <div className="text-sm font-mono font-black text-[#2e5d32]">
                  ${partner.cash.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Money Slider (You Request) */}
            <div className="p-3.5 rounded-xl bg-[#dcd0b8] border border-[#cca97f] space-y-2">
              <div className="flex justify-between items-center text-xs font-bold text-[#4a3420]">
                <span>Cash to Request:</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-base font-black text-[#2e5d32]">${requestedCash}</span>
                </div>
              </div>

              <input
                type="range"
                min={0}
                max={Math.max(0, partner.cash)}
                step={10}
                value={requestedCash}
                onChange={(e) => setRequestedCash(Number(e.target.value))}
                disabled={partner.cash <= 0}
                className="w-full h-2 bg-[#beae90] rounded-lg appearance-none cursor-pointer accent-[#2e5d32]"
              />

              <div className="flex gap-1.5 pt-1">
                {[0, 50, 100, 200, partner.cash].map((val, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setRequestedCash(Math.min(partner.cash, val))}
                    disabled={partner.cash < val}
                    className="flex-1 py-1 px-1 rounded bg-[#efe7d8] hover:bg-white text-[#3b2715] text-[10px] font-bold font-mono border border-[#cca97f]/70 transition-colors disabled:opacity-40"
                  >
                    {val === partner.cash ? "MAX" : `$${val}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Trade Lock Warning */}
            {partnerTradeLocked && (
              <div className="p-2.5 rounded-lg bg-amber-600/15 border border-amber-700/30 text-[11px] text-amber-950 font-bold flex items-center gap-2">
                <span>🔒</span>
                <span>{partner.name} has an active loan. Properties cannot be requested.</span>
              </div>
            )}

            {/* Property Selection (You Request) */}
            <div className="flex-1 flex flex-col space-y-2 min-h-[140px]">
              <div className="text-xs font-black uppercase tracking-wider text-[#4a3420] flex justify-between">
                <span>Partner Properties ({partnerTiles.length})</span>
                <span className="text-[10px] text-[#7a5c3d] font-normal font-mono">
                  {requestedTileIds.length} Selected
                </span>
              </div>

              <div className="space-y-2 overflow-y-auto max-h-[220px] pr-1">
                {partnerTiles.length === 0 ? (
                  <div className="text-center py-6 text-xs text-[#7a6552]">
                    {partner.name} owns no properties to request.
                  </div>
                ) : (
                  partnerTiles.map((tile) => {
                    const prop = tile.property;
                    if (!prop) return null;
                    const isSelected = requestedTileIds.includes(tile.id);
                    const housesInSet = hasHousesInColorSet(prop.colorSet);
                    const isBlocked = partnerTradeLocked || housesInSet;

                    return (
                      <div
                        key={tile.id}
                        onClick={() => { if (!isBlocked) toggleRequestedTile(tile.id); }}
                        className={`p-2.5 rounded-xl border-2 transition-all flex items-center justify-between ${
                          isBlocked
                            ? "opacity-40 grayscale bg-[#d9cdb7] border-stone-400 cursor-not-allowed"
                            : isSelected
                            ? "bg-[#d8edd6] border-[#2e5d32] shadow-sm cursor-pointer"
                            : "bg-[#efe7d8] hover:bg-[#faefe0] border-[#cca97f]/70 cursor-pointer"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isBlocked}
                            readOnly
                            className="w-4 h-4 rounded text-emerald-600 accent-emerald-700 pointer-events-none"
                          />
                          <div>
                            <div className="text-xs font-bold text-[#1a1a1a] font-serif">
                              {prop.name}
                            </div>
                            <div className="text-[10px] text-[#6b5239]">
                              Value: <strong className="font-mono">${prop.price}</strong>
                              {housesInSet && " • Has Houses (Sell First)"}
                            </div>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#cca97f]/30 text-[#4a3420] uppercase font-mono">
                          ${prop.price}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Error Message */}
        {errorMessage && (
          <div className="p-3 bg-red-600/15 border-t border-b border-red-700/30 text-xs text-red-900 font-bold px-6">
            {errorMessage}
          </div>
        )}

        {/* Bottom Action Footer */}
        <div className="p-4 sm:p-5 bg-[#362719] border-t-2 border-[#20160d] flex items-center justify-between gap-4">
          <div className="text-xs text-[#d9cdb8] hidden sm:block">
            <span className="font-bold text-[#e3d8c4]">Summary: </span>
            <span>
              Give: ${offeredCash} + {offeredTileIds.length} prop(s) • Receive: ${requestedCash} + {requestedTileIds.length} prop(s)
            </span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              className="px-5 py-3 rounded-xl bg-[#4a3420] hover:bg-[#5e4229] text-stone-300 font-bold text-xs uppercase tracking-wider transition-colors"
            >
              Cancel
            </button>

            <button
              onClick={handleSendOffer}
              disabled={loading || !isMyTurn}
              className="flex-1 sm:flex-initial py-3 px-6 rounded-xl bg-[#33684a] hover:bg-[#254f38] active:scale-[0.98] text-white font-black text-xs sm:text-sm uppercase tracking-widest shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? "Sending..." : "Send Trade Offer 🤝"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
