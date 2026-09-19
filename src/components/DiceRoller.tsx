"use client";
import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "@/store/game-store";
import { useGameSounds } from "@/hooks/useGameSounds";
import { calculateNextActivePlayer, registerOptimisticAction } from "@/lib/game-engine";
import TurnTimer from "./TurnTimer";

const orientations: Record<number, { x: number; y: number }> = {
  1: { x: 0,    y: 0   },
  6: { x: 0,    y: 180 },
  2: { x: 0,    y: 90  },
  5: { x: 0,    y: -90 },
  3: { x: -90,  y: 0   },
  4: { x: 90,   y: 0   }
};

function DiceCube({ value, rolling, spinId, index }: { value: number; rolling: boolean; spinId: number; index: number }) {
  const [transform, setTransform] = useState(`rotateX(-28deg) rotateY(35deg)`);
  const [shadowOpacity, setShadowOpacity] = useState(1);

  useEffect(() => {
    if (rolling && spinId) {
      const o = orientations[value] || orientations[1];
      const rand1 = (spinId % 10) / 10;
      const rand2 = ((spinId / 10) % 10) / 10;
      const spinsX = 360 * (2 + Math.floor(rand1 * 2));
      const spinsY = 360 * (2 + Math.floor(rand2 * 2));
      const extraSpinZ = index === 0 ? 8 : -8;

      setTransform(`rotateX(${-10 + spinsX + o.x}deg) rotateY(${10 + spinsY + o.y}deg) rotateZ(${extraSpinZ}deg)`);
      
      setShadowOpacity(0.4);
      const timer = setTimeout(() => {
        setShadowOpacity(1);
      }, 250);
      return () => clearTimeout(timer);
    } else {
      // Static state (initial or after roll or other player's roll)
      const o = orientations[value] || orientations[1];
      const extraSpinZ = index === 0 ? 8 : -8;
      
      // Incorporate previous spin rotations so we don't unwind back to 0 degrees
      const rand1 = spinId ? (spinId % 10) / 10 : 0;
      const rand2 = spinId ? ((spinId / 10) % 10) / 10 : 0;
      const spinsX = spinId ? 360 * (2 + Math.floor(rand1 * 2)) : 0;
      const spinsY = spinId ? 360 * (2 + Math.floor(rand2 * 2)) : 0;

      setTransform(`rotateX(${-10 + spinsX + o.x}deg) rotateY(${10 + spinsY + o.y}deg) rotateZ(${extraSpinZ}deg)`);
    }
  }, [rolling, spinId, value, index]);

  return (
    <div className="scene">
      <div className={`cube ${rolling ? "rolling" : ""}`} style={{ transform }}>
        <div className="cube-face f1">
          <span/><span/><span/>
          <span/><span className="pip on p-c"/><span/>
          <span/><span/><span/>
        </div>
        <div className="cube-face f2">
          <span className="pip on p-tl"/><span/><span/>
          <span/><span/><span/>
          <span/><span/><span className="pip on p-br"/>
        </div>
        <div className="cube-face f3">
          <span/><span/><span className="pip on p-tr"/>
          <span/><span className="pip on p-c"/><span/>
          <span className="pip on p-bl"/><span/><span/>
        </div>
        <div className="cube-face f4">
          <span className="pip on p-tl"/><span/><span className="pip on p-tr"/>
          <span/><span/><span/>
          <span className="pip on p-bl"/><span/><span className="pip on p-br"/>
        </div>
        <div className="cube-face f5">
          <span className="pip on p-tl"/><span/><span className="pip on p-tr"/>
          <span/><span className="pip on p-c"/><span/>
          <span className="pip on p-bl"/><span/><span className="pip on p-br"/>
        </div>
        <div className="cube-face f6">
          <span className="pip on p-tl"/><span/><span className="pip on p-tr"/>
          <span className="pip on p-ml"/><span/><span className="pip on p-mr"/>
          <span className="pip on p-bl"/><span/><span className="pip on p-br"/>
        </div>
      </div>
      <div className="dice-shadow" style={{ opacity: shadowOpacity }}></div>
    </div>
  );
}

