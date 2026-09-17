import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serverBroadcast } from "@/lib/supabase-channels";
import { logGameEvent } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const { matchId, playerId, actionId } = await request.json();

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { players: true },
    });

    if (!match || match.status !== "PLAYING") {
      return NextResponse.json({ error: "Invalid match" }, { status: 400 });
    }

    const player = match.players.find((p) => p.id === playerId);
    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    const boardIndex = player.position;

    // Check passUpRule
    if (match.passUpRule === "AUCTION") {
      // Start auction
      await Promise.all([
        logGameEvent(match.id, match.inviteCode, `Auction started for property!`, "info"),
        serverBroadcast(match.inviteCode, {
          type: "auction-start",
          actionId,
          payload: { boardIndex, startingBid: 1 },
        })
      ]);

      return NextResponse.json({ action: "auction", boardIndex });
    }

    // passUpRule === "HIDDEN" — just end turn.
    // In Fog of War, this means the tile stays hidden (isRevealed remains false).
    // In Classic mode, the tile was already seeded as isRevealed: true, so doing nothing here naturally means it just stays unowned and visible on the board.
    await Promise.all([
      logGameEvent(match.id, match.inviteCode, `Property at position ${boardIndex} was passed`, "info"),
      serverBroadcast(match.inviteCode, {
        type: "tile-passed",
        actionId,
        payload: { boardIndex },
      })
    ]);

    // Turn advancement is now manual/timer-based

    return NextResponse.json({ action: "passed", boardIndex });
  } catch (error) {
    console.error("Pass error:", error);
    return NextResponse.json({ error: "Failed to pass" }, { status: 500 });
  }
}
