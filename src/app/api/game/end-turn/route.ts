import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serverBroadcast } from "@/lib/supabase-channels";
import { logGameEvent } from "@/lib/logger";
import { calculateNextActivePlayer } from "@/lib/game-engine";
import { resolveForcedBankruptcy } from "@/lib/debt-utils";

export async function POST(request: Request) {
  try {
    const serverReceivedTime = Date.now();
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
    const isTimeExpired = match.turnEndsAt && new Date() >= match.turnEndsAt;
    if (activePlayer.cash < 0 || activePlayer.debtAmount > 0) {
      if (isSeizure || isTimeExpired) {
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
        const broadcastPromise = serverBroadcast(match.inviteCode, {
          type: "loan-repaid",
          telemetry: { serverReceivedTime, serverBroadcastTime: Date.now() },
          payload: {
            playerId: activePlayer.id,
            playerName: activePlayer.name,
            amount: totalDebt,
          },
          delta: {
            players: [{
              id: activePlayer.id,
              cash: updatedCash,
              loanType: null,
              loanPrincipal: 0,
              loanInterest: 0,
              loanDeadlineTurn: null,
              isLiquidating: false,
            }]
          }
        });

        const dbPromise = prisma.player.update({
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

        const logPromise = logGameEvent(
          match.id,
          match.inviteCode,
          `💰 ${activePlayer.name}'s loan matured: Paid $${totalDebt} to the bank. Debt settled!`,
          "info"
        );

        await Promise.all([broadcastPromise, dbPromise, logPromise]);
      } else {
        // Insufficient cash: Deduct ALL available cash, remaining balance becomes new totalDebt, trigger liquidation
        const availableCash = Math.max(0, activePlayer.cash);
        const remainingDebt = totalDebt - availableCash;

        const broadcastPromise = serverBroadcast(match.inviteCode, {
          type: "liquidation-started",
          telemetry: { serverReceivedTime, serverBroadcastTime: Date.now() },
          payload: {
            playerId: activePlayer.id,
            remainingDebt,
          },
          delta: {
            players: [{
              id: activePlayer.id,
              cash: 0,
              loanPrincipal: remainingDebt,
              loanInterest: 0,
              isLiquidating: true,
            }]
          }
        });

        const dbPromise = prisma.player.update({
          where: { id: activePlayer.id },
          data: {
            cash: 0,
            loanPrincipal: remainingDebt,
            loanInterest: 0,
            isLiquidating: true,
          },
        });

        const logPromise = logGameEvent(
          match.id,
          match.inviteCode,
          `⚠️ ${activePlayer.name} could not repay loan ($${totalDebt})! Seized $${availableCash} cash. Remaining $${remainingDebt} entered forced liquidation!`,
          "alert"
        );

        await Promise.all([broadcastPromise, dbPromise, logPromise]);


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

    // Reset hasRolled and set new turnEndsAt (+5s buffer before 3 min timer starts)
    const newTurnEndsAt = new Date(Date.now() + 5000 + 3 * 60 * 1000);

    // 1. Broadcast immediately
    const broadcastPromise = serverBroadcast(match.inviteCode, {
      type: "turn-changed",
      actionId,
      telemetry: { serverReceivedTime, serverBroadcastTime: Date.now() },
      payload: { 
        currentTurnId: nextPlayerId,
        turnEndsAt: newTurnEndsAt.toISOString(),
        hasRolled: false
      },
      delta: {
        players: [{ id: activePlayer.id, turnsPlayed: activePlayer.turnsPlayed + 1 }],
        match: { currentTurnId: nextPlayerId, hasRolled: false, turnEndsAt: newTurnEndsAt }
      }
    });

    // 2. Persist to DB
    const dbPromise = prisma.$transaction([
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

    await Promise.all([broadcastPromise, dbPromise]);

    return NextResponse.json({ success: true, nextTurnId: nextPlayerId });
  } catch (error) {
    console.error("End turn error:", error);
    return NextResponse.json({ error: "Failed to end turn" }, { status: 500 });
  }
}
