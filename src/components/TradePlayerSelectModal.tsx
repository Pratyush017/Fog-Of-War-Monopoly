"use client";

import { useGameStore } from "@/store/game-store";

interface TradePlayerSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPartner: (playerId: string) => void;
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

export default function TradePlayerSelectModal({
  isOpen,
  onClose,
  onSelectPartner,
}: TradePlayerSelectModalProps) {
  const { match, myPlayerId, players, tiles } = useGameStore();

  if (!isOpen || !match) return null;

  const otherPlayers = players.filter((p) => p.id !== myPlayerId && !p.isBankrupt);

  return (
    <div className="fixed inset-0 z-[190] bg-black/75 backdrop-blur-sm flex items-center justify-center p-0 md:p-4">
      <div className="w-full h-full md:h-auto md:max-w-md bg-[#e3d8c4] border-0 md:border-4 border-[#362719] rounded-none md:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[100dvh] md:max-h-[90vh] animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="bg-[#362719] text-[#e3d8c4] px-4 md:px-6 py-3.5 md:py-4 flex items-center justify-between border-b-2 border-[#20160d] shrink-0">
          <div className="flex items-center gap-2.5 md:gap-3 min-w-0">
            <span className="text-xl md:text-2xl shrink-0">🤝</span>
            <div className="min-w-0">
              <h2 className="text-sm md:text-base font-black tracking-widest uppercase font-serif truncate">
                Select Trade Partner
              </h2>
              <p className="text-[10px] md:text-[11px] text-[#b8a992] truncate">
                Choose an active player to negotiate a trade offer
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

        {/* Players List */}
        <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
          {otherPlayers.length === 0 ? (
            <div className="text-center py-8 text-[#6b5239]">
              <p className="text-sm font-bold">No other active players available to trade with.</p>
            </div>
          ) : (
            otherPlayers.map((player) => {
              const ownedTiles = tiles.filter((t) => t.ownerId === player.id);
              const pColor = getAvatarColor(player.avatar);
              const isLocked = player.loanPrincipal > 0;

              return (
                <div
                  key={player.id}
                  onClick={() => onSelectPartner(player.id)}
                  className="p-3.5 rounded-xl bg-[#efe7d8] hover:bg-[#faefe0] border-2 border-[#cca97f]/70 hover:border-[#362719] transition-all cursor-pointer flex items-center justify-between shadow-sm group active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-11 h-11 rounded-[10px] border-2 border-[#3d2e22] shadow-inner flex items-center justify-center transition-colors"
                      style={{ backgroundColor: pColor }}
                    >
                      {getAvatarImage(player.avatar)}
                    </div>
                    <div>
                      <div className="text-sm font-black text-[#1a1a1a] flex items-center gap-2">
                        <span>{player.name}</span>
                        {isLocked && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-800/15 text-amber-900 border border-amber-800/30">
                            🔒 Debt (Cash Only)
                          </span>
                        )}
                      </div>
                      <div className="text-[11.5px] font-semibold text-[#5a5a5a] mt-0.5">
                        {ownedTiles.length} Properties
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-base font-mono font-black text-[#2e5d32]">
                      ${player.cash.toLocaleString()}
                    </div>
                    <span className="text-[10px] font-bold text-[#7a5c3d] group-hover:text-[#362719] uppercase tracking-wider flex items-center gap-1 justify-end mt-0.5">
                      <span>Trade</span>
                      <span>→</span>
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#362719] border-t-2 border-[#20160d] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-[#4a3420] hover:bg-[#5e4229] text-stone-300 font-bold text-xs uppercase tracking-wider transition-colors"
          >
            Cancel
          </button>
        </div>

      </div>
    </div>
  );
}
