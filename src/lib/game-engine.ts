import type { Property } from "@prisma/client";

// ─── Types ─────────────────────────────────────────────────
export type TileType = "PROPERTY" | "GO" | "JAIL" | "FREE_PARKING" | "GO_TO_JAIL" | "CHANCE" | "CHEST" | "TAX";

export interface BoardAssignment {
  boardIndex: number;
  tileType: TileType;
  propertyId: string | null;
  isRevealed: boolean;
}

export interface DiceResult {
  die1: number;
  die2: number;
  total: number;
  isDoubles: boolean;
}

// ─── Color Set Mapping ─────────────────────────────────────
export const COLOR_SET_MAP: Record<string, { bg: string; text: string; label: string }> = {
  A: { bg: "#6B3FA0", text: "#ffffff", label: "Purple" },
  B: { bg: "#87CEEB", text: "#1a1a1a", label: "Sky Blue" },
  C: { bg: "#E91E63", text: "#ffffff", label: "Rose" },
  D: { bg: "#FF9800", text: "#1a1a1a", label: "Orange" },
  E: { bg: "#F44336", text: "#ffffff", label: "Red" },
  F: { bg: "#FFEB3B", text: "#1a1a1a", label: "Yellow" },
  G: { bg: "#4CAF50", text: "#ffffff", label: "Green" },
  H: { bg: "#1A237E", text: "#ffffff", label: "Navy" },
  TRANSIT: { bg: "#424242", text: "#ffffff", label: "Transit" },
  UTILITY: { bg: "#78909C", text: "#ffffff", label: "Utility" },
};

// ─── Utilities ─────────────────────────────────────────────
export function getPurchasePrice(tile: { isRevealed: boolean, ownerId: string | null }, property: { price: number }): number {
  if (tile.isRevealed && !tile.ownerId) return property.price;
  return 200; // Blind buy
}
export function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function rollDice(): DiceResult {
  const die1 = Math.floor(Math.random() * 6) + 1;
  const die2 = Math.floor(Math.random() * 6) + 1;
  return {
    die1,
    die2,
    total: die1 + die2,
    isDoubles: die1 === die2,
  };
}

export function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No confusing chars (0/O, 1/I)
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ─── Section-Aware Board Generation ────────────────────────
/**
 * Generates the 40-tile board using Section-Aware Shuffle.
 * 
 * Static corners: 0=Go, 10=Jail, 20=Free Parking, 30=Go To Jail
 * 
 * Section 1 (1-9):  3 Non-Properties (Chance, Chest, Tax) + 6 Properties
 * Section 2 (11-19): 1 Non-Property (Chest) + 8 Properties
 * Section 3 (21-29): 1 Non-Property (Chance) + 8 Properties
 * Section 4 (31-39): 3 Non-Properties (Chance, Chest, Tax) + 6 Properties
 * 
 * Total properties: 6 + 8 + 8 + 6 = 28
 */
export function generateBoard(properties: Property[]): BoardAssignment[] {
  if (properties.length !== 28) {
    throw new Error(`Expected 28 properties, got ${properties.length}`);
  }

  const board: BoardAssignment[] = [];

  // ── Static Corners ──
  const corners: [number, TileType][] = [
    [0, "GO"],
    [10, "JAIL"],
    [20, "FREE_PARKING"],
    [30, "GO_TO_JAIL"],
  ];
  for (const [index, tileType] of corners) {
    board.push({
      boardIndex: index,
      tileType,
      propertyId: null,
      isRevealed: true,
    });
  }

  // ── Shuffle all 28 properties globally ──
  const shuffledProperties = shuffleArray(properties);
  let propertyPointer = 0;

  // ── Section definitions ──
  const sections: {
    startIndex: number;
    endIndex: number;
    propertyCount: number;
    nonProperties: TileType[];
  }[] = [
    {
      startIndex: 1,
      endIndex: 9,
      propertyCount: 6,
      nonProperties: ["CHANCE", "CHEST", "TAX"],
    },
    {
      startIndex: 11,
      endIndex: 19,
      propertyCount: 8,
      nonProperties: ["CHEST"],
    },
    {
      startIndex: 21,
      endIndex: 29,
      propertyCount: 8,
      nonProperties: ["CHANCE"],
    },
    {
      startIndex: 31,
      endIndex: 39,
      propertyCount: 6,
      nonProperties: ["CHANCE", "CHEST", "TAX"],
    },
  ];

  for (const section of sections) {
    // Pick properties for this section
    const sectionProperties = shuffledProperties.slice(
      propertyPointer,
      propertyPointer + section.propertyCount
    );
    propertyPointer += section.propertyCount;

    // Build section tiles
    const sectionTiles: BoardAssignment[] = [];

    // Add property tiles
    for (const prop of sectionProperties) {
      sectionTiles.push({
        boardIndex: -1, // Will be assigned after shuffle
        tileType: "PROPERTY",
        propertyId: prop.id,
        isRevealed: false, // Properties start hidden
      });
    }

    // Add non-property tiles
    for (const tileType of section.nonProperties) {
      sectionTiles.push({
        boardIndex: -1,
        tileType,
        propertyId: null,
        isRevealed: true, // Non-properties are always revealed
      });
    }

    // Shuffle this section
    const shuffledSection = shuffleArray(sectionTiles);

    // Assign board indices
    const sectionSize = section.endIndex - section.startIndex + 1;
    for (let i = 0; i < sectionSize; i++) {
      shuffledSection[i].boardIndex = section.startIndex + i;
      board.push(shuffledSection[i]);
    }
  }

  // Sort by board index for consistency
  board.sort((a, b) => a.boardIndex - b.boardIndex);

  return board;
}

