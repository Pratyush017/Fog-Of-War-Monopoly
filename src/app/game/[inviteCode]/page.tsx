"use client";

import { useEffect, useCallback, useState, use, useRef } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "@/store/game-store";
import { useGameSounds } from "@/hooks/useGameSounds";
import { subscribeToMatch, unsubscribeFromMatch, type GameEvent } from "@/lib/supabase-channels";
import Board from "@/components/Board";
import IncomingTradeModal from "@/components/IncomingTradeModal";

export default function GamePage({ params }: { params: Promise<{ inviteCode: string }> }) {
  const { inviteCode } = use(params);
  const router = useRouter();
  const { playNotification, playJail, playFullUpgrade, playBoughtAllSets } = useGameSounds();
  const [loading, setLoading] = useState(true);
  const [gameOver, setGameOver] = useState<{ winnerId: string; winnerName: string } | null>(null);

  const {
    setMatch,
    setPlayers,
    setTiles,
    setMyPlayerId,
    updateMatch,
    updatePlayer,
    updateTile,
    revealTile,
    addEvent,
    addPlayer,
    setAuction,
    resetAuction,
    resetStore,
    setShufflingTiles,
    setPendingAction,
    setDice,
    players,
  } = useGameStore();
  const myPlayerIdRef = useRef<string | null>(null);

  useEffect(() => {
    myPlayerIdRef.current = sessionStorage.getItem("playerId");
  }, []);

  const setEventLog = useGameStore((state) => state.setEventLog);
  const currentTurnId = useGameStore((state) => state.match?.currentTurnId);
  const prevTurnIdRef = useRef<string | undefined>(undefined);
  
  useEffect(() => {
    if (currentTurnId && currentTurnId !== prevTurnIdRef.current) {
      prevTurnIdRef.current = currentTurnId;
    }
  }, [currentTurnId]);

  // Fetch initial game state
  const fetchGameState = useCallback(async () => {
    try {
      const res = await fetch(`/api/match/${inviteCode}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        router.push("/");
        return;
      }

      const match = data.match;

      if (match.status === "LOBBY") {
        router.push(`/lobby/${inviteCode}`);
        return;
      }

      setMatch({
        id: match.id,
        inviteCode: match.inviteCode,
        status: match.status,
        hostId: match.hostId,
        currentTurnId: match.currentTurnId,
        startingCash: match.startingCash,
        mortgageRule: match.mortgageRule,
        passUpRule: match.passUpRule,
        turnEndsAt: match.turnEndsAt,
        hasRolled: match.hasRolled,
        evenBuild: match.evenBuild,
        gameMode: match.gameMode,
        enableBank: match.enableBank,
      });

      setPlayers(match.players);
      setTiles(match.tiles);
      setEventLog(match.logs || []);

      const pid = sessionStorage.getItem("playerId");
      if (pid) setMyPlayerId(pid);

      // Restore pending buy prompt if reload happens mid-turn
      if (pid && match.currentTurnId === pid) {
        const myPlayer = match.players.find((p: any) => p.id === pid);
        if (myPlayer) {
          const landedTile = match.tiles[myPlayer.position];
          if (landedTile && landedTile.type === "PROPERTY" && !landedTile.ownerId) {
            // Must be pending a buy or auction!
            useGameStore.getState().setPendingAction({ type: "buy-prompt", boardIndex: myPlayer.position });
          }
        }
      }

      if (match.status === "FINISHED") {
        const activePlayers = match.players.filter((p: { isBankrupt: boolean }) => !p.isBankrupt);
        if (activePlayers.length === 1) {
          setGameOver({ winnerId: activePlayers[0].id, winnerName: activePlayers[0].name });
        }
      }
    } catch (error) {
      console.error("Failed to fetch game state:", error);
    } finally {
      setLoading(false);
    }
  }, [inviteCode, router, setMatch, setPlayers, setTiles, setMyPlayerId, setEventLog]);

  useEffect(() => {
    useGameStore.getState().resetStore();
    fetchGameState();
  }, [fetchGameState]);

  // Handle realtime events
  const handleGameEvent = useCallback(
    (event: GameEvent) => {
      const a = (window as any)._lastAction;
      if (a) {
        const echo = performance.now();
        console.log(`[TIMELINE: ECHO] Event received (${event.type}). Click -> Echo: ${(echo - a.start).toFixed(2)}ms`);
      }
      
      const win = window as any;
      let isOwnAction = false;
      if (event.actionId && win._processedActions?.has(event.actionId)) {
        isOwnAction = true;
        win._processedActions.delete(event.actionId);
        console.log(`[DEDUPE] Recognized and pruned own action: ${event.actionId}`);
        
        // We drop the event to prevent redundant state writes, EXCEPT for 'dice-rolled' 
        // which might need to process other things (or maybe we drop that too, since optimistic handled it).
        // Actually, if we optimistic updated it, we should completely drop the echo to prevent any flicker!
        return; 
      }
      
      const currentPlayers = useGameStore.getState().players;

      switch (event.type) {
        case "player-joined":
          addPlayer({
            id: event.payload.playerId,
            matchId: "",
            name: event.payload.name,
            avatar: event.payload.avatar ?? null,
            cash: 0,
            position: 0,
            inJail: false,
            jailTurns: 0,
            isBankrupt: false,
            turnOrder: currentPlayers.length,
            color: event.payload.color ?? "#ffffff",
            turnsPlayed: 0,
            loanType: null,
            loanPrincipal: 0,
            loanInterest: 0,
            loanDeadlineTurn: null,
            isLiquidating: false,
            hasDefaulted: false,
          });
          
          break;

        case "game-started":
          updateMatch({ status: "PLAYING", currentTurnId: event.payload.currentTurnId, turnEndsAt: event.payload.turnEndsAt, hasRolled: event.payload.hasRolled });
          
          fetchGameState(); // Refresh full state
          break;

        case "new-log":
          addEvent(event.payload);
          break;

        case "dice-rolled": {
          if (isOwnAction) {
             // We already animated this locally in DiceRoller.tsx, so skip re-triggering.
             // We can safely remove it from the processed set now.
             useGameStore.getState().removeProcessedAction(event.actionId!);
             break;
          }

          // The dice state update triggers the 550ms 3D CSS spin animation.
          setDice({
            die1: event.payload.dice[0],
            die2: event.payload.dice[1],
            total: event.payload.dice[0] + event.payload.dice[1],
            isDoubles: event.payload.isDoubles,
            rolling: true,
          });

          // Wait exactly 550ms before showing the log to sync perfectly with the dice landing!
          setTimeout(() => {
            const roller = useGameStore.getState().players.find((p) => p.id === event.payload.playerId);
            
            
            // Mark rolling as false
            setDice({
              die1: event.payload.dice[0],
              die2: event.payload.dice[1],
              total: event.payload.dice[0] + event.payload.dice[1],
              isDoubles: event.payload.isDoubles,
              rolling: false,
            });
            if (event.payload.hasRolled !== undefined) {
              updateMatch({ hasRolled: event.payload.hasRolled });
            }
            if (event.payload.newPosition !== undefined) {
              updatePlayer(event.payload.playerId, { position: event.payload.newPosition });
            }
          }, 550);
          break;
        }

        case "player-moved": {
          // Skip for local player — DiceRoller already moved the piece optimistically
          if (event.payload.playerId !== myPlayerIdRef.current) {
            updatePlayer(event.payload.playerId, { position: event.payload.to });
          }
          break;
        }

        case "tile-bought": {
          const buyer = currentPlayers.find((p) => p.id === event.payload.ownerId);
          revealTile(
            event.payload.boardIndex,
            event.payload.propertyId,
            event.payload.ownerId,
            {
              id: event.payload.propertyId,
              name: event.payload.propertyName,
              colorSet: event.payload.colorSet,
              price: 0,
              rent: [0],
              houseCost: 0,
              originalMortgage: 0,
              isUtility: false,
              isTransit: false,
            }
          );
          
          // Check for set completion
          const colorSet = event.payload.colorSet;
          if (colorSet) {
            const storeTiles = useGameStore.getState().tiles;
            const allInSet = storeTiles.filter(t => t.property?.colorSet === colorSet);
            const ownedCount = allInSet.filter(t => t.ownerId === event.payload.ownerId || t.boardIndex === event.payload.boardIndex).length;
            if (ownedCount === allInSet.length && allInSet.length > 0) {
              playBoughtAllSets();
              useGameStore.getState().setCompletedSetHighlight({ colorSet, color: buyer?.color || "white", timestamp: Date.now() });
            }
          }
          
          // Optimistically update cash if provided
          if (typeof event.payload.newCash === 'number') {
            updatePlayer(event.payload.ownerId, { cash: event.payload.newCash });
          }

          // Re-fetch to get accurate property data
          fetchGameState();
          
          break;
        }

        case "tile-passed":
          
          break;

        case "rent-paid": {
          const payer = currentPlayers.find((p) => p.id === event.payload.payerId);
          const owner = currentPlayers.find((p) => p.id === event.payload.ownerId);
          
          fetchGameState(); // Refresh cash
          break;
        }

        case "property-action": {
          const { playerId, boardIndex, action, newCash, newHouses, newIsMortgaged, newOwnerId } = event.payload;
          const actor = currentPlayers.find(p => p.id === playerId);
          
          updatePlayer(playerId, { cash: newCash });
          updateTile(boardIndex, {
            houses: newHouses,
            isMortgaged: newIsMortgaged,
            ownerId: newOwnerId,
          });
          
          if (action === "BUILD" && newHouses === 5) {
            playFullUpgrade();
          }

          break;
        }

        case "auction-start":
          setAuction({
            active: true,
            boardIndex: event.payload.boardIndex,
            currentBid: event.payload.startingBid,
            currentBidderId: null,
            currentBidderName: null,
            timeLeft: 6,
          });
          
          break;

        case "bid-placed":
          setAuction({
            currentBid: event.payload.amount,
            currentBidderId: event.payload.playerId,
            currentBidderName: event.payload.playerName,
            timeLeft: 15,
          });
          
          break;

        case "auction-won": {
          const winner = currentPlayers.find((p) => p.id === event.payload.winnerId);
          resetAuction();
          
          fetchGameState();
          break;
        }

        case "jail-entered": {
          // Skip for local player — DiceRoller already animated jail entry optimistically
          if (event.payload.playerId !== myPlayerIdRef.current) {
            updatePlayer(event.payload.playerId, { inJail: true, position: 10 });
          }
          playJail();
          break;
        }

        case "jail-paid": {
          const jailee = currentPlayers.find((p) => p.id === event.payload.playerId);
          
          fetchGameState();
          break;
        }

        case "jail-freed": {
          updatePlayer(event.payload.playerId, { inJail: false, jailTurns: 0 });
          break;
        }

        case "turn-changed":
          updateMatch({ currentTurnId: event.payload.currentTurnId, turnEndsAt: event.payload.turnEndsAt, hasRolled: event.payload.hasRolled });
          setPendingAction(null);
          fetchGameState(); // Sync all state
          break;

        case "bankruptcy-shuffle": {
          const bankrupt = currentPlayers.find(
            (p) => p.id === event.payload.bankruptPlayerId
          );
          

          // Trigger shuffle animation
          setShufflingTiles(event.payload.affectedIndices);
          setTimeout(() => {
            setShufflingTiles([]);
            fetchGameState(); // Refresh board after animation
          }, 1500);
          break;
        }

        case "player-bankrupt":
          updatePlayer(event.payload.playerId, { isBankrupt: true, cash: 0 });
          playJail();
          break;

        case "chance-card":
        case "chest-card": {
          const cardPlayer = currentPlayers.find((p) => p.id === event.payload.playerId);
          // Local player already showed the card via DiceRoller optimistic handling
          if (event.payload.playerId !== myPlayerIdRef.current) {
            playNotification();
            useGameStore.getState().setActionCardReveal({
              type: event.type === "chance-card" ? "CHANCE" : "CHEST",
              description: event.payload.description,
            });
          }
          fetchGameState();
          break;
        }

        case "tax-paid": {
          setTimeout(() => {
            const taxPayer = currentPlayers.find((p) => p.id === event.payload.playerId);
            fetchGameState();
          }, 550);
          break;
        }

        case "go-collect": {
          setTimeout(() => {
            const collector = useGameStore.getState().players.find((p) => p.id === event.payload.playerId);
            if (!collector) return;
            const amount = event.payload.amount;
            updatePlayer(collector.id, { cash: collector.cash + amount });
          }, 550);
          break;
        }

        case "game-over":
          setGameOver({ winnerId: event.payload.winnerId, winnerName: event.payload.winnerName });
          updateMatch({ status: "FINISHED" });
          
          break;

        case "loan-taken":
        case "loan-repaid":
        case "liquidation-started":
        case "liquidation-completed":
          fetchGameState();
          break;

        case "trade-offer":
          // Only show popup to target player
          if (event.payload.targetPlayerId === sessionStorage.getItem("playerId")) {
            playNotification();
            useGameStore.getState().setIncomingTradeOffer(event.payload);
          }
          break;

        case "trade-accepted":
          playNotification();
          fetchGameState();
          break;

        case "trade-declined":
          if (event.payload.offeringPlayerId === sessionStorage.getItem("playerId")) {
            alert(`${event.payload.targetPlayerName} declined your trade offer.`);
          }
          break;

        case "trade-voided":
          alert(`Trade could not be completed: ${event.payload.reason}`);
          fetchGameState();
          break;

        case "state-sync":
          fetchGameState();
          break;

        default:
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchGameState]
  );

  // Subscribe to realtime events
  useEffect(() => {
    if (!inviteCode) return;

    subscribeToMatch(inviteCode, handleGameEvent);
    return () => unsubscribeFromMatch(inviteCode);
  }, [inviteCode, handleGameEvent]);

  if (loading) {
    return (
      <div className="animated-bg min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-bounce">🎲</div>
          <p className="text-xl text-[var(--text-secondary)] animate-pulse">
            Loading game board...
          </p>
        </div>
      </div>
    );
  }

  if (gameOver) {
    const isWinner = gameOver.winnerId === sessionStorage.getItem("playerId");
    return (
      <div className="animated-bg min-h-screen flex items-center justify-center">
        <div className="glass-card p-12 text-center max-w-md">
          <div className="text-6xl mb-6">{isWinner ? "🏆" : "🎮"}</div>
          <h1 className="text-3xl font-black text-glow mb-4">
            {isWinner ? "You Win!" : "Game Over"}
          </h1>
          <p className="text-lg text-[var(--text-secondary)] mb-8">
            {isWinner
              ? "Congratulations! You dominated the fog!"
              : `${gameOver.winnerName} wins the game!`}
          </p>
          <button onClick={() => router.push("/")} className="btn-primary px-8 py-3">
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col body-texture overflow-hidden selection:bg-amber-800 selection:text-white text-stone-800">
      {/* Board */}
      <div className="flex-1 overflow-hidden min-h-0">
        <Board />
      </div>
      {/* Trade Incoming Modal (global overlay) */}
      <IncomingTradeModal />
    </div>
  );
}
