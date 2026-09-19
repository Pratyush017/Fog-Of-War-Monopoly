import { memo } from "react";
import { useGameStore } from "@/store/game-store";
import type { ClientTile } from "@/store/game-store";

interface TileProps {
  tile: ClientTile;
  isCorner: boolean;
}

const COLOR_SET_MAP: Record<string, { bg: string; text: string }> = {
  A: { bg: "#8B4513", text: "#FFF" },
  B: { bg: "#87CEEB", text: "#000" },
  C: { bg: "#FF69B4", text: "#000" },
  D: { bg: "#FFA500", text: "#000" },
  E: { bg: "#FF0000", text: "#000" },
  F: { bg: "#FFFF00", text: "#000" },
  G: { bg: "#008000", text: "#FFF" },
  H: { bg: "#0000FF", text: "#FFF" },
};

const CORNER_DATA: Record<string, { label: string; color: string; html: string }> = {
  GO: { 
    label: "GO", 
    color: "bg-red-900", 
    html: `<div class="text-green-400 font-black text-2xl sm:text-3xl tracking-widest uppercase rotate-[-45deg] [-webkit-text-stroke:2px_black] drop-shadow-lg">GO</div><div class="text-red-200 text-[8px] sm:text-[10px] absolute bottom-1 sm:bottom-2 left-1 sm:left-2 rotate-[-45deg] font-mono font-bold">+$200</div>` 
  },
  JAIL: { 
    label: "JAIL", 
    color: "bg-stone-900", 
    html: `<div class="w-full h-full p-1"><div class="w-full h-full border-2 border-stone-600 bg-stone-800 flex items-center justify-center"><span class="text-stone-300 font-bold text-xs rotate-45">JAIL</span></div></div>` 
  },
  FREE_PARKING: { 
    label: "FREE PARKING", 
    color: "bg-stone-800", 
    html: `<div class="text-amber-500 font-bold text-[10px] text-center rotate-45 leading-tight">FREE<br/>PARKING</div>` 
  },
  GO_TO_JAIL: { 
    label: "GO TO JAIL", 
    color: "bg-stone-800", 
    html: `<div class="text-red-500 font-bold text-[10px] text-center rotate-[-45deg] leading-tight">GO TO<br/>JAIL</div>` 
  },
};

const SPECIAL_DATA: Record<string, { label: string; class: string }> = {
  CHANCE: { label: "CHANCE", class: "tile-parchment font-bold text-[9px] sm:text-[11px] text-stone-800" },
  CHEST: { label: "CHEST", class: "tile-parchment font-bold text-[9px] sm:text-[11px] text-stone-800" },
  TAX: { label: "TAX", class: "tile-dark-gold font-bold text-[10px] sm:text-xs text-stone-900" },
};

const FLAG_MAP: Record<string, string> = {
  A: "/flags/mexico.webp",
  B: "/flags/australia.webp",
  C: "/flags/india.webp",
  D: "/flags/brazil.webp",
  E: "/flags/italy.webp",
  F: "/flags/germany.webp",
  G: "/flags/japan.webp",
  H: "/flags/usa.webp",
};

