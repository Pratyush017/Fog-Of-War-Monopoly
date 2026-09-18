import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serverBroadcast } from "@/lib/supabase-channels";
import { logGameEvent } from "@/lib/logger";
import { getPurchasePrice } from "@/lib/game-engine";

export async function POST(request: Request) {
  try {
    const { matchId, playerId, tileIndex, actionId, price } = await request.json();

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        players: true,
        tiles: { include: { property: true } },
      },
    });

    if (!match || match.status !== "PLAYING") {
      return NextResponse.json({ error: "Invalid match" }, { status: 400 });
    }

    const player = match.players.find((p) => p.id === playerId);
    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    // Find the tile at the player's current position (or specified index)
    const boardIndex = tileIndex ?? player.position;
    const tile = match.tiles.find((t) => t.boardIndex === boardIndex);

    if (!tile) {
      return NextResponse.json({ error: "Tile not found" }, { status: 404 });
    }

    if (tile.ownerId) {
      return NextResponse.json({ error: "Tile already owned" }, { status: 400 });
    }

    if (tile.tileType !== "PROPERTY") {
      return NextResponse.json({ error: "Cannot buy non-property tile" }, { status: 400 });
    }

    // Add timing telemetry
    const serverReceivedTime = Date.now();

    // Price calculation
    const buyPrice = price !== undefined ? price : getPurchasePrice(tile, tile.property!);

    if (player.cash < buyPrice) {
      return NextResponse.json({ error: "Not enough cash" }, { status: 400 });
    }

    // 1. Broadcast immediately (Ultra-Low Latency)
    const broadcastPromise = serverBroadcast(match.inviteCode, {
      actionId,
      type: "tile-bought",
      telemetry: { serverReceivedTime, serverBroadcastTime: Date.now() },
      payload: {
        boardIndex,
        ownerId: playerId,
        newCash: player.cash - buyPrice,
        propertyId: tile.propertyId!,
        propertyName: tile.property?.name ?? "Unknown",
        colorSet: tile.property?.colorSet ?? "",
      },
      delta: {
        players: [{ id: playerId, cash: player.cash - buyPrice }],
        tiles: [{ boardIndex, ownerId: playerId, isRevealed: true }]
      }
    });

    // 2. Persist to DB
    const dbPromise = prisma.$transaction([
      prisma.player.update({
        where: { id: playerId },
        data: { cash: { decrement: buyPrice } },
      }),
      prisma.matchTile.update({
        where: { id: tile.id },
        data: {
          ownerId: playerId,
          isRevealed: true,
        },
      }),
    ]);

    // 3. Log event
    const logPromise = logGameEvent(match.id, match.inviteCode, `${player.name} bought ${tile.property?.name ?? "Unknown"} for $${buyPrice}`, "buy");

    // Wait for all to finish
    await Promise.all([broadcastPromise, dbPromise, logPromise]);

    // Turn advancement is now manual/timer-based

    return NextResponse.json({
      success: true,
      newCash: player.cash - buyPrice,
      propertyName: tile.property?.name,
    });
  } catch (error) {
    console.error("Buy error:", error);
    return NextResponse.json({ error: "Failed to buy" }, { status: 500 });
  }
}
