"use client";
import { useState, useCallback, useEffect } from "react";
import { useGameStore } from "@/store/game-store";
import { useGameSounds } from "@/hooks/useGameSounds";
import { calculateNextActivePlayer, registerOptimisticAction } from "@/lib/game-engine";

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
  const { dice, match, myPlayerId, pendingAction, setDice, autoRollRequested, setAutoRollRequested } = useGameStore();
  const { playRoll, playJail } = useGameSounds();
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
    
    if (!canRoll || !match) return;
    
    const actionId = registerOptimisticAction("roll");
    const start = performance.now();
    (window as any)._lastAction = { type: 'roll', start, actionId };
    
    const myPlayer = useGameStore.getState().players.find(p => p.id === myPlayerId);

    // If we already know we're in jail locally, don't even start the optimistic spin
    if (myPlayer?.inJail) {
      useGameStore.getState().setPendingAction({ type: "jail-choice" });
      return;
    }

    // Disable button and show loading state but DO NOT start spinning yet
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

    // Record the time we started the fetch so we can guarantee a minimum animation duration
    const fetchStartTime = Date.now();

    try {
      const res = await fetch("/api/game/roll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: match.id, playerId: myPlayerId, actionId, isAutoRoll }),
      });

      const data = await res.json();
      
      (window as any)._lastAction.netEnd = performance.now();
      const a = (window as any)._lastAction;
      console.log(`[TIMELINE: ROLL] Click -> Local: ${(a.local - a.start).toFixed(2)}ms | Click -> NetEnd: ${(a.netEnd - a.start).toFixed(2)}ms`);

      if (data.requiresJailDecision) {
        setIsRolling(false);
        setDice(null); // Stop rolling animation if they actually couldn't roll
        useGameStore.getState().setPendingAction({ type: "jail-choice" });
        return;
      }
      
      // We got the real results! Update the rolling dice with the actual values
      // (They keep spinning, but now we know what they will land on)
      if (data.dice) {
        setDice({ 
          die1: data.dice.die1, 
          die2: data.dice.die2, 
          total: data.dice.total, 
          isDoubles: data.dice.isDoubles, 
          rolling: true 
        });
        
        // Optimistically update hasRolled locally based on if it was doubles!
        useGameStore.getState().updateMatch({ hasRolled: !data.dice.isDoubles });
      }

      // Guarantee the animation plays for AT LEAST 800ms total
      const elapsed = Date.now() - fetchStartTime;
      if (elapsed < 800) {
        await new Promise(resolve => setTimeout(resolve, 800 - elapsed));
      }
      
      setIsRolling(false);
      
      // Update global dice state to stop rolling, locking them in their final position
      if (data.dice) {
        setDice({ die1: data.dice.die1, die2: data.dice.die2, total: data.dice.total, isDoubles: data.dice.isDoubles, rolling: false });
      }

      const store = useGameStore.getState();
      const tileType = data.landedTileType;
      const landedAt = data.landedBoardIndex ?? data.newPosition;

      // ── Handle GO_TO_JAIL: two-step animation ──
      if (tileType === "GO_TO_JAIL" && myPlayerId) {
        // Step 1: Move piece to the Go To Jail tile (position 30)
        store.updatePlayer(myPlayerId, { position: landedAt });
        // Step 2: Brief pause so user sees the piece land, then move to Jail
        await new Promise(resolve => setTimeout(resolve, 200));
        store.updatePlayer(myPlayerId, { position: 10, inJail: true });
        playJail();
      }
      // ── Handle CHANCE / CHEST: show card immediately ──
      else if ((tileType === "CHANCE" || tileType === "CHEST") && myPlayerId) {
        // Move piece to the card tile
        store.updatePlayer(myPlayerId, { position: landedAt });
        // Show card reveal instantly (no waiting for broadcast)
        if (data.card) {
          store.setActionCardReveal({
            type: tileType === "CHANCE" ? "CHANCE" : "CHEST",
            description: data.card.description,
          });
          // If the card sends to jail, animate the jail movement after a brief pause
          if (data.card.effect === "jail") {
            await new Promise(resolve => setTimeout(resolve, 300));
            store.updatePlayer(myPlayerId, { position: 10, inJail: true });
          }
          // If the card moves to a position, animate that
          else if (data.card.effect === "move" && data.card.moveTo !== undefined) {
            await new Promise(resolve => setTimeout(resolve, 300));
            store.updatePlayer(myPlayerId, { position: data.card.moveTo });
          }
        }
      }
      // ── Standard movement ──
      else if (data.newPosition !== undefined && myPlayerId) {
        store.updatePlayer(myPlayerId, { position: data.newPosition });
      }

      // Short delay for token landing animation before showing action prompts
      await new Promise(resolve => setTimeout(resolve, 350));

      // We only queue the buy-prompt if it was returned
      if (res.ok && data.action === "buy-prompt") {
        store.setPendingAction({
          type: "buy-prompt",
          boardIndex: data.newPosition,
        });
      }
    } catch (error) {
      console.error("Roll failed:", error);
      setIsRolling(false);
    } finally {
      setFetching(false);
    }
  }, [canRoll, match, myPlayerId, playRoll]);

  useEffect(() => {
    if (autoRollRequested && canRoll) {
      handleRoll(true);
      setAutoRollRequested(false);
    } else if (autoRollRequested) {
      setAutoRollRequested(false);
    }
  }, [autoRollRequested, canRoll, handleRoll, setAutoRollRequested]);

  const handleEndTurn = useCallback(async () => {
    if (!match || !myPlayerId || fetching || hasNegativeBalance) return;
    setFetching(true);

    // -- Optimistic UI --
    const prevTurnId = match.currentTurnId;
    const prevHasRolled = match.hasRolled;
    const store = useGameStore.getState();
    
    const nextPlayerId = calculateNextActivePlayer(store.players, myPlayerId);

    if (nextPlayerId) {
      store.updateMatch({ currentTurnId: nextPlayerId, hasRolled: false });
    }
    const actionId = registerOptimisticAction("end-turn");

    try {
      const res = await fetch("/api/game/end-turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: match.id, playerId: myPlayerId, actionId }),
      });
      const data = await res.json();
      
      if (!res.ok) {
        // Rollback
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
      // Rollback
      store.updateMatch({ currentTurnId: prevTurnId, hasRolled: prevHasRolled });
      alert("Network error: Failed to end turn");
    } finally {
      setFetching(false);
    }
  }, [match, myPlayerId, fetching]);

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

        {!isMyTurn && match?.currentTurnId && (
          <p className="text-xs text-[var(--text-muted)]">
            Waiting for other player...
          </p>
        )}
      </div>
    </div>
  );
}
