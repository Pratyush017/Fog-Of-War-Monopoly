import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serverBroadcast } from "@/lib/supabase-channels";
import { logGameEvent } from "@/lib/logger";
import { 
  validateAndCalculateUpgrade, 
  validateAndCalculateDegrade, 
  validateAndCalculateMortgage, 
  validateAndCalculateUnmortgage, 
  validateAndCalculateSell 
} from "@/lib/game-engine";

export async function POST(request: Request) {
  try {
    const { matchId, playerId, tileId, action, actionId } = await request.json();

    if (!matchId || !playerId || !tileId || !action) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
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

    const player = match.players.find((p) => p.id === playerId);
    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    const tile = match.tiles.find((t) => t.id === tileId);
    if (!tile || !tile.property) {
      return NextResponse.json({ error: "Tile not found" }, { status: 404 });
    }

    if (tile.ownerId !== playerId) {
      return NextResponse.json({ error: "You don't own this property" }, { status: 403 });
    }

    const property = tile.property;
    let cost = 0;
    let cashChange = 0;
    let newHouses = tile.houses;
    let newIsMortgaged = tile.isMortgaged;
    let newOwnerId: string | null = tile.ownerId;

    switch (action) {
      case "UPGRADE":
        ({ cashChange, newHouses } = validateAndCalculateUpgrade(tile, property, match.tiles, match.evenBuild));
        break;

      case "DEGRADE":
        ({ cashChange, newHouses } = validateAndCalculateDegrade(tile, property, match.tiles, match.evenBuild));
        break;

      case "MORTGAGE":
        ({ cashChange, newIsMortgaged } = validateAndCalculateMortgage(tile, property));
        break;

      case "UNMORTGAGE":
        ({ cashChange, newIsMortgaged } = validateAndCalculateUnmortgage(tile, property));
        // Check cash separately since backend only knows player cash
        if (player.cash < -cashChange) {
          return NextResponse.json({ error: "Not enough cash" }, { status: 400 });
        }
        break;

      case "SELL":
        ({ cashChange, newOwnerId, newIsMortgaged } = validateAndCalculateSell(tile, property));
        break;

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // Upgrade check for cash (since upgrade returns a negative cashChange)
    if (action === "UPGRADE" && player.cash < -cashChange) {
      return NextResponse.json({ error: "Not enough cash" }, { status: 400 });
    }

    // Execute Transaction
    await prisma.$transaction([
      prisma.player.update({
        where: { id: playerId },
        data: { cash: { increment: cashChange } },
      }),
      prisma.matchTile.update({
        where: { id: tile.id },
        data: {
          houses: newHouses,
          isMortgaged: newIsMortgaged,
          ownerId: newOwnerId,
        },
      }),
      prisma.gameLog.create({
        data: {
          matchId: match.id,
          message: `${player.name} performed ${action} on ${property.name}`,
          type: "info"
        }
      })
    ]);

    // Broadcast Update
    await serverBroadcast(match.inviteCode, {
      type: "property-action",
      actionId,
      payload: {
        playerId,
        boardIndex: tile.boardIndex,
        action,
        newCash: player.cash + cashChange,
        newHouses,
        newIsMortgaged,
        newOwnerId,
      },
    });

    return NextResponse.json({
      success: true,
      newCash: player.cash + cashChange,
      newHouses,
      newIsMortgaged,
      newOwnerId,
    });
  } catch (error) {
    console.error("Property action error:", error);
    return NextResponse.json({ error: "Failed to perform action" }, { status: 500 });
  }
}
