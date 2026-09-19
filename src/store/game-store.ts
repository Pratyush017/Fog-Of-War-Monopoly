import { create } from "zustand";
import type { Property, GameLog } from "@prisma/client";

// ─── Client-side Types ─────────────────────────────────────
export interface ClientPlayer {
  id: string;
  matchId: string;
  name: string;
  avatar: string | null;
  cash: number;
  position: number;
  inJail: boolean;
  jailTurns: number;
  isBankrupt: boolean;
  turnOrder: number;
  color: string;
  turnsPlayed: number;
  loanType: string | null;
  loanPrincipal: number;
  loanInterest: number;
  loanDeadlineTurn: number | null;
  isLiquidating: boolean;
  hasDefaulted: boolean;
  creditorId: string | null;
  debtAmount: number;
}

export interface ClientTile {
  id: string;
  matchId: string;
  boardIndex: number;
  tileType: string;
  isRevealed: boolean;
  ownerId: string | null;
  propertyId: string | null;
  houses: number;
  isMortgaged: boolean;
  property: Property | null;
}

export interface ClientMatch {
  id: string;
  inviteCode: string;
  status: string;
  hostId: string;
  currentTurnId: string | null;
  startingCash: number;
  mortgageRule: string;
  passUpRule: string;
  evenBuild: boolean;
  gameMode: 'CLASSIC' | 'FOG_OF_WAR';
  enableBank: boolean;
  turnEndsAt: string | null;
  hasRolled: boolean;
}

export interface AuctionState {
  active: boolean;
  boardIndex: number;
  currentBid: number;
  currentBidderId: string | null;
  currentBidderName: string | null;
  timeLeft: number;
}

export interface TradeProperty {
  tileId: string | number;
  name: string;
  colorSet: string | null;
  price: number;
}

export interface TradeOffer {
  tradeId: string;
  offeringPlayerId: string;
  offeringPlayerName: string;
  targetPlayerId: string;
  offeredCash: number;
  requestedCash: number;
  offeredProperties: TradeProperty[];
  requestedProperties: TradeProperty[];
}

export type EventLogEntry = GameLog;

export interface DiceState {
  die1: number;
  die2: number;
  total: number;
  isDoubles: boolean;
  rolling: boolean;
}

export type PendingAction =
  | { type: "buy-prompt"; boardIndex: number }
  | { type: "jail-choice" }
  | { type: "auction"; boardIndex: number }
  | null;

// ─── Store ─────────────────────────────────────────────────
interface GameStore {
  // Identity
  myPlayerId: string | null;
  setMyPlayerId: (id: string) => void;

  // Highlight set upon completion
  completedSetHighlight: { colorSet: string; color: string; timestamp: number } | null;
  setCompletedSetHighlight: (highlight: { colorSet: string; color: string; timestamp: number } | null) => void;

  // Match state
  match: ClientMatch | null;
  setMatch: (match: ClientMatch) => void;
  updateMatch: (partial: Partial<ClientMatch>) => void;

  // Players
  players: ClientPlayer[];
  setPlayers: (players: ClientPlayer[]) => void;
  updatePlayer: (playerId: string, partial: Partial<ClientPlayer>) => void;
  addPlayer: (player: ClientPlayer) => void;
  removePlayer: (playerId: string) => void;

  // Tiles
  tiles: ClientTile[];
  setTiles: (tiles: ClientTile[]) => void;
  updateTile: (boardIndex: number, partial: Partial<ClientTile>) => void;
  revealTile: (boardIndex: number, propertyId: string, ownerId: string) => void;
  revealAllLocally: () => void;

  // Dice
  dice: DiceState | null;
  setDice: (dice: DiceState) => void;
  clearDice: () => void;

  // Board Geometry
  tileCoordinates: Record<number, { x: number; y: number }>;
  setTileCoordinates: (coords: Record<number, { x: number; y: number }>) => void;

  // Pending Action
  pendingAction: PendingAction;
  setPendingAction: (action: PendingAction) => void;

  // Auction
  auction: AuctionState;
  setAuction: (auction: Partial<AuctionState>) => void;
  resetAuction: () => void;

  // Event Logs
  eventLog: EventLogEntry[];
  setEventLog: (logs: EventLogEntry[]) => void;
  addEvent: (log: EventLogEntry) => void;
  clearEvents: () => void;

  // Shuffle animation
  shufflingTiles: number[];
  setShufflingTiles: (indices: number[]) => void;

  // Hovered color set (for highlight)
  hoveredColorSet: string | null;
  setHoveredColorSet: (colorSet: string | null) => void;

