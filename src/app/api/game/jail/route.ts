import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serverBroadcast } from "@/lib/supabase-channels";
import { logGameEvent } from "@/lib/logger";

export async function POST(request: Request) {
  try {
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
      // Pay $75 to get out and roll
      await prisma.$transaction([
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

      await Promise.all([
        serverBroadcast(match.inviteCode, {
          type: "jail-paid",
          actionId,
          payload: { playerId, amount: 75, type: "bail" },
        }),
        serverBroadcast(match.inviteCode, {
          type: "jail-freed",
          payload: { playerId },
        })
      ]);

      return NextResponse.json({ freed: true, action: "roll-now" });
    } else {
      // Pay $50 maintenance
      const newJailTurns = player.jailTurns + 1;
      const isFreed = newJailTurns >= 3;

      const txActions = [];
      txActions.push(
        prisma.player.update({
          where: { id: playerId },
          data: {
            cash: { decrement: 50 },
            jailTurns: isFreed ? 0 : newJailTurns,
            inJail: !isFreed,
          },
        })
      );
      txActions.push(
        prisma.gameLog.create({
          data: {
            matchId: match.id,
            message: `${player.name} paid $50 (maintenance)`,
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

      await prisma.$transaction(txActions);

      const broadcasts = [];
      broadcasts.push(
        serverBroadcast(match.inviteCode, {
          type: "jail-paid",
          actionId,
          payload: { playerId, amount: 50, type: "maintenance" },
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
      broadcasts.push(serverBroadcast(match.inviteCode, { type: "state-sync", payload: {} }));

      await Promise.all(broadcasts);

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
