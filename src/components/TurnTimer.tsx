"use client";

import { useEffect, useState, useCallback } from "react";
import { useGameStore } from "@/store/game-store";
import { Clock } from "lucide-react";

export default function TurnTimer() {
  const { match, myPlayerId } = useGameStore();
  const [timeLeft, setTimeLeft] = useState<number>(0);

  const isMyTurn = match?.currentTurnId === myPlayerId;
  const turnEndsAt = match?.turnEndsAt ? new Date(match.turnEndsAt).getTime() : 0;

  const handleTimeUp = useCallback(async () => {
    if (!match || !myPlayerId) return;
    
    if (isMyTurn) {
      const store = useGameStore.getState();
      // If it's our turn and we haven't rolled, trigger auto-roll
      if (!match.hasRolled) {
        store.setAutoRollRequested(true);
        return;
      }
      
      // If we have rolled but have a pending action, it should auto-pass/resolve
      // (This will be handled in DiceRoller/ActionPanel via another timer)
    }

    // Fire end-turn to seize it (if not our turn) or force end (if it is our turn and we've rolled)
    try {
      await fetch("/api/game/end-turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: match.id, playerId: myPlayerId }),
      });
    } catch (error) {
      console.error("Failed to auto-end turn:", error);
    }
  }, [match, myPlayerId, isMyTurn]);

  useEffect(() => {
    if (!turnEndsAt || match?.status !== "PLAYING") {
      setTimeLeft(0);
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const diff = Math.max(0, turnEndsAt - now);
      
      setTimeLeft(diff);

      if (diff === 0) {
        clearInterval(interval);
        // Fallback: If timer hits zero, anyone can invoke turn seizure
        handleTimeUp();
      }
    }, 1000);

    // Initial check
    const diff = Math.max(0, turnEndsAt - Date.now());
    setTimeLeft(diff);
    if (diff === 0) {
      handleTimeUp();
    }

    return () => clearInterval(interval);
  }, [turnEndsAt, match?.status, handleTimeUp]);

  if (!match || match.status !== "PLAYING" || !turnEndsAt) return null;

  const seconds = Math.floor(timeLeft / 1000);
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");

  const isWarning = seconds <= 30;

  return (
    <div className={`flex items-center gap-2 px-4 py-2 rounded-xl backdrop-blur-md border ${
      isWarning 
        ? "bg-red-500/20 border-red-500/40 text-red-400" 
        : "bg-surface/50 border-outline-variant/30 text-zinc-300"
    }`}>
      <Clock size={16} className={isWarning ? "animate-pulse" : ""} />
      <span className="font-mono font-bold tracking-widest text-sm">
        {m}:{s}
      </span>
    </div>
  );
}