const Tile = memo(function Tile({ tile, isCorner }: TileProps) {
  // Slice only the store fields this component needs
  const players = useGameStore((s) => s.players);
  const setSelectedTileIndex = useGameStore((s) => s.setSelectedTileIndex);
  const hoveredColorSet = useGameStore((s) => s.hoveredColorSet);
  const hoveredPlayerId = useGameStore((s) => s.hoveredPlayerId);
  const completedSetHighlight = useGameStore((s) => s.completedSetHighlight);

  const owner = tile.ownerId ? players.find((p) => p.id === tile.ownerId) : null;
  const ownerColor = owner ? owner.color : null;
  
  // Hover logic: dim if another player is hovered
  let playerHoverClass = "";
  if (hoveredPlayerId) {
    if (tile.ownerId === hoveredPlayerId) {
      playerHoverClass = "ring-4 ring-white z-40 scale-[1.08] shadow-[0_0_20px_rgba(255,255,255,0.4)] brightness-110";
    } else {
      playerHoverClass = "opacity-30 grayscale ";
    }
  }

  if (isCorner) {
    const data = CORNER_DATA[tile.tileType] || { label: tile.tileType, color: "bg-transparent", html: `<span>${tile.tileType}</span>` };
    const dimClass = hoveredPlayerId ? "opacity-30 grayscale transition-[transform,opacity,filter] duration-300" : "";
    return (
      <div 
        className={`w-full h-full tile-parchment flex flex-col items-center justify-center p-1 text-center relative group cursor-pointer transition-[transform,opacity,filter] duration-200 hover:scale-[1.05] hover:z-50  ${tile.tileType === 'GO_TO_JAIL' ? 'border-t-2 border-r-2 border-red-900/30' : ''} ${dimClass}`}
      >
        <div dangerouslySetInnerHTML={{ __html: data.html }} className="flex flex-col items-center justify-center" />
      </div>
    );
  }

  if (tile.tileType !== "PROPERTY") {
    const data = SPECIAL_DATA[tile.tileType] || { label: tile.tileType, class: "tile-parchment font-bold text-[9px] sm:text-[11px] text-stone-800" };
    
    // Custom render for Electric/Water Company
    if (tile.tileType === 'UTILITY' || tile.property?.isUtility) {
      const isWater = tile.property?.name?.toLowerCase().includes("water");
      const utilityEmoji = isWater ? "💧" : "⚡";
      const cleanName = tile.property?.name?.replace(/[💧⚡]/g, "").trim() || 'Utility';
      return (
        <div className={`w-full h-full tile-parchment bg-[#2c362f] border-2 border-[#4b6d4d] flex flex-col items-center justify-center p-1 text-center relative cursor-pointer transition-[transform,opacity,filter] duration-300 hover:scale-[1.05] hover:z-50  ${playerHoverClass}`} onClick={(e) => { e.stopPropagation(); setSelectedTileIndex(tile.boardIndex); }}>
          <div className="w-5 h-5 rounded-full bg-[#1b251e] border border-[#64936a] flex items-center justify-center text-[10px] text-amber-300 shadow-sm">
            {utilityEmoji}
          </div>
          <span className="text-[9px] font-bold text-emerald-200 mt-1 leading-none">{cleanName}</span>
          {ownerColor && (
             <div className="absolute -right-1 -bottom-1 w-2 h-2 rounded-full shadow" style={{ backgroundColor: ownerColor }}></div>
          )}
        </div>
      );
    }
    
    // Dim Chance/Chest/Tax when a player is hovered
    const nonPropHoverDim = hoveredPlayerId ? "opacity-30 grayscale  transition-[transform,opacity,filter] duration-300" : "";

    return (
      <div 
        className={`w-full h-full flex items-center justify-center cursor-pointer relative transition-[transform,opacity,filter] duration-200 hover:scale-[1.05] hover:z-50  ${data.class} ${nonPropHoverDim}`}
        onClick={(e) => { e.stopPropagation(); setSelectedTileIndex(tile.boardIndex); }}
      >
        {data.label}
      </div>
    );
  }

  // PROPERTY
  const tileColorSet = tile.property?.colorSet;
  
  // Fog of war state
  if (!tile.isRevealed) {
    const dimClass = hoveredPlayerId ? "opacity-30 grayscale transition-[transform,opacity,filter] duration-300" : "";
    return (
      <div 
        className={`w-full h-full tile-parchment flex items-center justify-center font-bold text-lg sm:text-2xl text-stone-600/75 relative transition-[transform,opacity,filter] duration-200 ${dimClass}`}
      >
        ?
      </div>
    );
  }

  // Is this tile part of the currently hovered color set?
  const isSetHovered = hoveredColorSet && tileColorSet === hoveredColorSet;
  const setHoverClass = isSetHovered ? "ring-4 ring-yellow-400 z-40 scale-105" : "";

  // Revealed State
  let emoji = "";
  let textName = tile.property?.name || "";
  
  // Extract emoji if the name contains a space (format: "[Emoji] [Name]")
  if (textName.includes(" ")) {
    const parts = textName.split(" ");
    // Check if first part looks like an emoji/flag
    if (parts[0].length >= 1 && parts[0].length <= 5) {
      emoji = parts[0];
      textName = parts.slice(1).join(" ");
    }
  }

  const flagUrl = tileColorSet ? FLAG_MAP[tileColorSet] : null;

  let flagPlacement = "";
  let rentPlacement = "";
  let textPlacement = "";

  const idx = tile.boardIndex;
  
  // Board Mapping:
  if (idx >= 1 && idx <= 9) {
    // Top Row: Flag on Bottom (Inside), Rent on Top (Outside)
    flagPlacement = "-bottom-3 left-1/2 -translate-x-1/2";
    rentPlacement = "-top-2 left-1/2 -translate-x-1/2";
    textPlacement = "top-1 left-0 w-full px-1";
  } else if (idx >= 11 && idx <= 19) {
    // Right Column: Flag on Left (Inside), Rent on Right (Outside)
    flagPlacement = "-left-3 top-1/2 -translate-y-1/2 flex-col";
    rentPlacement = "-right-2 top-1/2 -translate-y-1/2";
    textPlacement = "right-1 top-1/2 -translate-y-1/2 w-[calc(100%-16px)] px-1";
  } else if (idx >= 21 && idx <= 29) {
    // Bottom Row: Flag on Top (Inside), Rent on Bottom (Outside)
    flagPlacement = "-top-3 left-1/2 -translate-x-1/2";
    rentPlacement = "-bottom-2 left-1/2 -translate-x-1/2";
    textPlacement = "bottom-1 left-0 w-full px-1";
  } else if (idx >= 31 && idx <= 39) {
    // Left Column: Flag on Right (Inside), Rent on Left (Outside)
    flagPlacement = "-right-3 top-1/2 -translate-y-1/2 flex-col";
    rentPlacement = "-left-2 top-1/2 -translate-y-1/2";
    textPlacement = "left-1 top-1/2 -translate-y-1/2 w-[calc(100%-16px)] px-1";
  }

  const isMortgaged = tile.isMortgaged;
  const mortgagedFilter = isMortgaged ? "grayscale opacity-50" : "";
  const borderStyle = isMortgaged 
    ? "border-dashed border-stone-700 bg-stone-900" 
    : (tile.ownerId ? "tile-green border-2" : "tile-green");
  
  const borderColor = (!isMortgaged && ownerColor) ? ownerColor : undefined;

  // Set completion highlight glow
  const isSetHighlight = completedSetHighlight && completedSetHighlight.colorSet === tileColorSet;
  const highlightStyle = isSetHighlight ? {
    boxShadow: `0 0 25px 8px ${completedSetHighlight.color}`,
    transform: 'scale(1.1)',
    zIndex: 60,
    transition: 'all 0.5s ease-out'
  } : {};

  // Combine custom styles
  const combinedStyle = { ...highlightStyle };
  if (borderColor) {
    (combinedStyle as any).borderColor = borderColor;
  }

  return (
    <div
      onClick={(e) => { e.stopPropagation(); setSelectedTileIndex(tile.boardIndex); }}
      className={`w-full h-full flex flex-col items-center justify-center relative p-1 cursor-pointer overflow-visible transition-[transform,opacity,filter] duration-300 hover:scale-[1.05] hover:z-50  ${borderStyle} ${mortgagedFilter} ${setHoverClass} ${playerHoverClass}`}
      style={combinedStyle}
    >
      {/* Edge-Overlapping Flag or Icon */}
      {flagUrl ? (
        <div className={`absolute z-20 w-6 h-6 rounded-full border-2 border-stone-800 shadow-md overflow-hidden flex ${flagPlacement}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={flagUrl} alt={textName} className="w-full h-full object-cover" />
        </div>
      ) : tile.property?.isTransit ? (
        <div className={`absolute z-20 w-6 h-6 rounded-full border-2 border-stone-800 bg-stone-900 shadow-md flex items-center justify-center text-sm ${flagPlacement}`}>
          ✈️
        </div>
      ) : null}

      {/* Text Container (Name + Upgrade Indicator) */}
      <div className={`absolute flex flex-col items-center justify-center pointer-events-none ${textPlacement}`}>
        <span className="text-[10px] font-bold text-stone-200 leading-tight text-center drop-shadow-md">
          {textName}
        </span>
        {tile.houses > 0 && (
          <span className="text-[15px] font-black text-amber-400 leading-none mt-0.5 drop-shadow-md">
            {tile.houses >= 5 ? '皿' : `⌂×${tile.houses}`}
          </span>
        )}
      </div>

      {/* Mortgaged Lock Icon */}
      {isMortgaged && (
        <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
          <div className="w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm border border-stone-500 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white/80" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      )}

      {/* Owner Badge */}
      {ownerColor && owner && (
        <div 
          className="absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full border border-stone-800 shadow"
          style={{ backgroundColor: ownerColor }}
          title={`Owned by ${owner.name}`}
        ></div>
      )}    </div>
  );
});

export default Tile;