  // Hovered player (for player property highlight)
  hoveredPlayerId: string | null;
  setHoveredPlayerId: (playerId: string | null) => void;

  // Consecutive doubles counter
  consecutiveDoubles: number;
  setConsecutiveDoubles: (count: number) => void;

  // Loading
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;

  // Selected Tile (Property Stat Window)
  selectedTileIndex: number | null;
  setSelectedTileIndex: (index: number | null) => void;

  // Action Card Reveal (Chance/Chest popup)
  actionCardReveal: { type: "CHANCE" | "CHEST", description: string } | null;
  setActionCardReveal: (reveal: { type: "CHANCE" | "CHEST", description: string } | null) => void;

  // Trade State
  incomingTradeOffer: TradeOffer | null;
  setIncomingTradeOffer: (offer: TradeOffer | null) => void;

  processedActions: Set<string>;
  addProcessedAction: (actionId: string) => void;
  hasProcessedAction: (actionId: string) => boolean;
  removeProcessedAction: (actionId: string) => void;

  activeTradePartnerId: string | null;
  setActiveTradePartnerId: (partnerId: string | null) => void;

  // Settings
  hasSeenTutorial: boolean;
  setHasSeenTutorial: (val: boolean) => void;

  // Auto-roll signal
  autoRollRequested: boolean;
  setAutoRollRequested: (val: boolean) => void;

  // Universal Delta application
  applyDelta: (delta: { players?: any[]; tiles?: any[]; match?: any }, timestamp: number) => void;

  // Reset entire store
  resetStore: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  // Identity
  myPlayerId: null,
  setMyPlayerId: (id) => set({ myPlayerId: id }),

  // Match
  match: null,
  setMatch: (match) => set({ match }),
  updateMatch: (partial) =>
    set((state) => ({
      match: state.match ? { ...state.match, ...partial } : null,
    })),

  // Players
  players: [],
  setPlayers: (players) => set({ players }),
  updatePlayer: (playerId, partial) =>
    set((state) => ({
      players: state.players.map((p) =>
        p.id === playerId ? { ...p, ...partial } : p
      ),
    })),
  addPlayer: (player) =>
    set((state) => ({
      players: [...state.players.filter((p) => p.id !== player.id), player],
    })),
  removePlayer: (playerId) =>
    set((state) => ({
      players: state.players.filter((p) => p.id !== playerId),
    })),

  // Tiles
  tiles: [],
  setTiles: (tiles) => set({ tiles }),
  updateTile: (boardIndex, partial) =>
    set((state) => ({
      tiles: state.tiles.map((t) =>
        t.boardIndex === boardIndex ? { ...t, ...partial } : t
      ),
    })),
  revealTile: (boardIndex, propertyId, ownerId) =>
    set((state) => ({
      tiles: state.tiles.map((t) =>
        t.boardIndex === boardIndex
          ? { ...t, isRevealed: true, propertyId, ownerId }
          : t
      ),
    })),
  revealAllLocally: () =>
    set((state) => ({
      tiles: state.tiles.map((t) => ({ ...t, isRevealed: true })),
    })),

  // Highlight
  completedSetHighlight: null,
  setCompletedSetHighlight: (highlight) => {
    set({ completedSetHighlight: highlight });
    if (highlight) {
      setTimeout(() => {
        set((state) => {
          if (state.completedSetHighlight?.timestamp === highlight.timestamp) {
            return { completedSetHighlight: null };
          }
          return {};
        });
      }, 1500);
    }
  },

  // Dice
  dice: null,
  setDice: (dice) => set({ dice }),
  clearDice: () => set({ dice: null }),

  // Board Geometry
  tileCoordinates: {},
  setTileCoordinates: (coords) => set({ tileCoordinates: coords }),

  // Pending Action
  pendingAction: null,
  setPendingAction: (action) => set({ pendingAction: action }),

  // Auction
  auction: {
    active: false,
    boardIndex: -1,
    currentBid: 0,
    currentBidderId: null,
    currentBidderName: null,
    timeLeft: 15,
  },
  setAuction: (partial) =>
    set((state) => ({ auction: { ...state.auction, ...partial } })),
  resetAuction: () =>
    set({
      auction: {
        active: false,
        boardIndex: -1,
        currentBid: 0,
        currentBidderId: null,
        currentBidderName: null,
        timeLeft: 15,
      },
    }),

