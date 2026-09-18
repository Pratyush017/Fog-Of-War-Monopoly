import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serverBroadcast } from "@/lib/supabase-channels";
import { interceptCashInflow } from "@/lib/debt-utils";
import { logGameEvent } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const {
      matchId,
      tradeId,
      accepted,
      offeringPlayerId,
      targetPlayerId,
      offeredCash = 0,
      requestedCash = 0,
      offeredPropertyTileIds = [],
      requestedPropertyTileIds = [],
      actionId,
    } = await request.json();

    if (!matchId || !tradeId || !offeringPlayerId || !targetPlayerId) {
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
      return NextResponse.json({ error: "Invalid match state" }, { status: 400 });
    }

    const offeringPlayer = match.players.find((p) => p.id === offeringPlayerId);
    const targetPlayer = match.players.find((p) => p.id === targetPlayerId);

    if (!offeringPlayer || !targetPlayer) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    // ── 1. DECLINE TRADE ──
    if (!accepted) {
      await logGameEvent(
        match.id,
        match.inviteCode,
        `❌ ${targetPlayer.name} declined the trade offer from ${offeringPlayer.name}`,
        "info"
      );

      await serverBroadcast(match.inviteCode, {
        type: "trade-declined",
        payload: {
          tradeId,
          offeringPlayerId,
          targetPlayerId,
          targetPlayerName: targetPlayer.name,
        },
      });

      return NextResponse.json({ success: true, accepted: false });
    }

    // ── 2. ACCEPT TRADE: ATOMIC TRANSACTION WITH RACE-CONDITION VERIFICATION ──
    let summaryStr = "";
    let completedSets: { colorSet: string, color: string }[] = [];

    try {
      await prisma.$transaction(async (tx) => {
        // Fresh read inside transaction
        const freshOffering = await tx.player.findUnique({ where: { id: offeringPlayerId } });
        const freshTarget = await tx.player.findUnique({ where: { id: targetPlayerId } });

        if (!freshOffering || !freshTarget || freshOffering.isBankrupt || freshTarget.isBankrupt) {
          throw new Error("One of the players is no longer active in the match.");
        }

        // Check Trade Locks
        if (freshOffering.loanPrincipal > 0 && offeredPropertyTileIds.length > 0) {
          throw new Error("Offering player has an active loan (Trade Lock).");
        }
        if (freshTarget.loanPrincipal > 0 && requestedPropertyTileIds.length > 0) {
          throw new Error("Target player has an active loan (Trade Lock).");
        }

        // Check Cash Balances
        if (freshOffering.cash < offeredCash) {
          throw new Error(`${freshOffering.name} no longer has sufficient cash ($${freshOffering.cash} < $${offeredCash}).`);
        }
        if (freshTarget.cash < requestedCash) {
          throw new Error(`${freshTarget.name} no longer has sufficient cash ($${freshTarget.cash} < $${requestedCash}).`);
        }

        // Check Property Ownership & House Checks
        const freshTiles = await tx.matchTile.findMany({
          where: { matchId },
          include: { property: true },
        });

        for (const tileId of offeredPropertyTileIds) {
          const tile = freshTiles.find((t) => t.id === tileId);
          if (!tile || tile.ownerId !== offeringPlayerId) {
            throw new Error(`${freshOffering.name} no longer owns the offered property.`);
          }
          const colorSetTiles = freshTiles.filter((t) => t.property?.colorSet === tile.property?.colorSet);
          if (colorSetTiles.some((t) => t.houses > 0)) {
            throw new Error(`Houses exist on the ${tile.property?.colorSet} color set.`);
          }
        }

        for (const tileId of requestedPropertyTileIds) {
          const tile = freshTiles.find((t) => t.id === tileId);
          if (!tile || tile.ownerId !== targetPlayerId) {
            throw new Error(`${freshTarget.name} no longer owns the requested property.`);
          }
          const colorSetTiles = freshTiles.filter((t) => t.property?.colorSet === tile.property?.colorSet);
          if (colorSetTiles.some((t) => t.houses > 0)) {
            throw new Error(`Houses exist on the ${tile.property?.colorSet} color set.`);
          }
        }

        // Execute Swaps
        await interceptCashInflow(tx, offeringPlayerId, requestedCash - offeredCash);
        await interceptCashInflow(tx, targetPlayerId, offeredCash - requestedCash);

        for (const tileId of offeredPropertyTileIds) {
          await tx.matchTile.update({
            where: { id: tileId },
            data: { ownerId: targetPlayerId },
          });
        }

        for (const tileId of requestedPropertyTileIds) {
          await tx.matchTile.update({
            where: { id: tileId },
            data: { ownerId: offeringPlayerId },
          });
        }

        // ── 3. Check for newly completed sets ──
        const checkCompletion = (playerTileIds: string[], newOwnerId: string, ownerColor: string) => {
          const colorSetsToCheck = new Set<string>();
          for (const tileId of playerTileIds) {
            const t = freshTiles.find((t) => t.id === tileId);
            if (t?.property?.colorSet) colorSetsToCheck.add(t.property.colorSet);
          }
          
          for (const colorSet of colorSetsToCheck) {
            const allInSet = freshTiles.filter((t) => t.property?.colorSet === colorSet);
            // Simulate the swap (since freshTiles is from before the update)
            const ownedCount = allInSet.filter((t) => {
              if (playerTileIds.includes(t.id)) return true; // Just acquired
              if (t.ownerId === newOwnerId && !offeredPropertyTileIds.includes(t.id) && !requestedPropertyTileIds.includes(t.id)) return true; // Already owned and not traded away
              return false;
            }).length;
            
            if (ownedCount === allInSet.length && allInSet.length > 0) {
              completedSets.push({ colorSet, color: ownerColor });
            }
          }
        };

        checkCompletion(offeredPropertyTileIds, targetPlayerId, freshTarget.color);
        checkCompletion(requestedPropertyTileIds, offeringPlayerId, freshOffering.color);

        const offeredNames = freshTiles
          .filter((t) => offeredPropertyTileIds.includes(t.id))
          .map((t) => t.property?.name)
          .filter(Boolean)
          .join(", ");

        const requestedNames = freshTiles
          .filter((t) => requestedPropertyTileIds.includes(t.id))
          .map((t) => t.property?.name)
          .filter(Boolean)
          .join(", ");

        summaryStr = `Swapped $${offeredCash}${offeredNames ? ` + [${offeredNames}]` : ""} for $${requestedCash}${requestedNames ? ` + [${requestedNames}]` : ""}`;
        
        await tx.gameLog.create({
          data: {
            matchId: match.id,
            message: `🤝 Trade completed between ${freshOffering.name} and ${freshTarget.name}: ${summaryStr}`,
            type: "info"
          }
        });
      });
    } catch (txError: any) {

      await logGameEvent(
        match.id,
        match.inviteCode,
        `⚠️ Trade voided: ${txError?.message || "Terms could not be fulfilled"}`,
        "alert"
      );

      await serverBroadcast(match.inviteCode, {
        type: "trade-voided",
        payload: {
          tradeId,
          reason: txError?.message || "Trade conditions changed before acceptance.",
        },
      });

      return NextResponse.json(
        { error: txError?.message || "Trade failed to execute", voided: true },
        { status: 400 }
      );
    }

    await Promise.all([
      serverBroadcast(match.inviteCode, {
        type: "trade-accepted",
        actionId,
        payload: {
          tradeId,
          offeringPlayerId,
          targetPlayerId,
          summary: summaryStr,
          completedSets,
        },
      })
    ]);

    return NextResponse.json({
      success: true,
      accepted: true,
      summary: summaryStr,
    });
  } catch (error) {
    console.error("Trade respond error:", error);
    return NextResponse.json({ error: "Failed to respond to trade" }, { status: 500 });
  }
}
