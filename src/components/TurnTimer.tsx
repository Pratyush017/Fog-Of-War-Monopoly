"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useGameStore } from "@/store/game-store";
import { Clock } from "lucide-react";

export default function TurnTimer() {
  const { match, myPlayerId } = useGameStore();
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const hasFiredRef = useRef<boolean>(false);

  const isMyTurn = match?.currentTurnId === myPlayerId;
  const turnEndsAt = match?.turnEndsAt ? new Date(match.turnEndsAt).getTime() : 0;

  // Reset the timeUp fired flag whenever turn or turnEndsAt changes
  useEffect(() => {
    hasFiredRef.current = false;
  }, [match?.currentTurnId, turnEndsAt]);

  const handleTimeUp = useCallback(async () => {
    if (!match || !myPlayerId) return;
    
    const store = useGameStore.getState();
    const currentMatch = store.match;
    if (!currentMatch || currentMatch.status !== "PLAYING") return;

    if (isMyTurn) {
      const activePlayer = store.players.find((p) => p.id === myPlayerId);

      // Case 1: Active player is in Jail and hasn't rolled
      if (activePlayer?.inJail && !currentMatch.hasRolled) {
        if ((activePlayer.cash ?? 0) < 200) {
          // Free roll allowed! Trigger auto-roll
          store.setAutoRollRequested(true);
          return;
        } else {
          // Has >= $200: Pay maintenance and end turn
          try {
            await fetch("/api/game/jail", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ matchId: currentMatch.id, playerId: myPlayerId, action: "wait" }),
            });
            store.setPendingAction(null);
            await fetch("/api/game/end-turn", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ matchId: currentMatch.id, playerId: myPlayerId }),
            });
          } catch (error) {
            console.error("Failed to auto-resolve jail:", error);
          }
          return;
        }
      }

      // Case 2: Active player has NOT rolled the dice -> trigger auto-roll sequence
      if (!currentMatch.hasRolled) {
        store.setAutoRollRequested(true);
        return;
      }

      // Case 3: Active player has rolled and has a pending buy prompt
      if (store.pendingAction?.type === "buy-prompt") {
        try {
          await fetch("/api/game/pass", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ matchId: currentMatch.id, playerId: myPlayerId }),
          });
          store.setPendingAction(null);

          if (currentMatch.passUpRule !== "AUCTION") {
            await fetch("/api/game/end-turn", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ matchId: currentMatch.id, playerId: myPlayerId }),
            });
          }
        } catch (error) {
          console.error("Failed to auto-pass prompt:", error);
        }
        return;
      }

      // Case 4: Active player has rolled and has a pending jail choice
      if (store.pendingAction?.type === "jail-choice") {
        try {
          await fetch("/api/game/jail", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ matchId: currentMatch.id, playerId: myPlayerId, action: "wait" }),
          });
          store.setPendingAction(null);
          await fetch("/api/game/end-turn", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ matchId: currentMatch.id, playerId: myPlayerId }),
          });
        } catch (error) {
          console.error("Failed to auto-resolve jail choice:", error);
        }
        return;
      }

      // Case 5: Active player has rolled and turn is ready to be ended (no active auction)
      if (!store.auction.active) {
        try {
          await fetch("/api/game/end-turn", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ matchId: currentMatch.id, playerId: myPlayerId }),
          });
        } catch (error) {
          console.error("Failed to auto-end turn:", error);
        }
      }
      return;
    }

    // Fallback for OTHER players if the active player is disconnected / AFK
    setTimeout(async () => {
      const freshStore = useGameStore.getState();
      const freshMatch = freshStore.match;
      if (!freshMatch || freshMatch.status !== "PLAYING") return;
      if (freshMatch.currentTurnId === myPlayerId) return; // Turn already passed to us

      const freshTurnEndsAt = freshMatch.turnEndsAt ? new Date(freshMatch.turnEndsAt).getTime() : 0;
      if (Date.now() < freshTurnEndsAt + 3500) return; // Still within active player's execution window
      if (freshMatch.currentTurnId !== match.currentTurnId) return; // Turn already advanced

      try {
        const activePlayer = freshStore.players.find((p) => p.id === freshMatch.currentTurnId);
        if ((activePlayer?.debtAmount ?? 0) > 0 || (activePlayer?.cash ?? 0) < 0) {
          await fetch("/api/game/end-turn", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ matchId: freshMatch.id, playerId: myPlayerId }),
          });
        } else if (!freshMatch.hasRolled) {
          await fetch("/api/game/roll", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ matchId: freshMatch.id, playerId: myPlayerId, isAutoRoll: true }),
          });
        } else {
          await fetch("/api/game/end-turn", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ matchId: freshMatch.id, playerId: myPlayerId }),
          });
        }
      } catch (error) {
        console.error("Failed to execute turn seizure:", error);
      }
    }, 4000);
  }, [match, myPlayerId, isMyTurn]);

  useEffect(() => {
    if (!turnEndsAt || match?.status !== "PLAYING") {
      setTimeLeft(0);
      return;
    }

    const checkTime = () => {
      const now = Date.now();
      const diff = Math.max(0, turnEndsAt - now);
      setTimeLeft(diff);

      if (diff === 0) {
        if (!hasFiredRef.current) {
          hasFiredRef.current = true;
          handleTimeUp();
        }
      }
    };

    // Initial check
    checkTime();

    const interval = setInterval(checkTime, 500);
    return () => clearInterval(interval);
  }, [turnEndsAt, match?.status, handleTimeUp]);

  if (!match || match.status !== "PLAYING" || !turnEndsAt) return null;

  // 5-second buffer: If remaining time is > 180s (3 minutes), the timer has not appeared/started yet
  if (timeLeft > 180 * 1000) {
    return null;
  }

  const seconds = Math.min(180, Math.floor(timeLeft / 1000));
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");

  const isWarning = seconds <= 30;

  return (
    <div
      className={`flex items-center gap-2 px-4 py-2 rounded-xl backdrop-blur-md border transition-all duration-300 animate-in fade-in ${
        isWarning
          ? "bg-red-500/20 border-red-500/40 text-red-400"
          : "bg-surface/50 border-outline-variant/30 text-zinc-300"
      }`}
    >
      <Clock size={16} className={isWarning ? "animate-pulse" : ""} />
      <span className="font-mono font-bold tracking-widest text-sm">
        {m}:{s}
      </span>
    </div>
  );
}
