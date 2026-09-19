import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serverBroadcast } from "@/lib/supabase-channels";
import { logGameEvent } from "@/lib/logger";

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
      return NextResponse.json({ error: "Missing trade parameters" }, { status: 400 });
    }

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

    const offeringPlayer = match.players.find((p) => p.id === offeringPlayerId);
    const targetPlayer = match.players.find((p) => p.id === targetPlayerId);

    if (!offeringPlayer || !targetPlayer) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    // ── TRADE LOCK ENFORCEMENT ──
    // If a player has an active loan (loanPrincipal > 0), they cannot add properties to a trade offer. They may only trade cash.
    if (offeringPlayer.loanPrincipal > 0 && offeredPropertyTileIds.length > 0) {
      return NextResponse.json(
        {
          error: "Trade Lock Active: You have an active loan and cannot trade away properties.",
        },
        { status: 403 }
      );
    }

    if (targetPlayer.loanPrincipal > 0 && requestedPropertyTileIds.length > 0) {
      return NextResponse.json(
        {
          error: "Trade Lock Active: Target player has an active loan and cannot trade away properties.",
        },
        { status: 403 }
      );
    }

    // Cash validation
    if (offeredCash > 0 && offeringPlayer.cash < offeredCash) {
      return NextResponse.json({ error: "Offering player has insufficient cash" }, { status: 400 });
    }
    if (requestedCash > 0 && targetPlayer.cash < requestedCash) {
      return NextResponse.json({ error: "Target player has insufficient cash" }, { status: 400 });
    }

    // Property ownership validation
    for (const tileId of offeredPropertyTileIds) {
      const tile = match.tiles.find((t) => t.id === tileId);
      if (!tile || tile.ownerId !== offeringPlayerId) {
        return NextResponse.json({ error: "Offering player does not own all offered properties" }, { status: 400 });
      }
      if (tile.houses > 0) {
        return NextResponse.json({ error: "Cannot trade properties that have houses" }, { status: 400 });
      }
    }

    for (const tileId of requestedPropertyTileIds) {
      const tile = match.tiles.find((t) => t.id === tileId);
      if (!tile || tile.ownerId !== targetPlayerId) {
        return NextResponse.json({ error: "Target player does not own all requested properties" }, { status: 400 });
      }
      if (tile.houses > 0) {
        return NextResponse.json({ error: "Cannot trade properties that have houses" }, { status: 400 });
      }
    }

    // Execute trade atomically
    await prisma.$transaction([
      // Cash adjustments
      prisma.player.update({
        where: { id: offeringPlayerId },
        data: { cash: { increment: requestedCash - offeredCash } },
      }),
      prisma.player.update({
        where: { id: targetPlayerId },
        data: { cash: { increment: offeredCash - requestedCash } },
      }),
      // Property transfers
      ...offeredPropertyTileIds.map((tileId: string) =>
        prisma.matchTile.update({
          where: { id: tileId },
          data: { ownerId: targetPlayerId },
        })
      ),
      ...requestedPropertyTileIds.map((tileId: string) =>
        prisma.matchTile.update({
          where: { id: tileId },
          data: { ownerId: offeringPlayerId },
        })
      ),
    ]);

    await logGameEvent(
      match.id,
      match.inviteCode,
      `🤝 Trade executed between ${offeringPlayer.name} and ${targetPlayer.name}`,
      "info"
    );


    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Trade error:", error);
    return NextResponse.json({ error: "Failed to execute trade" }, { status: 500 });
  }
}