/**
 * Generates the 40-tile board using the fixed Classic Monopoly layout.
 */
export function generateClassicBoard(properties: Property[]): BoardAssignment[] {
  if (properties.length !== 28) {
    throw new Error(`Expected 28 properties, got ${properties.length}`);
  }

  // Sort properties predictably by colorSet, then price, then name
  const sorted = [...properties].sort((a, b) => {
    if (a.colorSet < b.colorSet) return -1;
    if (a.colorSet > b.colorSet) return 1;
    if (a.price !== b.price) return a.price - b.price;
    return a.name.localeCompare(b.name);
  });

  const getProps = (set: string) => sorted.filter(p => p.colorSet === set);
  const A = getProps("A");
  const B = getProps("B");
  const C = getProps("C");
  const D = getProps("D");
  const E = getProps("E");
  const F = getProps("F");
  const G = getProps("G");
  const H = getProps("H");
  const TRANSIT = getProps("TRANSIT");
  const UTILITY = getProps("UTILITY");

  const layout: { index: number; type: TileType; prop?: Property }[] = [
    { index: 0, type: "GO" },
    { index: 1, type: "PROPERTY", prop: A[0] },
    { index: 2, type: "CHEST" },
    { index: 3, type: "PROPERTY", prop: A[1] },
    { index: 4, type: "TAX" },
    { index: 5, type: "PROPERTY", prop: TRANSIT[0] },
    { index: 6, type: "PROPERTY", prop: B[0] },
    { index: 7, type: "CHANCE" },
    { index: 8, type: "PROPERTY", prop: B[1] },
    { index: 9, type: "PROPERTY", prop: B[2] },
    { index: 10, type: "JAIL" },
    { index: 11, type: "PROPERTY", prop: C[0] },
    { index: 12, type: "PROPERTY", prop: UTILITY[0] },
    { index: 13, type: "PROPERTY", prop: C[1] },
    { index: 14, type: "PROPERTY", prop: C[2] },
    { index: 15, type: "PROPERTY", prop: TRANSIT[1] },
    { index: 16, type: "PROPERTY", prop: D[0] },
    { index: 17, type: "CHEST" },
    { index: 18, type: "PROPERTY", prop: D[1] },
    { index: 19, type: "PROPERTY", prop: D[2] },
    { index: 20, type: "FREE_PARKING" },
    { index: 21, type: "PROPERTY", prop: E[0] },
    { index: 22, type: "CHANCE" },
    { index: 23, type: "PROPERTY", prop: E[1] },
    { index: 24, type: "PROPERTY", prop: E[2] },
    { index: 25, type: "PROPERTY", prop: TRANSIT[2] },
    { index: 26, type: "PROPERTY", prop: F[0] },
    { index: 27, type: "PROPERTY", prop: F[1] },
    { index: 28, type: "PROPERTY", prop: UTILITY[1] },
    { index: 29, type: "PROPERTY", prop: F[2] },
    { index: 30, type: "GO_TO_JAIL" },
    { index: 31, type: "PROPERTY", prop: G[0] },
    { index: 32, type: "PROPERTY", prop: G[1] },
    { index: 33, type: "CHEST" },
    { index: 34, type: "PROPERTY", prop: G[2] },
    { index: 35, type: "PROPERTY", prop: TRANSIT[3] },
    { index: 36, type: "CHANCE" },
    { index: 37, type: "PROPERTY", prop: H[0] },
    { index: 38, type: "TAX" },
    { index: 39, type: "PROPERTY", prop: H[1] },
  ];

  return layout.map(l => ({
    boardIndex: l.index,
    tileType: l.type,
    propertyId: l.prop ? l.prop.id : null,
    isRevealed: true
  }));
}

