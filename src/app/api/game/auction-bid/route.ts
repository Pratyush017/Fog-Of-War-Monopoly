import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serverBroadcast } from "@/lib/supabase-channels";
import { logGameEvent } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const { matchId, playerId, amount } = await request.json();

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
    if (!player || player.isBankrupt) {
      return NextResponse.json({ error: "Invalid player" }, { status: 400 });
    }

    if (amount < 1 || amount > player.cash) {
      return NextResponse.json({ error: "Invalid bid amount" }, { status: 400 });
    }

    await logGameEvent(match.id, match.inviteCode, `${player.name} bid $${amount}`, "info");

    // Broadcast bid
    await serverBroadcast(match.inviteCode, {
      type: "bid-placed",
      payload: {
        playerId,
        playerName: player.name,
        amount,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Auction bid error:", error);
    return NextResponse.json({ error: "Failed to place bid" }, { status: 500 });
  }
}