  // Event Logs
  eventLog: [],
  setEventLog: (logs) => set({ eventLog: logs }),
  addEvent: (event) => set((state) => {
    const newLogs = [...state.eventLog, event];
    if (newLogs.length > 15) return { eventLog: newLogs.slice(-15) };
    return { eventLog: newLogs };
  }),
  clearEvents: () => set({ eventLog: [] }),

  // Shuffle
  shufflingTiles: [],
  setShufflingTiles: (indices) => set({ shufflingTiles: indices }),

  // Hover
  hoveredColorSet: null,
  setHoveredColorSet: (colorSet) => set({ hoveredColorSet: colorSet }),

  hoveredPlayerId: null,
  setHoveredPlayerId: (playerId) => set({ hoveredPlayerId: playerId }),

  // Doubles
  consecutiveDoubles: 0,
  setConsecutiveDoubles: (count) => set({ consecutiveDoubles: count }),

  // Loading
  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),

  // Selected Tile
  selectedTileIndex: null,
  setSelectedTileIndex: (index) => set({ selectedTileIndex: index }),

  // Action Card Reveal
  actionCardReveal: null,
  setActionCardReveal: (reveal) => set({ actionCardReveal: reveal }),

  // Trade State
  incomingTradeOffer: null,
  setIncomingTradeOffer: (offer) => set({ incomingTradeOffer: offer }),

  processedActions: new Set(),
  addProcessedAction: (actionId) => 
    set((state) => {
      const newSet = new Set(state.processedActions);
      newSet.add(actionId);
      return { processedActions: newSet };
    }),
  hasProcessedAction: (actionId) => get().processedActions.has(actionId),
  removeProcessedAction: (actionId) => 
    set((state) => {
      const newSet = new Set(state.processedActions);
      newSet.delete(actionId);
      return { processedActions: newSet };
    }),

  activeTradePartnerId: null,
  setActiveTradePartnerId: (partnerId) => set({ activeTradePartnerId: partnerId }),

  hasSeenTutorial: false,
  setHasSeenTutorial: (val) => set({ hasSeenTutorial: val }),

  autoRollRequested: false,
  setAutoRollRequested: (val) => set({ autoRollRequested: val }),

  // Reset entire store
  resetStore: () => set({
    myPlayerId: null,
    match: null,
    players: [],
    tiles: [],
    dice: null,
    pendingAction: null,
    auction: {
      active: false,
      boardIndex: -1,
      currentBid: 0,
      currentBidderId: null,
      currentBidderName: null,
      timeLeft: 15,
    },
    eventLog: [],
    shufflingTiles: [],
    hoveredColorSet: null,
    hoveredPlayerId: null,
    consecutiveDoubles: 0,
    isLoading: false,
    selectedTileIndex: null,
    incomingTradeOffer: null,
    activeTradePartnerId: null,
    autoRollRequested: false,
  }),

  // Universal Delta application natively merging payload.delta into the local state
  applyDelta: (delta, timestamp) => {
    // We only merge if the timestamp is newer (done previously outside, but Zustand makes it easy)
    const win = window as any;
    if (!win._lastDeltaTimestamps) win._lastDeltaTimestamps = {};
    const timestamps = win._lastDeltaTimestamps;

    set((state) => {
      let nextState = { ...state };
      
      if (delta.players) {
        nextState.players = [...state.players];
        delta.players.forEach(p => {
          if (p.id !== undefined) {
            const key = `player:${p.id}`;
            if ((timestamps[key] || 0) < timestamp) {
              const idx = nextState.players.findIndex(x => x.id === p.id);
              if (idx !== -1) {
                nextState.players[idx] = { ...nextState.players[idx], ...p };
              }
              timestamps[key] = timestamp;
            }
          }
        });
      }

      if (delta.tiles) {
        nextState.tiles = [...state.tiles];
        delta.tiles.forEach(t => {
          if (t.boardIndex !== undefined) {
            const key = `tile:${t.boardIndex}`;
            if ((timestamps[key] || 0) < timestamp) {
              const idx = nextState.tiles.findIndex(x => x.boardIndex === t.boardIndex);
              if (idx !== -1) {
                nextState.tiles[idx] = { ...nextState.tiles[idx], ...t };
              }
              timestamps[key] = timestamp;
            }
          }
        });
      }

      if (delta.match) {
        const key = `match`;
        if ((timestamps[key] || 0) < timestamp) {
          nextState.match = nextState.match ? { ...nextState.match, ...delta.match } : delta.match;
          timestamps[key] = timestamp;
        }
      }

      return nextState;
    });
  },
}));