// ─── Rent Calculation ──────────────────────────────────────
export interface RentContext {
  property: Property;
  houses: number;
  ownerId: string;
  diceTotal: number;
  // How many of the same color set does the owner have?
  ownerColorSetCount: number;
  totalColorSetCount: number;
  // For transit
  // For transit
  ownerTransitCount: number;
  // For utility
  ownerUtilityCount: number;
  isMortgaged: boolean;
}

export function calculateRent(ctx: RentContext): number {
  if (ctx.isMortgaged) return 0;

  // Utility: 4x dice if 1 owned, 10x dice if both owned
  if (ctx.property.isUtility) {
    const multiplier = ctx.property.rent[ctx.ownerUtilityCount - 1] || 4;
    return multiplier * ctx.diceTotal;
  }

  // Transit: Tiered rent based on owned count
  if (ctx.property.isTransit) {
    return ctx.property.rent[ctx.ownerTransitCount - 1] || 25;
  }

  // Regular property
  const baseRent = ctx.property.rent[0] || 0;

  if (ctx.houses === 0) {
    // Double rent if owner has monopoly (all of color set)
    const hasMonopoly = ctx.ownerColorSetCount === ctx.totalColorSetCount;
    return hasMonopoly ? baseRent * 2 : baseRent;
  }

  // With houses: rent[1] is 1 house, rent[2] is 2 houses, etc.
  return ctx.property.rent[ctx.houses] || baseRent;
}

// ─── Net Worth Calculation ─────────────────────────────────
export function calculatePlayerNetWorth(
  cash: number,
  ownedTilesWithProperties: { property: { price: number } | null }[]
): number {
  let totalPropertyValue = 0;
  for (const tile of ownedTilesWithProperties) {
    if (tile.property) {
      totalPropertyValue += tile.property.price;
    }
  }
  return cash + totalPropertyValue;
}

// ─── Board Index → Position Mapping ────────────────────────
export function boardIndexToGridPosition(index: number): { row: number; col: number } {
  if (index >= 0 && index <= 10) {
    // Top row: Go(0) at top-left (1,1), moving right
    return { row: 1, col: 1 + index };
  } else if (index >= 11 && index <= 19) {
    // Right column: going down from row 2 to row 10
    return { row: 1 + (index - 10), col: 11 };
  } else if (index >= 20 && index <= 30) {
    // Bottom row: Free Parking(20) at bottom-right (11,11), moving left
    return { row: 11, col: 11 - (index - 20) };
  } else if (index >= 31 && index <= 39) {
    // Left column: going up from row 10 to row 2
    return { row: 11 - (index - 30), col: 1 };
  }
  return { row: 1, col: 1 }; // Fallback
}

// ─── Board coordinate to pixel position (for canvas) ──────
export function boardIndexToPixelPosition(
  index: number,
  boardWidth: number,
  boardHeight: number
): { x: number; y: number } {
  const { row, col } = boardIndexToGridPosition(index);
  const cellWidth = boardWidth / 11;
  const cellHeight = boardHeight / 11;
  return {
    x: (col - 0.5) * cellWidth,
    y: (row - 0.5) * cellHeight,
  };
}

// ─── Chance / Community Chest Card Effects ─────────────────
export interface CardEffect {
  description: string;
  effect: "gain" | "lose" | "move" | "jail" | "collect-from-all" | "pay-all";
  amount?: number;
  moveTo?: number;
}

const CHANCE_CARDS: CardEffect[] = [
  { description: "Advance to Go. Collect $200.", effect: "move", moveTo: 0 },
  { description: "Bank pays you dividend of $50.", effect: "gain", amount: 50 },
  { description: "Go directly to Jail.", effect: "jail" },
  { description: "Your building loan matures. Collect $150.", effect: "gain", amount: 150 },
  { description: "Speeding fine. Pay $15.", effect: "lose", amount: 15 },
  { description: "You have been elected Chairman. Pay each player $50.", effect: "pay-all", amount: 50 },
  { description: "Bank error in your favor. Collect $200.", effect: "gain", amount: 200 },
  { description: "Doctor's fee. Pay $50.", effect: "lose", amount: 50 },
];

const CHEST_CARDS: CardEffect[] = [
  { description: "Advance to Go. Collect $200.", effect: "move", moveTo: 0 },
  { description: "Bank error in your favor. Collect $200.", effect: "gain", amount: 200 },
  { description: "Doctor's fee. Pay $50.", effect: "lose", amount: 50 },
  { description: "From sale of stock you get $50.", effect: "gain", amount: 50 },
  { description: "Go to Jail.", effect: "jail" },
  { description: "Holiday fund matures. Receive $100.", effect: "gain", amount: 100 },
  { description: "Income tax refund. Collect $20.", effect: "gain", amount: 20 },
  { description: "It's your birthday. Collect $10 from every player.", effect: "collect-from-all", amount: 10 },
  { description: "Life insurance matures. Collect $100.", effect: "gain", amount: 100 },
  { description: "Pay hospital fees of $100.", effect: "lose", amount: 100 },
];

