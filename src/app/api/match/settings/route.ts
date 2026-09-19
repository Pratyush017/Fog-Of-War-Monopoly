import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serverBroadcast } from "@/lib/supabase-channels";

export async function POST(request: Request) {
  try {
    const { matchId, playerId, startingCash, mortgageRule, passUpRule, evenBuild, gameMode, enableBank } = await request.json();

    const match = await prisma.match.findUnique({ where: { id: matchId } });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    if (match.hostId !== playerId) {
      return NextResponse.json({ error: "Only host can update settings" }, { status: 403 });
    }

    if (match.status !== "LOBBY") {
      return NextResponse.json({ error: "Cannot change settings after game started" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (startingCash !== undefined) updateData.startingCash = Math.max(500, Math.min(5000, startingCash));
    if (mortgageRule !== undefined) updateData.mortgageRule = mortgageRule;
    if (passUpRule !== undefined) updateData.passUpRule = passUpRule;
    if (evenBuild !== undefined) updateData.evenBuild = evenBuild;
    if (gameMode !== undefined) updateData.gameMode = gameMode;
    if (enableBank !== undefined) updateData.enableBank = enableBank;

    await prisma.match.update({
      where: { id: matchId },
      data: updateData,
    });

    await serverBroadcast(match.inviteCode, {
      type: "settings-updated",
      payload: {
        startingCash: (updateData.startingCash as number) ?? match.startingCash,
        mortgageRule: (updateData.mortgageRule as string) ?? match.mortgageRule,
        passUpRule: (updateData.passUpRule as string) ?? match.passUpRule,
        evenBuild: (updateData.evenBuild as boolean) ?? match.evenBuild,
        enableBank: (updateData.enableBank as boolean) ?? match.enableBank ?? true,
        gameMode: (updateData.gameMode as 'CLASSIC' | 'FOG_OF_WAR') ?? match.gameMode,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Settings error:", error);
    return NextResponse.json({ error: "Failed to update settings", details: String(error) }, { status: 500 });
  }
}
