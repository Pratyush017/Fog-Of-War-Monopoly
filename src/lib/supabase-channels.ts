import { supabase } from "./supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ─── Event Types ───────────────────────────────────────────
export type GameEventPayload =
  | { type: "player-joined"; payload: { playerId: string; name: string; avatar?: string; color?: string } }
  | { type: "player-left"; payload: { playerId: string } }
  | { type: "settings-updated"; payload: { startingCash: number; mortgageRule: string; passUpRule: string; evenBuild: boolean; gameMode: 'CLASSIC' | 'FOG_OF_WAR' } }
  | { type: "game-started"; payload: { currentTurnId: string; turnEndsAt?: string; hasRolled?: boolean; } }
  | { type: "dice-rolled"; payload: { playerId: string; dice: [number, number]; isDoubles: boolean; hasRolled?: boolean; newPosition?: number } }
  | { type: "player-moved"; payload: { playerId: string; from: number; to: number; passedGo: boolean } }
  | { type: "tile-revealed"; payload: { boardIndex: number; propertyId: string; ownerId: string } }
  | { type: "buy-prompt"; payload: { playerId: string; boardIndex: number } }
  | { type: "tile-bought"; payload: { boardIndex: number; ownerId: string; newCash?: number; propertyId: string; propertyName: string; colorSet: string } }
  | { type: "tile-passed"; payload: { boardIndex: number } }
  | { type: "rent-paid"; payload: { payerId: string; ownerId: string; amount: number; tileName: string } }
  | { type: "auction-start"; payload: { boardIndex: number; startingBid: number } }
  | { type: "bid-placed"; payload: { playerId: string; playerName: string; amount: number } }
  | { type: "auction-won"; payload: { boardIndex: number; winnerId: string; amount: number; propertyId: string; propertyName: string; colorSet: string } }
  | { type: "auction-ended-no-bids"; payload: { boardIndex: number } }
  | { type: "jail-entered"; payload: { playerId: string } }
  | { type: "jail-paid"; payload: { playerId: string; amount: number; type: "bail" | "maintenance" } }
  | { type: "jail-freed"; payload: { playerId: string } }
  | { type: "turn-changed"; payload: { currentTurnId: string; turnEndsAt?: string; hasRolled?: boolean; } }
  | { type: "bankruptcy-shuffle"; payload: { bankruptPlayerId: string; creditorId: string; paidAmount: number; affectedIndices: number[] } }
  | { type: "player-bankrupt"; payload: { playerId: string } }
  | { type: "go-collect"; payload: { playerId: string; amount: number } }
  | { type: "tax-paid"; payload: { playerId: string; amount: number } }
  | { type: "chance-card"; payload: { playerId: string; description: string; effect: string } }
  | { type: "chest-card"; payload: { playerId: string; description: string; effect: string } }
  | { type: "game-over"; payload: { winnerId: string; winnerName: string } }
  | { type: "state-sync"; payload: Record<string, unknown> }
  | { type: "loan-taken"; payload: { playerId: string; playerName: string; amount: number; loanType?: string; principal?: number; interest?: number; deadlineTurn?: number } }
  | { type: "loan-repaid"; payload: { playerId: string; playerName: string; amount: number } }
  | { type: "liquidation-started"; payload: { playerId: string; remainingDebt: number } }
  | { type: "liquidation-completed"; payload: { playerId: string } }
  | { type: "property-action"; payload: { playerId: string; boardIndex: number; action: string; newCash: number; newHouses: number; newIsMortgaged: boolean; newOwnerId: string | null } }
  | { type: "new-log"; payload: { id: string; matchId: string; message: string; type: string; createdAt: Date } }
  | { type: "trade-offer"; payload: TradeOfferPayload }
  | { type: "trade-accepted"; payload: { tradeId: string; offeringPlayerId: string; targetPlayerId: string; summary: string } }
  | { type: "trade-declined"; payload: { tradeId: string; offeringPlayerId: string; targetPlayerId: string; targetPlayerName: string } }
  | { type: "trade-voided"; payload: { tradeId: string; reason: string } };

export type GameEvent = GameEventPayload & { actionId?: string };

export interface TradeOfferProperty {
  tileId: string;
  boardIndex: number;
  name: string;
  colorSet: string;
  price: number;
}

export interface TradeOfferPayload {
  tradeId: string;
  matchId: string;
  offeringPlayerId: string;
  offeringPlayerName: string;
  targetPlayerId: string;
  targetPlayerName: string;
  offeredCash: number;
  requestedCash: number;
  offeredProperties: TradeOfferProperty[];
  requestedProperties: TradeOfferProperty[];
}

// ─── Channel Management ────────────────────────────────────
const activeChannels = new Map<string, RealtimeChannel>();

export function subscribeToMatch(
  inviteCode: string,
  onEvent: (event: GameEvent) => void
) {
  if (activeChannels.has(inviteCode)) {
    return activeChannels.get(inviteCode);
  }

  const channel = supabase
    .channel(`match:${inviteCode}`)
    .on("broadcast", { event: "game-event" }, (payload) => {
      onEvent(payload.payload as GameEvent);
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log(`Subscribed to match channel: match:${inviteCode}`);
      }
    });

  activeChannels.set(inviteCode, channel);
  return channel;
}

export function unsubscribeFromMatch(inviteCode: string) {
  const channel = activeChannels.get(inviteCode);
  if (channel) {
    supabase.removeChannel(channel);
    activeChannels.delete(inviteCode);
    console.log(`Unsubscribed from match channel: match:${inviteCode}`);
  }
}

export async function serverBroadcast(
  matchId: string,
  event: GameEvent
) {
  const channel = activeChannels.get(matchId);
  if (channel) {
    // Already have a WebSocket connection (e.g. running in long-lived server environment)
    await channel.send({
      type: "broadcast",
      event: "game-event",
      payload: event,
    });
  } else {
    // Running in an API route (stateless) - no active WebSocket connection.
    // Use the explicit HTTP REST endpoint instead of trying to subscribe over WebSockets.
    const tempChannel = supabase.channel(`match:${matchId}`);
    
    // @ts-ignore - httpSend exists but might not be in the exact local types yet
    await tempChannel.httpSend("game-event", event);
  }
}