export function drawChanceCard(): CardEffect {
  return CHANCE_CARDS[Math.floor(Math.random() * CHANCE_CARDS.length)];
}

export function drawChestCard(): CardEffect {
  return CHEST_CARDS[Math.floor(Math.random() * CHEST_CARDS.length)];
}

export const PLAYER_COLORS = [
  "#FF6B6B", // Coral Red
  "#4ECDC4", // Teal
  "#FFE66D", // Yellow
  "#A78BFA", // Purple
  "#F97316", // Orange
  "#22D3EE", // Cyan
];

export const PLAYER_AVATARS = ["🎩", "🚗", "🐕", "👢", "🚂", "⛵"];

// ─── Shared Business Logic for Property Actions ────────────────────────────
// These functions are used both on the backend (for authoritative state updates)
// and on the frontend (for Optimistic UI previews) to guarantee zero drift.

export function calculateNextActivePlayer(players: any[], currentPlayerId: string): string | null {
  const activePlayers = players
    .filter((p) => !p.isBankrupt)
    .sort((a, b) => a.turnOrder - b.turnOrder);
    
  if (activePlayers.length === 0) return null;
  
  const currentIndex = activePlayers.findIndex((p) => p.id === currentPlayerId);
  const nextPlayer = activePlayers[(currentIndex >= 0 ? currentIndex + 1 : 0) % activePlayers.length];
  
  return nextPlayer.id;
}

export function validateAndCalculateUpgrade(tile: any, property: any, matchTiles: any[], evenBuildRule: boolean): { cashChange: number, newHouses: number } {
  if (property.isUtility || property.isTransit) {
    throw new Error("Cannot upgrade this property type");
  }
  if (tile.houses >= 5) {
    throw new Error("Max upgrades reached");
  }
  
  const setTiles = matchTiles.filter((t) => t.property?.colorSet === property.colorSet);
  const ownerColorSetCount = setTiles.filter((t) => t.ownerId === tile.ownerId).length;
  if (ownerColorSetCount !== setTiles.length) {
    throw new Error("Must own full color set to upgrade");
  }

  if (evenBuildRule) {
    const minHousesInSet = Math.min(...setTiles.map((t) => t.houses));
    if (tile.houses > minHousesInSet) {
      throw new Error("Must build evenly across the color set");
    }
  }

  return { cashChange: -property.houseCost, newHouses: tile.houses + 1 };
}

export function validateAndCalculateDegrade(tile: any, property: any, matchTiles: any[], evenBuildRule: boolean): { cashChange: number, newHouses: number } {
  if (tile.houses <= 0) {
    throw new Error("No upgrades to sell");
  }
  
  if (evenBuildRule) {
    const degradeSetTiles = matchTiles.filter((t) => t.property?.colorSet === property.colorSet);
    const maxHousesInSet = Math.max(...degradeSetTiles.map((t) => t.houses));
    if (tile.houses < maxHousesInSet) {
      throw new Error("Must sell evenly across the color set");
    }
  }
  
  return { cashChange: property.houseCost, newHouses: tile.houses - 1 };
}

export function validateAndCalculateMortgage(tile: any, property: any): { cashChange: number, newIsMortgaged: boolean } {
  if (tile.houses > 0) {
    throw new Error("Cannot mortgage property with upgrades");
  }
  if (tile.isMortgaged) {
    throw new Error("Property is already mortgaged");
  }
  return { cashChange: Math.floor(property.price / 2), newIsMortgaged: true };
}

export function validateAndCalculateUnmortgage(tile: any, property: any): { cashChange: number, newIsMortgaged: boolean } {
  if (!tile.isMortgaged) {
    throw new Error("Property is not mortgaged");
  }
  return { cashChange: -Math.ceil((property.price / 2) * 1.1), newIsMortgaged: false };
}

export function validateAndCalculateSell(tile: any, property: any): { cashChange: number, newOwnerId: string | null, newIsMortgaged: boolean } {
  if (tile.houses > 0) {
    throw new Error("Must sell upgrades before selling property");
  }
  return { cashChange: property.originalMortgage, newOwnerId: null, newIsMortgaged: false };
}

export function registerOptimisticAction(actionType: string): string {
  const actionId = `${actionType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const win = window as any;
  win._processedActions = win._processedActions || new Set();
  win._processedActions.add(actionId);
  
  // Auto-prune after 10s if the broadcast never arrives
  setTimeout(() => {
    if (win._processedActions.has(actionId)) {
      win._processedActions.delete(actionId);
    }
  }, 10000);
  
  return actionId;
}
