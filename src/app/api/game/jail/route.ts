import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serverBroadcast } from "@/lib/supabase-channels";
import { logGameEvent } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const serverReceivedTime = Date.now();
    const { matchId, playerId, action, actionId } = await request.json();
    // action: "bail" (pay $75 to roll) or "wait" (pay $50 maintenance)

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { players: true, tiles: { include: { property: true } } },
    });

    if (!match || match.status !== "PLAYING") {
      return NextResponse.json({ error: "Invalid match" }, { status: 400 });
    }

    const player = match.players.find((p) => p.id === playerId);
    if (!player || !player.inJail) {
      return NextResponse.json({ error: "Player not in jail" }, { status: 400 });
    }

    if (action === "bail") {
      const broadcastPromises = [
        serverBroadcast(match.inviteCode, {
          type: "jail-paid",
          actionId,
          telemetry: { serverReceivedTime, serverBroadcastTime: Date.now() },
          payload: { playerId, amount: 75, type: "bail" },
          delta: {
            players: [{
              id: playerId,
              cash: player.cash - 75,
              inJail: false,
              jailTurns: 0,
            }]
          }
        }),
        serverBroadcast(match.inviteCode, {
          type: "jail-freed",
          payload: { playerId },
        })
      ];

      const dbPromise = prisma.$transaction([
        prisma.player.update({
          where: { id: playerId },
          data: {
            cash: { decrement: 75 },
            inJail: false,
            jailTurns: 0,
          },
        }),
        prisma.gameLog.create({
          data: {
            matchId: match.id,
            message: `${player.name} paid $75 (bail)`,
            type: "jail"
          }
        })
      ]);

      await Promise.all([...broadcastPromises, dbPromise]);

      return NextResponse.json({ freed: true, action: "roll-now" });
    } else {
      // Maintenance: $50 if cash >= 200, $0 if cash < 200
      const maintenanceFee = player.cash >= 200 ? 50 : 0;
      const newJailTurns = player.jailTurns + 1;
      const isFreed = newJailTurns >= 3;

      const txActions = [];
      txActions.push(
        prisma.player.update({
          where: { id: playerId },
          data: {
            cash: maintenanceFee > 0 ? { decrement: maintenanceFee } : undefined,
            jailTurns: isFreed ? 0 : newJailTurns,
            inJail: !isFreed,
          },
        })
      );
      txActions.push(
        prisma.gameLog.create({
          data: {
            matchId: match.id,
            message: maintenanceFee > 0
              ? `${player.name} paid $${maintenanceFee} (maintenance)`
              : `${player.name} took turn in Jail (Turn ${newJailTurns}/3 - Maintenance waived)`,
            type: "jail"
          }
        })
      );

      if (isFreed) {
        txActions.push(
          prisma.gameLog.create({
            data: {
              matchId: match.id,
              message: `${player.name} was freed after 3 turns in jail!`,
              type: "jail"
            }
          })
        );
      } else {
        txActions.push(
          prisma.match.update({
            where: { id: matchId },
            data: { hasRolled: true },
          })
        );
      }

      const broadcasts = [];
      broadcasts.push(
        serverBroadcast(match.inviteCode, {
          type: "jail-paid",
          actionId,
          telemetry: { serverReceivedTime, serverBroadcastTime: Date.now() },
          payload: { playerId, amount: maintenanceFee, type: "maintenance" },
          delta: {
            players: [{
              id: playerId,
              cash: player.cash - maintenanceFee,
              jailTurns: isFreed ? 0 : newJailTurns,
              inJail: !isFreed,
            }],
            match: isFreed ? undefined : { hasRolled: true }
          }
        })
      );
      if (isFreed) {
        broadcasts.push(
          serverBroadcast(match.inviteCode, {
            type: "jail-freed",
            payload: { playerId },
          })
        );
      }

      await Promise.all([...broadcasts, prisma.$transaction(txActions)]);

      if (isFreed) {
        return NextResponse.json({ freed: true, action: "roll-now", forcedRelease: true });
      }

      return NextResponse.json({ freed: false, jailTurns: newJailTurns });
    }
  } catch (error) {
    console.error("Jail action error:", error);
    return NextResponse.json({ error: "Failed to process jail action" }, { status: 500 });
  }
}
