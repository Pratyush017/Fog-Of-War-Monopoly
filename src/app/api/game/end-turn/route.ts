import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serverBroadcast } from "@/lib/supabase-channels";
import { logGameEvent } from "@/lib/logger";
import { calculateNextActivePlayer } from "@/lib/game-engine";
import { resolveForcedBankruptcy } from "@/lib/debt-utils";

export async function POST(request: Request) {
  try {
    const { matchId, playerId, actionId } = await request.json();

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { players: true },
    });

    if (!match || match.status !== "PLAYING") {
      return NextResponse.json({ error: "Invalid match" }, { status: 400 });
    }

    const caller = match.players.find((p) => p.id === playerId);
    if (!caller) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    // Security Check: Turn Seizure
    let isSeizure = false;
    if (match.currentTurnId !== playerId) {
      // Caller is NOT the active player. Check if they are authorized to seize the turn.
      if (!match.turnEndsAt || new Date() > match.turnEndsAt) {
         // Valid seizure!
         isSeizure = true;
      } else {
        return NextResponse.json({ error: "Not your turn and time is not up!" }, { status: 403 });
      }
    }

    const activePlayer = match.players.find((p) => p.id === match.currentTurnId) || caller;
    if (!activePlayer) {
      return NextResponse.json({ error: "Active player not found" }, { status: 404 });
    }

    // ── Check if active player is in liquidation ──
    if (activePlayer.isLiquidating) {
      return NextResponse.json(
        { error: "Must resolve debt liquidation before ending turn", isLiquidating: true },
        { status: 400 }
      );
    }

    // ── Negative balance / Debt check ──
    if (activePlayer.cash < 0 || activePlayer.debtAmount > 0) {
      if (isSeizure) {
        // Force bankruptcy because time expired while in debt!
        await prisma.$transaction(async (tx) => {
          await resolveForcedBankruptcy(tx, match.id, activePlayer.id);
        });

        await logGameEvent(
          match.id,
          match.inviteCode,
          `💀 ${activePlayer.name} ran out of time while in debt and was forced into bankruptcy!`,
          "alert"
        );

        await serverBroadcast(match.inviteCode, {
          type: "player-bankrupt",
          payload: { playerId: activePlayer.id },
        });
      } else {
        return NextResponse.json(
          { error: "Cannot end turn while in debt. Mortgage or sell properties to clear your debt, or declare bankruptcy." },
          { status: 400 }
        );
      }
    }

    // ── Check Loan Maturity Deadline ──
    if (
      activePlayer.loanPrincipal > 0 &&
      activePlayer.loanDeadlineTurn !== null &&
      activePlayer.turnsPlayed >= activePlayer.loanDeadlineTurn
    ) {
      const totalDebt = activePlayer.loanPrincipal + activePlayer.loanInterest;

      if (activePlayer.cash >= totalDebt) {
        // Auto-deduct debt
        const updatedCash = activePlayer.cash - totalDebt;
        await prisma.player.update({
          where: { id: activePlayer.id },
          data: {
            cash: updatedCash,
            loanType: null,
            loanPrincipal: 0,
            loanInterest: 0,
            loanDeadlineTurn: null,
            isLiquidating: false,
          },
        });

        await logGameEvent(
          match.id,
          match.inviteCode,
          `💰 ${activePlayer.name}'s loan matured: Paid $${totalDebt} to the bank. Debt settled!`,
          "info"
        );

        await serverBroadcast(match.inviteCode, {
          type: "loan-repaid",
          payload: {
            playerId: activePlayer.id,
            playerName: activePlayer.name,
            amount: totalDebt,
          },
        });
      } else {
        // Insufficient cash: Deduct ALL available cash, remaining balance becomes new totalDebt, trigger liquidation
        const availableCash = Math.max(0, activePlayer.cash);
        const remainingDebt = totalDebt - availableCash;

        await prisma.player.update({
          where: { id: activePlayer.id },
          data: {
            cash: 0,
            loanPrincipal: remainingDebt,
            loanInterest: 0,
            isLiquidating: true,
          },
        });

        await logGameEvent(
          match.id,
          match.inviteCode,
          `⚠️ ${activePlayer.name} could not repay loan ($${totalDebt})! Seized $${availableCash} cash. Remaining $${remainingDebt} entered forced liquidation!`,
          "alert"
        );

        await serverBroadcast(match.inviteCode, {
          type: "liquidation-started",
          payload: {
            playerId: activePlayer.id,
            remainingDebt,
          },
        });

        await serverBroadcast(match.inviteCode, { type: "state-sync", payload: {} });

        // DO NOT end the turn!
        return NextResponse.json({
          success: false,
          isLiquidating: true,
          remainingDebt,
          message: "Loan is due! Must liquidate assets to repay remaining debt.",
        });
      }
    }

    // Advance turn: Increment turnsPlayed for the player who just finished their turn
    // and Advance turn to next player in a single transaction
    const nextPlayerId = calculateNextActivePlayer(match.players, activePlayer.id);

    if (!nextPlayerId) {
      return NextResponse.json({ success: true });
    }
    
    const nextPlayerName = match.players.find(p => p.id === nextPlayerId)?.name || "Unknown";

    // Reset hasRolled and set new turnEndsAt (+3 mins)
    const newTurnEndsAt = new Date(Date.now() + 3 * 60 * 1000);

    await prisma.$transaction([
      prisma.player.update({
        where: { id: activePlayer.id },
        data: { turnsPlayed: { increment: 1 } },
      }),
      prisma.match.update({
        where: { id: matchId },
        data: { 
          currentTurnId: nextPlayerId,
          hasRolled: false,
          turnEndsAt: newTurnEndsAt
        },
      }),
      prisma.gameLog.create({
        data: {
          matchId: match.id,
          message: `It's now ${nextPlayerName}'s turn!`,
          type: "info",
        }
      })
    ]);

    // Send the broadcast to clients via WebSocket server
    await serverBroadcast(match.inviteCode, {
      type: "turn-changed",
      actionId,
      payload: { 
        currentTurnId: nextPlayerId,
        turnEndsAt: newTurnEndsAt.toISOString(),
        hasRolled: false
      },
    });

    return NextResponse.json({ success: true, nextTurnId: nextPlayerId });
  } catch (error) {
    console.error("End turn error:", error);
    return NextResponse.json({ error: "Failed to end turn" }, { status: 500 });
  }
}
