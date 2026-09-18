import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serverBroadcast } from "@/lib/supabase-channels";
import { shuffleArray, calculatePlayerNetWorth } from "@/lib/game-engine";
import { logGameEvent } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const serverReceivedTime = Date.now();
    const { matchId, playerId, action, actionId } = await request.json();

    if (!matchId || !playerId || !action) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
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

    if (action === "LOAN" && match.currentTurnId !== playerId) {
      return NextResponse.json({ error: "Not your turn" }, { status: 403 });
    }

    const player = match.players.find((p) => p.id === playerId);
    if (!player || player.isBankrupt) {
      return NextResponse.json({ error: "Invalid player" }, { status: 404 });
    }

    if (action === "LOAN") {
      // ── Take Loan ($600) ──
      const broadcastPromise = serverBroadcast(match.inviteCode, {
        actionId,
        type: "loan-taken",
        telemetry: { serverReceivedTime, serverBroadcastTime: Date.now() },
        payload: { playerId, playerName: player.name, amount: 600 },
        delta: {
          players: [{ id: playerId, cash: player.cash + 600 }]
        }
      });

      const dbPromise = prisma.player.update({
        where: { id: playerId },
        data: { cash: { increment: 600 } },
      });

      const logPromise = logGameEvent(match.id, match.inviteCode, `${player.name} took a $600 loan from the bank!`, "info");

      await Promise.all([broadcastPromise, dbPromise, logPromise]);

      return NextResponse.json({ success: true });
    } 
    else if (action === "BANKRUPTCY") {
      // ── Declare Bankruptcy ──
      // Calculate net worth and cap payment (to bank for self-declared bankruptcy)
      const ownedTiles = match.tiles.filter((t) => t.ownerId === playerId);
      const netWorth = calculatePlayerNetWorth(player.cash, ownedTiles);
      const cappedPayment = Math.min(netWorth, 0); // self-declared bankruptcy debtAmount is 0

      // ── Seizure + Shuffle Setup ──
      const seizedTiles = match.tiles.filter((t) => t.ownerId === playerId);
      const unrevealedTiles = match.tiles.filter(
        (t) => !t.isRevealed && t.tileType === "PROPERTY" && t.ownerId !== playerId
      );

      const affectedTiles = [...seizedTiles, ...unrevealedTiles];
      const propertyIds = affectedTiles
        .map((t) => t.propertyId)
        .filter((id): id is string => id !== null);

      const shuffledPropertyIds = shuffleArray(propertyIds);
      const affectedIndices: number[] = [];
      const tilesDelta: any[] = [];
      
      for (let i = 0; i < affectedTiles.length; i++) {
        const tile = affectedTiles[i];
        affectedIndices.push(tile.boardIndex);
        const newPropertyId = shuffledPropertyIds[i] || null;
        
        tilesDelta.push({
          boardIndex: tile.boardIndex,
          propertyId: newPropertyId,
          ownerId: null,
          isRevealed: false,
          houses: 0,
          isMortgaged: false,
        });
      }

      // Check if game is over
      const activePlayers = match.players.filter(
        (p) => !p.isBankrupt && p.id !== playerId
      );
      
      const isGameOver = activePlayers.length === 1;
      const winner = isGameOver ? activePlayers[0] : null;
      let nextPlayerId = match.currentTurnId;
      
      if (!isGameOver && match.currentTurnId === playerId) {
        const nextPlayers = activePlayers.sort((a, b) => a.turnOrder - b.turnOrder);
        nextPlayerId = nextPlayers[0].id;
      }

      // ── 1. Broadcasts ──
      const broadcastPromises: Promise<any>[] = [];
      
      broadcastPromises.push(serverBroadcast(match.inviteCode, {
        actionId,
        type: "bankruptcy-shuffle",
        telemetry: { serverReceivedTime, serverBroadcastTime: Date.now() },
        payload: {
          bankruptPlayerId: playerId,
          creditorId: "bank",
          paidAmount: cappedPayment,
          affectedIndices,
        },
        delta: {
          players: [{ id: playerId, cash: 0, isBankrupt: true }],
          tiles: tilesDelta,
          match: isGameOver ? { status: "FINISHED", currentTurnId: null } : { currentTurnId: nextPlayerId }
        }
      }));

      if (isGameOver) {
        broadcastPromises.push(serverBroadcast(match.inviteCode, {
          type: "game-over",
          payload: { winnerId: winner!.id, winnerName: winner!.name },
        }));
      } else if (match.currentTurnId === playerId) {
        broadcastPromises.push(serverBroadcast(match.inviteCode, {
          type: "turn-changed",
          payload: { currentTurnId: nextPlayerId! },
        }));
      }
      
      await Promise.all(broadcastPromises);

      // ── 2. Persistence ──
      const dbPromise = prisma.$transaction(async (tx) => {
        await tx.player.update({
          where: { id: playerId },
          data: {
            cash: 0,
            isBankrupt: true,
          },
        });

        for (let i = 0; i < affectedTiles.length; i++) {
          await tx.matchTile.update({
            where: { id: affectedTiles[i].id },
            data: {
              propertyId: shuffledPropertyIds[i] || null,
              ownerId: null,
              isRevealed: false,
              houses: 0,
              isMortgaged: false,
            },
          });
        }
        
        if (isGameOver) {
          await tx.match.update({
            where: { id: matchId },
            data: { status: "FINISHED", currentTurnId: null },
          });
        } else if (match.currentTurnId === playerId) {
          await tx.match.update({
            where: { id: matchId },
            data: { currentTurnId: nextPlayerId },
          });
        }
      });

      const logsPromise = Promise.all([
        logGameEvent(match.id, match.inviteCode, `💀 ${player.name} went bankrupt! ${affectedIndices.length} tiles reshuffled!`, "bankrupt"),
        isGameOver ? logGameEvent(match.id, match.inviteCode, `🏆 ${winner!.name} wins the game!`, "info") : Promise.resolve()
      ]);

      await Promise.all([dbPromise, logsPromise]);

      return NextResponse.json({ success: true, cappedPayment, debtErased: 0 });
    }


    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Bank action error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
