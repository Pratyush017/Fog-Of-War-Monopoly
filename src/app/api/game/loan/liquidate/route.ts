import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serverBroadcast } from "@/lib/supabase-channels";
import { shuffleArray } from "@/lib/game-engine";
import { logGameEvent } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const serverReceivedTime = Date.now();
    const { matchId, playerId, action, tileId, actionId } = await request.json();

    if (!matchId || !playerId || !action) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
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
    if (!player || player.isBankrupt) {
      return NextResponse.json({ error: "Player not found or bankrupt" }, { status: 404 });
    }

    const ownedTiles = match.tiles.filter((t) => t.ownerId === playerId);
    const totalHousesOwned = ownedTiles.reduce((sum, t) => sum + t.houses, 0);
    const totalDebt = player.loanPrincipal + player.loanInterest;

    // ── 1. DEGRADE HOUSE / SELL UPGRADE ──
    if (action === "DEGRADE_HOUSE") {
      const tile = match.tiles.find((t) => t.id === tileId);
      if (!tile || tile.ownerId !== playerId || !tile.property) {
        return NextResponse.json({ error: "Tile not owned by player" }, { status: 403 });
      }

      if (tile.houses <= 0) {
        return NextResponse.json({ error: "No houses on this property to sell" }, { status: 400 });
      }

      const houseCost = tile.property.houseCost;
      const newCash = player.cash + houseCost;
      const newHouses = tile.houses - 1;

      const broadcastPromise = serverBroadcast(match.inviteCode, {
        actionId,
        type: "property-action",
        telemetry: { serverReceivedTime, serverBroadcastTime: Date.now() },
        payload: {
          playerId,
          boardIndex: tile.boardIndex,
          action: "DEGRADE",
          newCash,
          newHouses,
          newIsMortgaged: tile.isMortgaged,
          newOwnerId: playerId,
        },
        delta: {
          players: [{ id: playerId, cash: newCash }],
          tiles: [{ boardIndex: tile.boardIndex, houses: newHouses }]
        }
      });

      const dbPromise = prisma.$transaction([
        prisma.player.update({
          where: { id: playerId },
          data: { cash: { increment: houseCost } },
        }),
        prisma.matchTile.update({
          where: { id: tile.id },
          data: { houses: newHouses },
        }),
      ]);

      const logPromise = logGameEvent(
        match.id,
        match.inviteCode,
        `🏠 ${player.name} sold 1 house on ${tile.property.name} for +$${houseCost}`,
        "info"
      );

      await Promise.all([broadcastPromise, dbPromise, logPromise]);


      return NextResponse.json({
        success: true,
        newCash,
        newHouses,
        remainingDebt: totalDebt,
        canSettle: newCash >= totalDebt,
      });
    }

    // ── 2. SURRENDER PROPERTY TO BANK ──
    if (action === "SURRENDER_PROPERTY") {
      // RULE: Must sell ALL houses before surrendering any property
      if (totalHousesOwned > 0) {
        return NextResponse.json(
          { error: "Must degrade and sell all houses on properties before surrendering any property" },
          { status: 400 }
        );
      }

      const tile = match.tiles.find((t) => t.id === tileId);
      if (!tile || tile.ownerId !== playerId || !tile.property) {
        return NextResponse.json({ error: "Tile not owned by player" }, { status: 403 });
      }

      // Logic: player.cash += property.price. Remove property ownership (ownerId = null). Wipe houses to 0.
      const surrenderValue = tile.property.price;
      const newCash = player.cash + surrenderValue;

      const broadcastPromise = serverBroadcast(match.inviteCode, {
        actionId,
        type: "property-action",
        telemetry: { serverReceivedTime, serverBroadcastTime: Date.now() },
        payload: {
          playerId,
          boardIndex: tile.boardIndex,
          action: "SURRENDER",
          newCash,
          newHouses: 0,
          newIsMortgaged: false,
          newOwnerId: null,
        },
        delta: {
          players: [{ id: playerId, cash: newCash }],
          tiles: [{ boardIndex: tile.boardIndex, ownerId: null, houses: 0, isMortgaged: false, isRevealed: false }]
        }
      });

      const dbPromise = prisma.$transaction([
        prisma.player.update({
          where: { id: playerId },
          data: { cash: { increment: surrenderValue } },
        }),
        prisma.matchTile.update({
          where: { id: tile.id },
          data: {
            ownerId: null,
            houses: 0,
            isMortgaged: false,
            isRevealed: false,
          },
        }),
      ]);

      const logPromise = logGameEvent(
        match.id,
        match.inviteCode,
        `🏛️ ${player.name} surrendered ${tile.property.name} to the bank for +$${surrenderValue}`,
        "info"
      );

      await Promise.all([broadcastPromise, dbPromise, logPromise]);


      return NextResponse.json({
        success: true,
        newCash,
        remainingDebt: totalDebt,
        canSettle: newCash >= totalDebt,
      });
    }

    // ── 3. SETTLE DEBT ──
    if (action === "SETTLE_DEBT") {
      if (player.cash < totalDebt) {
        return NextResponse.json(
          { error: `Insufficient cash ($${player.cash}) to settle remaining debt ($${totalDebt})` },
          { status: 400 }
        );
      }

      const updatedCash = player.cash - totalDebt;

      const broadcastPromises = [
        serverBroadcast(match.inviteCode, {
          actionId,
          type: "loan-repaid",
          telemetry: { serverReceivedTime, serverBroadcastTime: Date.now() },
          payload: {
            playerId,
            playerName: player.name,
            amount: totalDebt,
          },
          delta: {
            players: [{
              id: playerId, cash: updatedCash, loanType: null, loanPrincipal: 0, loanInterest: 0, loanDeadlineTurn: null, isLiquidating: false
            }]
          }
        }),
        serverBroadcast(match.inviteCode, {
          type: "liquidation-completed",
          payload: { playerId },
        })
      ];

      const dbPromise = prisma.player.update({
        where: { id: playerId },
        data: {
          cash: updatedCash,
          loanType: null,
          loanPrincipal: 0,
          loanInterest: 0,
          loanDeadlineTurn: null,
          isLiquidating: false,
        },
      });

      const logPromise = logGameEvent(
        match.id,
        match.inviteCode,
        `🎉 ${player.name} paid $${totalDebt} to settle debt! Liquidation resolved.`,
        "info"
      );

      await Promise.all([...broadcastPromises, dbPromise, logPromise]);


      return NextResponse.json({
        success: true,
        isLiquidating: false,
        newCash: updatedCash,
      });
    }

    // ── 4. TOTAL DEFAULT (BANKRUPTCY LOAN ELIMINATION) ──
    if (action === "DECLARE_DEFAULT") {
      // Trigger total elimination: player isBankrupt = true, hasDefaulted = true
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
          paidAmount: player.cash,
          affectedIndices,
        },
        delta: {
          players: [{ id: playerId, cash: 0, isBankrupt: true, hasDefaulted: true, isLiquidating: false, loanType: null, loanPrincipal: 0, loanInterest: 0, loanDeadlineTurn: null }],
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
            hasDefaulted: true,
            isLiquidating: false,
            loanType: null,
            loanPrincipal: 0,
            loanInterest: 0,
            loanDeadlineTurn: null,
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
        logGameEvent(match.id, match.inviteCode, `💀 ${player.name} defaulted on their loan and went bankrupt! ${affectedIndices.length} tiles reshuffled.`, "bankrupt"),
        isGameOver ? logGameEvent(match.id, match.inviteCode, `🏆 ${winner!.name} wins the game!`, "info") : Promise.resolve()
      ]);

      await Promise.all([dbPromise, logsPromise]);


      return NextResponse.json({ success: true, isBankrupt: true });
    }

    return NextResponse.json({ error: "Invalid liquidation action" }, { status: 400 });
  } catch (error) {
    console.error("Liquidation error:", error);
    return NextResponse.json({ error: "Failed to process liquidation" }, { status: 500 });
  }
}
