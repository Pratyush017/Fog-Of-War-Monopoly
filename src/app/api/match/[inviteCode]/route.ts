import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ inviteCode: string }> }
) {
  try {
    const { inviteCode } = await params;

    const match = await prisma.match.findUnique({
      where: { inviteCode: inviteCode.toUpperCase() },
      include: {
        players: {
          orderBy: { turnOrder: "asc" },
        },
        tiles: {
          include: { property: true },
          orderBy: { boardIndex: "asc" },
        },
        logs: {
          orderBy: { createdAt: "desc" },
          take: 15,
        },
      },
    });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    match.logs = match.logs.reverse();

    return NextResponse.json({ match });
  } catch (error) {
    console.error("Fetch match error:", error);
    return NextResponse.json({ error: "Failed to fetch match" }, { status: 500 });
  }
}
