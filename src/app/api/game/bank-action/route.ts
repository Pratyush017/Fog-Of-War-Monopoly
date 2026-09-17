import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serverBroadcast } from "@/lib/supabase-channels";
import { shuffleArray, calculatePlayerNetWorth } from "@/lib/game-engine";
import { logGameEvent } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const { matchId, playerId, action } = await request.json();

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
      await prisma.$transaction(async (tx) => {
        await tx.player.update({
          where: { id: playerId },
          data: { cash: { increment: 600 } },
        });
      });

      await serverBroadcast(match.inviteCode, {
        type: "state-sync",
        payload: {},
      });

      await logGameEvent(match.id, match.inviteCode, `${player.name} took a $600 loan from the bank!`, "info");

      await serverBroadcast(match.inviteCode, {
        type: "loan-taken",
        payload: { playerId, playerName: player.name, amount: 600 },
      });

      return NextResponse.json({ success: true });
    } 
    else if (action === "BANKRUPTCY") {
      // ── Declare Bankruptcy ──
      // Calculate net worth and cap payment (to bank for self-declared bankruptcy)
      const ownedTiles = match.tiles.filter((t) => t.ownerId === playerId);
      const netWorth = calculatePlayerNetWorth(player.cash, ownedTiles);
      const cappedPayment = Math.min(netWorth, 0); // self-declared bankruptcy debtAmount is 0

      await prisma.$transaction(async (tx) => {
        // Bankrupt the player
        await tx.player.update({
          where: { id: playerId },
          data: {
            cash: 0,
            isBankrupt: true,
          },
        });

        // ── Seizure + Shuffle ──
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
        
        for (let i = 0; i < affectedTiles.length; i++) {
          const tile = affectedTiles[i];
          affectedIndices.push(tile.boardIndex);

          await tx.matchTile.update({
            where: { id: tile.id },
            data: {
              propertyId: shuffledPropertyIds[i] || null,
              ownerId: null,
              isRevealed: false,
              houses: 0,
              isMortgaged: false,
            },
          });
        }

        await logGameEvent(match.id, match.inviteCode, `💀 ${player.name} went bankrupt! ${affectedIndices.length} tiles reshuffled!`, "bankrupt");

        // Broadcast bankruptcy shuffle
        await serverBroadcast(match.inviteCode, {
          type: "bankruptcy-shuffle",
          payload: {
            bankruptPlayerId: playerId,
            creditorId: "bank",
            paidAmount: cappedPayment,
            affectedIndices,
          },
        });

        await serverBroadcast(match.inviteCode, {
          type: "player-bankrupt",
          payload: { playerId: playerId },
        });
      });

      // Check if game is over (only 1 player left)
      const activePlayers = match.players.filter(
        (p) => !p.isBankrupt && p.id !== playerId
      );

      if (activePlayers.length === 1) {
        const winner = activePlayers[0];
        await prisma.match.update({
          where: { id: matchId },
          data: { status: "FINISHED", currentTurnId: null },
        });
        await logGameEvent(match.id, match.inviteCode, `🏆 ${winner.name} wins the game!`, "info");
        await serverBroadcast(match.inviteCode, {
          type: "game-over",
          payload: { winnerId: winner.id, winnerName: winner.name },
        });
      } else {
        // Advance turn if it was the bankrupt player's turn
        if (match.currentTurnId === playerId) {
          const nextPlayers = activePlayers.sort((a, b) => a.turnOrder - b.turnOrder);
          const nextPlayer = nextPlayers[0];
          await prisma.match.update({
            where: { id: matchId },
            data: { currentTurnId: nextPlayer.id },
          });
          await serverBroadcast(match.inviteCode, {
            type: "turn-changed",
            payload: { currentTurnId: nextPlayer.id },
          });
        }
      }

      return NextResponse.json({ success: true, cappedPayment, debtErased: 0 });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Bank action error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
