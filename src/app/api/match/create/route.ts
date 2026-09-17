import { NextResponse } from "next/server";
import { prisma, runGarbageCollection } from "@/lib/prisma";
import { generateInviteCode } from "@/lib/game-engine";

export async function POST(request: Request) {
  // Run garbage collection in the background (fire and forget)
  runGarbageCollection().catch(console.error);

  try {
    const { playerName, color: requestColor, avatar } = await request.json();

    if (!playerName || typeof playerName !== "string") {
      return NextResponse.json({ error: "Player name is required" }, { status: 400 });
    }

    // Generate a unique invite code
    let inviteCode: string;
    let attempts = 0;
    do {
      inviteCode = generateInviteCode();
      const existing = await prisma.match.findUnique({ where: { inviteCode } });
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    if (attempts >= 10) {
      return NextResponse.json({ error: "Could not generate unique invite code" }, { status: 500 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const player = await tx.player.create({
        data: {
          name: playerName,
          avatar: avatar || "",
          turnOrder: 0,
          color: requestColor || "#FF6B6B",
          match: {
            create: {
              inviteCode,
              hostId: "", // Will be updated below
              status: "LOBBY",
            },
          },
        },
        include: { match: true },
      });

      // Update match with hostId
      await tx.match.update({
        where: { id: player.matchId },
        data: { hostId: player.id },
      });

      return player;
    });

    return NextResponse.json({
      matchId: result.matchId,
      inviteCode: inviteCode!,
      playerId: result.id,
      playerName: result.name,
    });
  } catch (error) {
    console.error("Create match error:", error);
    return NextResponse.json({ error: "Failed to create match" }, { status: 500 });
  }
}