export default function DiceRoller() {
  const router = useRouter();
  const { dice, match, myPlayerId, pendingAction, setDice, clearDice, autoRollRequested, setAutoRollRequested } = useGameStore();
  const { playRoll, playJail, playNotification } = useGameSounds();
  const [fetching, setFetching] = useState(false);
  const [spinId, setSpinId] = useState(0);
  const [isRolling, setIsRolling] = useState(false);

  const myPlayer = useGameStore((state) => state.players).find(p => p.id === myPlayerId);
  const hasNegativeBalance = (myPlayer?.cash ?? 0) < 0;
  const hasPlayerDebt = (myPlayer?.debtAmount ?? 0) > 0;
  const inDebt = hasNegativeBalance || hasPlayerDebt;

  const isMyTurn = match?.currentTurnId === myPlayerId;
  const rolling = !!(dice?.rolling) || isRolling;
  const canRoll = isMyTurn && !rolling && !fetching && !pendingAction && !match?.hasRolled && !inDebt;

  const handleRoll = useCallback(async (isAutoRollOrEvent?: boolean | React.MouseEvent) => {
    const isAutoRoll = typeof isAutoRollOrEvent === "boolean" ? isAutoRollOrEvent : false;
    const store = useGameStore.getState();
    const currentMatch = store.match;
    const player = store.players.find(p => p.id === myPlayerId);
    
    if (!currentMatch || currentMatch.currentTurnId !== myPlayerId) return null;
    if ((player?.cash ?? 0) < 0 || (player?.debtAmount ?? 0) > 0) return null;
    
    const actionId = registerOptimisticAction("roll");
    const start = performance.now();
    (window as any)._lastAction = { type: 'roll', start, actionId };

    // If we already know we're in jail locally with >= $200 cash, prompt for jail choice (otherwise roll for free)
    if (player?.inJail && (player?.cash ?? 0) >= 200) {
      store.setPendingAction({ type: "jail-choice" });
      return null;
    }

    // Disable button and start animation
    setIsRolling(true);
    setFetching(true);
    
    (window as any)._lastAction.local = performance.now();

    // Optimistically start the dice spin animation immediately!
    setSpinId(Date.now());
    playRoll();
    setDice({
      die1: Math.floor(Math.random() * 6) + 1,
      die2: Math.floor(Math.random() * 6) + 1,
      total: 0,
      isDoubles: false,
      rolling: true
    });

    const fetchStartTime = Date.now();

    try {
      const res = await fetch("/api/game/roll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: currentMatch.id, playerId: myPlayerId, actionId, isAutoRoll }),
      });

      const data = await res.json();
      
      (window as any)._lastAction.netEnd = performance.now();
      const a = (window as any)._lastAction;
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[TIMELINE: ROLL] Click -> Local: ${(a.local - a.start).toFixed(2)}ms | Click -> NetEnd: ${(a.netEnd - a.start).toFixed(2)}ms`);
      }

      if (data.requiresJailDecision) {
        setIsRolling(false);
        clearDice();
        useGameStore.getState().setPendingAction({ type: "jail-choice" });
        return data;
      }
      
      if (data.dice) {
        setDice({ 
          die1: data.dice.die1, 
          die2: data.dice.die2, 
          total: data.dice.total, 
          isDoubles: data.dice.isDoubles, 
          rolling: true 
        });
        
        // Update hasRolled locally based on whether it was doubles
        useGameStore.getState().updateMatch({ hasRolled: !data.dice.isDoubles });
      }

      // Guarantee the animation plays for AT LEAST 800ms total
      const elapsed = Date.now() - fetchStartTime;
      if (elapsed < 800) {
        await new Promise(resolve => setTimeout(resolve, 800 - elapsed));
      }
      
      setIsRolling(false);
      
      // Lock dice in final position
      if (data.dice) {
        setDice({ die1: data.dice.die1, die2: data.dice.die2, total: data.dice.total, isDoubles: data.dice.isDoubles, rolling: false });
      }

      const freshStore = useGameStore.getState();
      const tileType = data.landedTileType;
      const landedAt = data.landedBoardIndex ?? data.newPosition;

      // ── Handle Jail breakout / remaining in jail ──
      if (data.wasInJail && myPlayerId) {
        if (!data.isFreedFromJail) {
          freshStore.updatePlayer(myPlayerId, { position: 10, inJail: true, jailTurns: data.jailTurns });
          freshStore.updateMatch({ hasRolled: true });
          return data;
        } else {
          freshStore.updatePlayer(myPlayerId, { inJail: false, jailTurns: 0 });
        }
      }

      // ── Handle GO_TO_JAIL: two-step animation ──
      if (tileType === "GO_TO_JAIL" && myPlayerId) {
        freshStore.updatePlayer(myPlayerId, { position: landedAt });
        await new Promise(resolve => setTimeout(resolve, 200));
        freshStore.updatePlayer(myPlayerId, { position: 10, inJail: true });
        playJail();
      }
      // ── Standard movement ──
      if (data.newPosition !== undefined && myPlayerId && tileType !== "GO_TO_JAIL") {
        freshStore.updatePlayer(myPlayerId, { position: data.newPosition });
      }

      // Short delay for token landing animation before showing action prompts or cards
      await new Promise(resolve => setTimeout(resolve, 350));

      // ── Handle Landing Effects ──
      if (tileType === "TAX") {
        playNotification();
      } else if ((tileType === "CHANCE" || tileType === "CHEST") && myPlayerId) {
        if (data.card) {
          playNotification();
          freshStore.setActionCardReveal({
            type: tileType === "CHANCE" ? "CHANCE" : "CHEST",
            description: data.card.description,
          });
          
          if (data.card.effect === "jail") {
            await new Promise(resolve => setTimeout(resolve, 800));
            freshStore.updatePlayer(myPlayerId, { position: 10, inJail: true });
            playJail();
          } else if (data.card.effect === "move" && data.card.moveTo !== undefined) {
            await new Promise(resolve => setTimeout(resolve, 800));
            freshStore.updatePlayer(myPlayerId, { position: data.card.moveTo });
          }
        }
      }

      // Only queue buy-prompt if manual roll (auto-roll passes/auctions automatically)
      if (res.ok && data.action === "buy-prompt" && !isAutoRoll) {
        freshStore.setPendingAction({
          type: "buy-prompt",
          boardIndex: data.newPosition,
        });
      }

      return data;
    } catch (error) {
      console.error("Roll failed:", error);
      setIsRolling(false);
      return null;
    } finally {
      setFetching(false);
    }
  }, [myPlayerId, playRoll, playJail, playNotification, setDice, clearDice]);

  const handleEndTurn = useCallback(async () => {
    const store = useGameStore.getState();
    const currentMatch = store.match;
    if (!currentMatch || !myPlayerId) return;

    const currentPlayer = store.players.find(p => p.id === myPlayerId);
    if ((currentPlayer?.cash ?? 0) < 0 && (currentMatch.turnEndsAt && new Date() < new Date(currentMatch.turnEndsAt))) {
      return;
    }

    setFetching(true);

    // -- Optimistic UI --
    const prevTurnId = currentMatch.currentTurnId;
    const prevHasRolled = currentMatch.hasRolled;
    
    const nextPlayerId = calculateNextActivePlayer(store.players, myPlayerId);
    if (nextPlayerId) {
      store.updateMatch({ currentTurnId: nextPlayerId, hasRolled: false });
    }
    const actionId = registerOptimisticAction("end-turn");

    try {
      const res = await fetch("/api/game/end-turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: currentMatch.id, playerId: myPlayerId, actionId }),
      });
      const data = await res.json();
      
      if (!res.ok) {
        store.updateMatch({ currentTurnId: prevTurnId, hasRolled: prevHasRolled });
        alert(data.error || data.message || "Failed to end turn");
      }
      
      if (data.isLiquidating) {
        store.updatePlayer(myPlayerId, {
          isLiquidating: true,
          cash: 0,
          loanPrincipal: data.remainingDebt,
          loanInterest: 0,
        });
      }
    } catch (error) {
      console.error("Failed to end turn:", error);
      store.updateMatch({ currentTurnId: prevTurnId, hasRolled: prevHasRolled });
      alert("Network error: Failed to end turn");
    } finally {
      setFetching(false);
    }
  }, [myPlayerId]);

  // ── Auto-Roll Sequence (Handles timeout auto-rolling and chained doubles) ──
  const handleAutoRollSequence = useCallback(async () => {
    let continueRolling = true;
    let consecutiveDoublesCount = 0;

    while (continueRolling) {
      const store = useGameStore.getState();
      const currentMatch = store.match;
      const currentPlayer = store.players.find(p => p.id === myPlayerId);

      if (!currentMatch || currentMatch.currentTurnId !== myPlayerId || currentMatch.status !== "PLAYING") {
        break;
      }

      // If in debt, cannot roll
      if ((currentPlayer?.cash ?? 0) < 0 || (currentPlayer?.debtAmount ?? 0) > 0) {
        break;
      }

      const rollResult = await handleRoll(true);

      if (!rollResult || !rollResult.dice) {
        break;
      }

      const isDoubles = rollResult.dice.isDoubles;
      const isJailed =
        rollResult.landedTileType === "GO_TO_JAIL" ||
        (rollResult.card && rollResult.card.effect === "jail") ||
        useGameStore.getState().players.find(p => p.id === myPlayerId)?.inJail;
      const isAuction =
        rollResult.landedTileType === "PROPERTY" && currentMatch.passUpRule === "AUCTION";

      if (isAuction) {
        // Auction started, let auction overlay take over
        break;
      }

      if (isDoubles && !isJailed) {
        consecutiveDoublesCount++;
        if (consecutiveDoublesCount >= 3) {
          // Speeding rule: 3 doubles in a row sends to Jail
          try {
            await fetch("/api/game/jail", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ matchId: currentMatch.id, playerId: myPlayerId, action: "wait" }),
            });
          } catch (e) {
            console.error("Speeding jail failed:", e);
          }
          await new Promise(resolve => setTimeout(resolve, 800));
          await handleEndTurn();
          break;
        }

        // Wait for token animation and effects to settle, then roll again in loop!
        await new Promise(resolve => setTimeout(resolve, 1400));
      } else {
        // Not doubles (or jailed) -> finish auto-roll sequence and end turn
        continueRolling = false;
        await new Promise(resolve => setTimeout(resolve, 1200));
        await handleEndTurn();
        break;
      }
    }
  }, [handleRoll, handleEndTurn, myPlayerId]);

  useEffect(() => {
    if (autoRollRequested) {
      setAutoRollRequested(false);
      handleAutoRollSequence();
    }
  }, [autoRollRequested, handleAutoRollSequence, setAutoRollRequested]);

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Dice display */}
      <div className="scene-row">
        <DiceCube value={dice?.die1 || 1} rolling={rolling} spinId={spinId} index={0} />
        <DiceCube value={dice?.die2 || 1} rolling={rolling} spinId={spinId} index={1} />
      </div>

      <div className="flex flex-col items-center gap-2">
        {/* Result display */}
        {dice && !rolling && dice.total > 0 && (
          <div className="text-center h-8 flex items-center gap-2">
            <span className="font-mono font-bold text-lg text-[var(--text-primary)]">
              {dice.total}
            </span>
            {dice.isDoubles && (
              <span className="text-xs font-bold text-[var(--accent-amber)] bg-[rgba(245,158,11,0.15)] px-2 py-0.5 rounded-full">
                DOUBLES!
              </span>
            )}
          </div>
        )}
        {(!dice || rolling || dice.total === 0) && (
          <div className="h-8" />
        )}

        <div className="flex justify-center w-full mb-2 min-h-[42px]">
          <TurnTimer />
        </div>

        {/* Actions row */}
        {isMyTurn && (
          <div className="flex flex-col items-center gap-4">
            <div className="flex gap-2">
              <button
                onClick={handleRoll}
                disabled={!canRoll}
                className={`px-8 py-3.5 rounded-xl bg-gradient-to-r from-cyan-950/60 via-[#162a34] to-cyan-950/60 hover:from-cyan-900/80 hover:to-cyan-900/80 active:scale-[0.98] border border-cyan-500/40 hover:border-cyan-400 text-cyan-300 hover:text-white font-semibold text-xs tracking-wider uppercase transition-all duration-200 shadow-[0_0_20px_rgba(6,182,212,0.15)] hover:shadow-[0_0_25px_rgba(6,182,212,0.25)] flex items-center justify-center gap-2 group ${!canRoll ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span>{fetching ? "Rolling..." : "Roll Dice"}</span>
                <svg className="w-4 h-4 text-cyan-400 group-hover:rotate-12 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
                  <circle cx="15.5" cy="15.5" r="1.5" fill="currentColor"/>
                </svg>
              </button>
              {match?.hasRolled && (
                <button
                  onClick={handleEndTurn}
                  disabled={fetching || rolling || !!pendingAction || inDebt}
                  className={`btn-secondary px-6 py-3 transition-colors ${
                    inDebt 
                      ? 'bg-red-900/50 text-red-500/50 border-red-900/50 cursor-not-allowed' 
                      : 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20 hover:border-red-500/40'
                  }`}
                >
                  End Turn
                </button>
              )}
            </div>
            
            {inDebt && (
              <div className="mt-2 bg-red-950/80 border border-red-700 text-red-200 text-xs px-4 py-2 rounded max-w-[280px] text-center shadow-lg animate-pulse">
                <span className="font-bold">
                  {hasPlayerDebt ? `Clear your debt to roll — $${myPlayer?.debtAmount} remaining!` : "Negative Balance!"}
                </span><br/>
                Mortgage properties, trade, or declare bankruptcy to continue.
              </div>
            )}
          </div>
        )}

        {myPlayer?.isBankrupt ? (
          <div className="flex flex-col items-center gap-2 mt-2 bg-[#1c1612]/90 border border-[#8B2500]/60 px-4 py-2.5 rounded-xl text-center shadow-lg backdrop-blur-sm">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-200/90 uppercase tracking-wider font-serif">
              <span className="text-red-400">💀</span>
              <span>Bankrupt • Spectating Match</span>
            </div>
            <button
              onClick={() => router.push("/")}
              className="text-[11px] font-sans font-medium text-amber-300/80 hover:text-amber-100 underline decoration-amber-500/40 underline-offset-2 hover:decoration-amber-300 transition-colors"
            >
              Leave to Main Menu
            </button>
          </div>
        ) : !isMyTurn && match?.currentTurnId ? (
          <p className="text-xs text-[var(--text-muted)]">
            Waiting for other player...
          </p>
        ) : null}
      </div>
    </div>
  );
}
