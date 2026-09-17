import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serverBroadcast, type TradeOfferPayload } from "@/lib/supabase-channels";
import { logGameEvent } from "@/lib/logger";
import { randomUUID } from "crypto";

export async function POST(request: Request) {
  try {
    const {
      matchId,
      offeringPlayerId,
      targetPlayerId,
      offeredCash = 0,
      requestedCash = 0,
      offeredPropertyTileIds = [],
      requestedPropertyTileIds = [],
    } = await request.json();

    if (!matchId || !offeringPlayerId || !targetPlayerId) {
      return NextResponse.json({ error: "Missing required trade parameters" }, { status: 400 });
    }

    if (offeringPlayerId === targetPlayerId) {
      return NextResponse.json({ error: "Cannot trade with yourself" }, { status: 400 });
    }

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        players: true,
        tiles: { include: { property: true } },
      },
    });

    if (!match || match.status !== "PLAYING") {
      return NextResponse.json({ error: "Match is not currently active" }, { status: 400 });
    }

    // ── 1. ACTIVE TURN CHECK ──
    if (match.currentTurnId !== offeringPlayerId) {
      return NextResponse.json({ error: "You can only initiate trade offers during your active turn" }, { status: 403 });
    }

    const offeringPlayer = match.players.find((p) => p.id === offeringPlayerId);
    const targetPlayer = match.players.find((p) => p.id === targetPlayerId);

    if (!offeringPlayer || offeringPlayer.isBankrupt) {
      return NextResponse.json({ error: "Offering player not found or bankrupt" }, { status: 404 });
    }
    if (!targetPlayer || targetPlayer.isBankrupt) {
      return NextResponse.json({ error: "Target player not found or bankrupt" }, { status: 404 });
    }

    // ── 2. TRADE LOCK ENFORCEMENT ──
    // Indebted players (loanPrincipal > 0) cannot offer properties, only cash.
    if (offeringPlayer.loanPrincipal > 0 && offeredPropertyTileIds.length > 0) {
      return NextResponse.json(
        { error: "Trade Lock Active: You have an active bank loan and cannot trade properties (cash only)!" },
        { status: 403 }
      );
    }
    if (targetPlayer.loanPrincipal > 0 && requestedPropertyTileIds.length > 0) {
      return NextResponse.json(
        { error: `Trade Lock Active: ${targetPlayer.name} has an active bank loan and cannot trade properties!` },
        { status: 403 }
      );
    }

    // ── 3. CASH BALANCE CHECK ──
    if (offeredCash < 0 || offeringPlayer.cash < offeredCash) {
      return NextResponse.json(
        { error: `You do not have enough cash ($${offeringPlayer.cash}) to offer $${offeredCash}` },
        { status: 400 }
      );
    }
    if (requestedCash < 0 || targetPlayer.cash < requestedCash) {
      return NextResponse.json(
        { error: `${targetPlayer.name} does not have $${requestedCash} cash` },
        { status: 400 }
      );
    }

    if (offeredCash === 0 && requestedCash === 0 && offeredPropertyTileIds.length === 0 && requestedPropertyTileIds.length === 0) {
      return NextResponse.json({ error: "Trade offer is empty. Please select cash or properties to trade." }, { status: 400 });
    }

    // ── 4. COLOR-SET HOUSE CHECK & PROPERTY VALIDATION ──
    const offeredProperties: { tileId: string; boardIndex: number; name: string; colorSet: string; price: number }[] = [];
    const requestedProperties: { tileId: string; boardIndex: number; name: string; colorSet: string; price: number }[] = [];

    for (const tileId of offeredPropertyTileIds) {
      const tile = match.tiles.find((t) => t.id === tileId);
      if (!tile || tile.ownerId !== offeringPlayerId || !tile.property) {
        return NextResponse.json({ error: "You do not own all offered properties" }, { status: 400 });
      }

      // Check if ANY property in this color/regional set currently has houses built
      const colorSetTiles = match.tiles.filter((t) => t.property?.colorSet === tile.property?.colorSet);
      if (colorSetTiles.some((t) => t.houses > 0)) {
        return NextResponse.json(
          { error: `Cannot trade ${tile.property.name}: All houses/hotels in the ${tile.property.colorSet} set must be sold first!` },
          { status: 400 }
        );
      }

      offeredProperties.push({
        tileId: tile.id,
        boardIndex: tile.boardIndex,
        name: tile.property.name,
        colorSet: tile.property.colorSet,
        price: tile.property.price,
      });
    }

    for (const tileId of requestedPropertyTileIds) {
      const tile = match.tiles.find((t) => t.id === tileId);
      if (!tile || tile.ownerId !== targetPlayerId || !tile.property) {
        return NextResponse.json({ error: `${targetPlayer.name} does not own all requested properties` }, { status: 400 });
      }

      // Check if ANY property in this color/regional set currently has houses built
      const colorSetTiles = match.tiles.filter((t) => t.property?.colorSet === tile.property?.colorSet);
      if (colorSetTiles.some((t) => t.houses > 0)) {
        return NextResponse.json(
          { error: `Cannot trade ${tile.property.name}: All houses/hotels in the ${tile.property.colorSet} set must be sold first!` },
          { status: 400 }
        );
      }

      requestedProperties.push({
        tileId: tile.id,
        boardIndex: tile.boardIndex,
        name: tile.property.name,
        colorSet: tile.property.colorSet,
        price: tile.property.price,
      });
    }

    const tradeId = randomUUID();

    const tradePayload: TradeOfferPayload = {
      tradeId,
      matchId,
      offeringPlayerId,
      offeringPlayerName: offeringPlayer.name,
      targetPlayerId,
      targetPlayerName: targetPlayer.name,
      offeredCash,
      requestedCash,
      offeredProperties,
      requestedProperties,
    };

    // Broadcast live trade offer
    await Promise.all([
      logGameEvent(match.id, match.inviteCode, `🤝 ${offeringPlayer.name} sent a trade offer to ${targetPlayer.name}`, "info"),
      serverBroadcast(match.inviteCode, {
        type: "trade-offer",
        payload: tradePayload,
      })
    ]);

    return NextResponse.json({
      success: true,
      tradeId,
      message: `Trade offer sent to ${targetPlayer.name}`,
    });
  } catch (error) {
    console.error("Trade offer error:", error);
    return NextResponse.json({ error: "Failed to send trade offer" }, { status: 500 });
  }
}
