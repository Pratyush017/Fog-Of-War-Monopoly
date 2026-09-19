import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateBoard, generateClassicBoard } from "@/lib/game-engine";
import { serverBroadcast } from "@/lib/supabase-channels";

export async function POST(request: Request) {
  try {
    const { matchId, hostPlayerId } = await request.json();

    if (!matchId || !hostPlayerId) {
      return NextResponse.json({ error: "Match ID and host player ID required" }, { status: 400 });
    }

    // Validate host & match status
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { players: true },
    });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    if (match.hostId !== hostPlayerId) {
      return NextResponse.json({ error: "Only the host can start the game" }, { status: 403 });
    }

    if (match.status !== "LOBBY") {
      return NextResponse.json({ error: "Match already started" }, { status: 400 });
    }

    if (match.players.length < 2) {
      return NextResponse.json({ error: "Need at least 2 players to start the game" }, { status: 400 });
    }

    console.log("[MATCH START] GameMode:", match.gameMode);


    // Fetch all 28 properties
    const properties = await prisma.property.findMany();
    if (properties.length !== 28) {
      return NextResponse.json(
        { error: `Expected 28 properties in database, found ${properties.length}. Run seed first.` },
        { status: 500 }
      );
    }

    // Generate board using appropriate logic
    const boardAssignments = match.gameMode === "CLASSIC" 
      ? generateClassicBoard(properties)
      : generateBoard(properties);

    // Randomly select first player
    const shuffledPlayers = [...match.players].sort(() => Math.random() - 0.5);
    const firstPlayerId = shuffledPlayers[0].id;

    // Execute everything in a transaction
    await prisma.$transaction(async (tx) => {
      // Create all 40 MatchTile rows
      await tx.matchTile.createMany({
        data: boardAssignments.map((tile) => ({
          matchId,
          boardIndex: tile.boardIndex,
          tileType: tile.tileType,
          isRevealed: match.gameMode === "CLASSIC" ? true : tile.isRevealed,
          propertyId: tile.propertyId,
          ownerId: null,
          houses: 0,
        })),
      });

      // Set all players' cash to startingCash and assign turn order
      for (let i = 0; i < shuffledPlayers.length; i++) {
        await tx.player.update({
          where: { id: shuffledPlayers[i].id },
          data: {
            cash: match.startingCash,
            position: 0,
            turnOrder: i,
          },
        });
      }

      // Update match status (+5s grace period before 3 min timer starts)
      const turnEndsAt = new Date(Date.now() + 5000 + 3 * 60 * 1000);
      await tx.match.update({
        where: { id: matchId },
        data: {
          status: "PLAYING",
          currentTurnId: firstPlayerId,
          turnEndsAt,
        },
      });
    });

    // Broadcast game started
    const turnEndsAtStr = new Date(Date.now() + 5000 + 3 * 60 * 1000).toISOString();
    await serverBroadcast(match.inviteCode, {
      type: "game-started",
      payload: { currentTurnId: firstPlayerId, turnEndsAt: turnEndsAtStr, hasRolled: false },
    });

    return NextResponse.json({ success: true, currentTurnId: firstPlayerId });
  } catch (error) {
    console.error("Start match error:", error);
    return NextResponse.json({ error: "Failed to start match" }, { status: 500 });
  }
}
