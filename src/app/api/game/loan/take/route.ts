import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serverBroadcast } from "@/lib/supabase-channels";
import { logGameEvent } from "@/lib/logger";

const NORMAL_LOAN_TIERS: Record<number, { principal: number; interestRate: number; turns: number }> = {
  200: { principal: 200, interestRate: 0.50, turns: 5 },
  400: { principal: 400, interestRate: 0.30, turns: 8 },
  600: { principal: 600, interestRate: 0.25, turns: 10 },
};

export async function POST(request: Request) {
  try {
    const { matchId, playerId, loanType, tier, amount } = await request.json();

    if (!matchId || !playerId || !loanType) {
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
      return NextResponse.json({ error: "Invalid match state" }, { status: 400 });
    }

    if (match.currentTurnId !== playerId) {
      return NextResponse.json({ error: "Can only take a loan during your turn" }, { status: 403 });
    }

    const player = match.players.find((p) => p.id === playerId);
    if (!player || player.isBankrupt) {
      return NextResponse.json({ error: "Invalid player" }, { status: 404 });
    }

    if (player.loanPrincipal > 0) {
      return NextResponse.json({ error: "You already have an active loan" }, { status: 400 });
    }

    if (player.isLiquidating) {
      return NextResponse.json({ error: "Cannot take a loan while in liquidation" }, { status: 400 });
    }

    // Calculate player's propertyNetWorth = sum of buy prices (property.price) of owned properties
    const ownedTiles = match.tiles.filter((t) => t.ownerId === playerId && t.property);
    const propertyNetWorth = ownedTiles.reduce((sum, t) => sum + (t.property?.price || 0), 0);

    let principal = 0;
    let interestRate = 0;
    let turnsDue = 0;

    if (loanType === "NORMAL") {
      const tierConfig = NORMAL_LOAN_TIERS[tier] || NORMAL_LOAN_TIERS[amount];
      if (!tierConfig) {
        return NextResponse.json({ error: "Invalid loan tier selected" }, { status: 400 });
      }

      principal = tierConfig.principal;
      interestRate = tierConfig.interestRate;
      turnsDue = tierConfig.turns;

      // Condition: Player's propertyNetWorth MUST be strictly greater than the loan principal
      if (propertyNetWorth <= principal) {
        return NextResponse.json(
          { error: `Property Net Worth ($${propertyNetWorth}) must be strictly greater than the loan principal ($${principal})` },
          { status: 400 }
        );
      }
    } else if (loanType === "BANKRUPTCY") {
      // Bankruptcy Loan Rules:
      // 1. Can only be taken if the player has hit $0 or negative cash
      if (player.cash > 0) {
        return NextResponse.json(
          { error: "Bankruptcy loan can only be taken when cash is $0 or negative" },
          { status: 400 }
        );
      }

      // 2. Cannot be taken if they previously defaulted
      if (player.hasDefaulted) {
        return NextResponse.json(
          { error: "Cannot take a bankruptcy loan after previously defaulting" },
          { status: 400 }
        );
      }

      // 3. Amount: Any value up to their propertyNetWorth
      const requestedAmount = Number(amount);
      if (!requestedAmount || requestedAmount <= 0) {
        return NextResponse.json({ error: "Invalid loan amount" }, { status: 400 });
      }

      if (propertyNetWorth <= 0) {
        return NextResponse.json({ error: "Must have owned properties with net worth > $0 to take a bankruptcy loan" }, { status: 400 });
      }

      if (requestedAmount > propertyNetWorth) {
        return NextResponse.json(
          { error: `Loan amount ($${requestedAmount}) exceeds maximum property net worth ($${propertyNetWorth})` },
          { status: 400 }
        );
      }

      principal = requestedAmount;
      interestRate = 0.20; // 20% interest
      turnsDue = 10; // strictly due in 10 turns
    } else {
      return NextResponse.json({ error: "Invalid loan type" }, { status: 400 });
    }

    const loanInterest = Math.ceil(principal * interestRate);
    const loanDeadlineTurn = player.turnsPlayed + turnsDue;

    // Apply loan transaction
    await prisma.player.update({
      where: { id: playerId },
      data: {
        cash: { increment: principal },
        loanType,
        loanPrincipal: principal,
        loanInterest: loanInterest,
        loanDeadlineTurn: loanDeadlineTurn,
        isLiquidating: false,
      },
    });

    const totalRepay = principal + loanInterest;
    await logGameEvent(
      match.id,
      match.inviteCode,
      `🏦 ${player.name} took a ${loanType} loan: +$${principal} (Total due: $${totalRepay} at Turn ${loanDeadlineTurn})`,
      "info"
    );

    await serverBroadcast(match.inviteCode, {
      type: "loan-taken",
      payload: {
        playerId,
        playerName: player.name,
        amount: principal,
        loanType,
        principal,
        interest: loanInterest,
        deadlineTurn: loanDeadlineTurn,
      },
    });

    await serverBroadcast(match.inviteCode, {
      type: "state-sync",
      payload: {},
    });

    return NextResponse.json({
      success: true,
      loanType,
      principal,
      interest: loanInterest,
      totalDue: totalRepay,
      deadlineTurn: loanDeadlineTurn,
    });
  } catch (error) {
    console.error("Take loan error:", error);
    return NextResponse.json({ error: "Failed to take loan" }, { status: 500 });
  }
}
