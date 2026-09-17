import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serverBroadcast } from "@/lib/supabase-channels";
import { PLAYER_COLORS } from "@/lib/game-engine";

export async function POST(request: Request) {
  try {
    const { inviteCode, playerName, color: requestColor, avatar } = await request.json();

    if (!inviteCode || !playerName) {
      return NextResponse.json({ error: "Invite code and player name required" }, { status: 400 });
    }

    const match = await prisma.match.findUnique({
      where: { inviteCode: inviteCode.toUpperCase() },
      include: { players: true },
    });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    if (match.status !== "LOBBY") {
      return NextResponse.json({ error: "Match already started" }, { status: 400 });
    }

    if (match.players.length >= 12) {
      return NextResponse.json({ error: "Match is full (max 12 players)" }, { status: 400 });
    }

    // Check for duplicate player names (case-insensitive)
    const nameTaken = match.players.some(
      (p) => p.name.toLowerCase() === playerName.trim().toLowerCase()
    );
    if (nameTaken) {
      return NextResponse.json(
        { error: "A player with that name is already in the lobby. Please choose a different name." },
        { status: 400 }
      );
    }

    if (avatar) {
      const isAvatarTaken = match.players.some((p) => p.avatar === avatar);
      if (isAvatarTaken) {
        return NextResponse.json({ error: "That character is already taken by another player!" }, { status: 400 });
      }
    }

    const usedColors = match.players.map((p) => p.color);
    
    if (requestColor && usedColors.includes(requestColor)) {
      return NextResponse.json({ error: "That color is already taken by another player!" }, { status: 400 });
    }

    const availableColors = PLAYER_COLORS.filter((c) => !usedColors.includes(c));
    const finalColor = requestColor && !usedColors.includes(requestColor) 
      ? requestColor 
      : (availableColors.length > 0 
          ? availableColors[Math.floor(Math.random() * availableColors.length)]
          : PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)]);

    const player = await prisma.player.create({
      data: {
        matchId: match.id,
        name: playerName,
        avatar: avatar || null,
        turnOrder: match.players.length,
        color: finalColor,
      },
    });

    // Broadcast player joined
    await serverBroadcast(inviteCode, {
      type: "player-joined",
      payload: {
        playerId: player.id,
        name: player.name,
        avatar: player.avatar ?? undefined,
        color: player.color,
      },
    });

    return NextResponse.json({
      matchId: match.id,
      playerId: player.id,
      playerName: player.name,
    });
  } catch (error) {
    console.error("Join match error:", error);
    return NextResponse.json({ error: "Failed to join match" }, { status: 500 });
  }
}
