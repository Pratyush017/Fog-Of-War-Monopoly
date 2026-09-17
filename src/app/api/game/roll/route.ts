import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { rollDice, calculateRent, drawChanceCard, drawChestCard } from "@/lib/game-engine";
import { serverBroadcast } from "@/lib/supabase-channels";
import { logGameEvent } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const { matchId, playerId, actionId } = await request.json();

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        players: true,
        tiles: { include: { property: true } },
      },
    });

    if (!match || match.status !== "PLAYING") {
      return NextResponse.json({ error: "Invalid match" }, { status: 400 });
    }

    if (match.currentTurnId !== playerId) {
      return NextResponse.json({ error: "Not your turn" }, { status: 403 });
    }

    if (match.hasRolled) {
      return NextResponse.json({ error: "Already rolled this turn" }, { status: 400 });
    }

    if (match.turnEndsAt && new Date() > match.turnEndsAt) {
      return NextResponse.json({ error: "Turn time expired" }, { status: 403 });
    }

    const player = match.players.find((p) => p.id === playerId);
    if (!player || player.isBankrupt) {
      return NextResponse.json({ error: "Invalid player" }, { status: 400 });
    }

    // ── Jail check ──
    if (player.inJail) {
      return NextResponse.json({
        requiresJailDecision: true,
        jailTurns: player.jailTurns,
      });
    }

    // ── Negative balance check ──
    if (player.cash < 0) {
      return NextResponse.json(
        { error: "Cannot roll with negative balance. Mortgage or sell properties to cover debt, or declare bankruptcy." },
        { status: 400 }
      );
    }

    // ── Roll dice ──
    const dice = rollDice();

    

    // ── Pre-compute synchronous properties ──
    const oldPosition = player.position;
    let newPosition = (oldPosition + dice.total) % 40;
    const passedGo = newPosition < oldPosition && newPosition !== 0;
    const landedOnGo = oldPosition !== 0 && newPosition === 0;

    const landedTile = match.tiles.find((t) => t.boardIndex === newPosition);
    if (!landedTile) {
      return NextResponse.json({ error: "Tile not found" }, { status: 500 });
    }

    let responseAction: string | null = null;
    const landedBoardIndex = newPosition; // Position BEFORE Go-To-Jail redirect
    if (landedTile.tileType === "PROPERTY" && !landedTile.ownerId) {
      responseAction = "buy-prompt";
    } else if (landedTile.tileType === "GO_TO_JAIL") {
      newPosition = 10;
    }

    // Pre-draw Chance/Chest cards synchronously so we can return them immediately
    let drawnCard: { description: string; effect: string; amount?: number; moveTo?: number } | null = null;
    if (landedTile.tileType === "CHANCE") {
      drawnCard = drawChanceCard();
    } else if (landedTile.tileType === "CHEST") {
      drawnCard = drawChestCard();
    }

    // ── Run heavy logic in background ──
    after(async () => {
      try {
        // Log dice result
        await logGameEvent(
          match.id,
          match.inviteCode,
          `${player.name} rolled ${dice.die1} + ${dice.die2} = ${dice.total}${dice.isDoubles ? " (DOUBLES!)" : ""}`,
          "move"
        );

        // Broadcast dice result
        await serverBroadcast(match.inviteCode, {
          actionId,
          type: "dice-rolled",
          payload: {
            playerId,
            dice: [dice.die1, dice.die2],
            isDoubles: dice.isDoubles,
            hasRolled: true,
            newPosition,
          },
        });

        // ── Update player position ──
        let cashChange = 0;
        
        if (landedOnGo) {
          cashChange += 400; // Landed on Go
          await logGameEvent(match.id, match.inviteCode, `${player.name} landed on Go! +$400`, "info");
        } else if (passedGo) {
          cashChange += 200; // Passed Go
          await logGameEvent(match.id, match.inviteCode, `${player.name} passed Go! +$200`, "info");
        }

        await prisma.player.update({
          where: { id: playerId },
          data: {
            position: newPosition, // newPosition is already 10 if GO_TO_JAIL
            cash: { increment: cashChange },
            ...(landedTile.tileType === "GO_TO_JAIL" ? { inJail: true, jailTurns: 0 } : {})
          },
        });

        // Mark as rolled (unless they rolled doubles, they get another roll)
        await prisma.match.update({
          where: { id: matchId },
          data: { hasRolled: !dice.isDoubles },
        });

        // Broadcast movement
        await serverBroadcast(match.inviteCode, {
          type: "player-moved",
          payload: {
            playerId,
            from: oldPosition,
            to: newPosition, // this is already 10 if GO_TO_JAIL
            passedGo: passedGo || landedOnGo,
          },
        });
        
        if (landedTile.tileType === "GO_TO_JAIL") {
          await logGameEvent(match.id, match.inviteCode, `${player.name} went to Jail! 🔒`, "jail");
          await serverBroadcast(match.inviteCode, {
            type: "jail-entered",
            payload: { playerId },
          });
        }

        if (cashChange > 0) {
          await serverBroadcast(match.inviteCode, {
            type: "go-collect",
            payload: { playerId, amount: cashChange },
          });
        }

        // ── Evaluate landing tile ──
        switch (landedTile.tileType) {
          case "GO":
          case "JAIL":
          case "FREE_PARKING":
          case "GO_TO_JAIL":
            // Already handled above or nothing happens
            break;

          case "TAX": {
            let taxAmount = 0;
            let taxName = "Tax";

            if (landedTile.boardIndex === 4) {
              taxAmount = Math.floor(player.cash * 0.15); // 15% of cash balance
              taxName = "Income Tax (15%)";
            } else if (landedTile.boardIndex === 38) {
              taxAmount = 100; // Flat $100
              taxName = "Luxury Tax ($100)";
            } else {
              taxAmount = 200; // Fallback
              taxName = "Flat Tax ($200)";
            }

            await prisma.player.update({
              where: { id: playerId },
              data: { cash: { decrement: taxAmount } },
            });
            await logGameEvent(match.id, match.inviteCode, `${player.name} paid $${taxAmount} for ${taxName}`, "rent");
            await serverBroadcast(match.inviteCode, {
              type: "tax-paid",
              payload: { playerId, amount: taxAmount },
            });
            break;
          }

          case "CHANCE": {
            // Use the pre-drawn card (drawn synchronously before after())
            const chanceCard = drawnCard!;
            await applyCardEffect(match.id, match.inviteCode, playerId, chanceCard as any, match.players);
            await logGameEvent(match.id, match.inviteCode, `${player.name}: ${chanceCard.description}`, "card");
            await serverBroadcast(match.inviteCode, {
              actionId,
              type: "chance-card",
              payload: { playerId, description: chanceCard.description, effect: chanceCard.effect },
            });
            break;
          }

          case "CHEST": {
            // Use the pre-drawn card (drawn synchronously before after())
            const chestCard = drawnCard!;
            await applyCardEffect(match.id, match.inviteCode, playerId, chestCard as any, match.players);
            await logGameEvent(match.id, match.inviteCode, `${player.name}: ${chestCard.description}`, "card");
            await serverBroadcast(match.inviteCode, {
              actionId,
              type: "chest-card",
              payload: { playerId, description: chestCard.description, effect: chestCard.effect },
            });
            break;
          }

          case "PROPERTY": {
            if (!landedTile.ownerId) {
              // We computed responseAction='buy-prompt' synchronously
              await serverBroadcast(match.inviteCode, {
                type: "buy-prompt",
                payload: { playerId, boardIndex: landedTile.boardIndex },
              });
            } else if (landedTile.ownerId && landedTile.ownerId !== playerId) {
              // Owned by another player → pay rent
              const owner = match.players.find((p) => p.id === landedTile.ownerId);
              if (owner && !owner.isBankrupt && landedTile.property) {
                const ownerTiles = match.tiles.filter((t) => t.ownerId === owner.id);
                const ownerColorSetCount = ownerTiles.filter(
                  (t) => t.property?.colorSet === landedTile.property!.colorSet
                ).length;
                const totalColorSetCount = match.tiles.filter(
                  (t) => t.property?.colorSet === landedTile.property!.colorSet
                ).length;
                const ownerTransitCount = ownerTiles.filter(
                  (t) => t.property?.isTransit
                ).length;
                const ownerUtilityCount = ownerTiles.filter(
                  (t) => t.property?.isUtility
                ).length;

                const rent = calculateRent({
                  property: landedTile.property,
                  houses: landedTile.houses,
                  ownerId: owner.id,
                  diceTotal: dice.total,
                  ownerColorSetCount,
                  totalColorSetCount,
                  ownerTransitCount,
                  ownerUtilityCount,
                  isMortgaged: landedTile.isMortgaged,
                });

                // Pay rent
                await prisma.$transaction([
                  prisma.player.update({
                    where: { id: playerId },
                    data: { cash: { decrement: rent } },
                  }),
                  prisma.player.update({
                    where: { id: owner.id },
                    data: { cash: { increment: rent } },
                  }),
                ]);

                await logGameEvent(match.id, match.inviteCode, `${player.name} paid $${rent} rent to ${owner.name} for ${landedTile.property.name}`, "rent");
                await serverBroadcast(match.inviteCode, {
                  type: "rent-paid",
                  payload: {
                    payerId: playerId,
                    ownerId: owner.id,
                    amount: rent,
                    tileName: landedTile.property.name,
                  },
                });
              }
            }
            break;
          }
        }
      } catch (err) {
        console.error("Error in after() background processing:", err);
      }
    });

    return NextResponse.json({
      dice: { die1: dice.die1, die2: dice.die2, total: dice.total, isDoubles: dice.isDoubles },
      newPosition,
      landedBoardIndex, // Original position before Go-To-Jail redirect
      landedTileType: landedTile.tileType, // e.g. "GO_TO_JAIL", "CHANCE", "CHEST", "PROPERTY", etc.
      action: responseAction,
      passedGo: passedGo || landedOnGo,
      card: drawnCard, // Card info for Chance/Chest (null otherwise)
    });
  } catch (error) {
    console.error("Roll error:", error);
    return NextResponse.json({ error: "Failed to roll" }, { status: 500 });
  }
}

// ─── Helpers ───────────────────────────────────────────────
interface CardEffect {
  description: string;
  effect: string;
  amount?: number;
  moveTo?: number;
}

async function applyCardEffect(
  matchId: string,
  inviteCode: string,
  playerId: string,
  card: CardEffect,
  players: { id: string; isBankrupt: boolean }[]
) {
  switch (card.effect) {
    case "gain":
      await prisma.player.update({
        where: { id: playerId },
        data: { cash: { increment: card.amount! } },
      });
      break;
    case "lose":
      await prisma.player.update({
        where: { id: playerId },
        data: { cash: { decrement: card.amount! } },
      });
      break;
    case "move":
      if (card.moveTo !== undefined) {
        const player = await prisma.player.findUnique({ where: { id: playerId } });
        const passedGo = card.moveTo < (player?.position ?? 0) && card.moveTo !== 0;
        const landedOnGo = card.moveTo === 0 && (player?.position ?? 0) !== 0;
        const cashChange = landedOnGo ? 400 : (passedGo ? 200 : 0);
        
        await prisma.player.update({
          where: { id: playerId },
          data: {
            position: card.moveTo,
            cash: cashChange > 0 ? { increment: cashChange } : undefined,
          },
        });
        if (cashChange > 0) {
          await logGameEvent(matchId, inviteCode, `${player?.name || "Player"} passed Go! +$${cashChange}`, "info");
          await serverBroadcast(inviteCode, {
            type: "go-collect",
            payload: { playerId, amount: cashChange },
          });
        }
        await serverBroadcast(inviteCode, {
          type: "player-moved",
          payload: { playerId, from: player?.position ?? 0, to: card.moveTo, passedGo },
        });
      }
      break;
      case "jail":
        await prisma.player.update({
          where: { id: playerId },
          data: { position: 10, inJail: true, jailTurns: 0 },
        });
        const jailedPlayer = await prisma.player.findUnique({ where: { id: playerId } });
        await logGameEvent(matchId, inviteCode, `${jailedPlayer?.name || "Player"} went to Jail! 🔒`, "jail");
        await serverBroadcast(inviteCode, {
          type: "jail-entered",
          payload: { playerId },
        });
        break;
    case "collect-from-all":
      const activePlayers = players.filter((p) => !p.isBankrupt && p.id !== playerId);
      const totalCollected = card.amount! * activePlayers.length;
      await prisma.$transaction([
        ...activePlayers.map((p) =>
          prisma.player.update({
            where: { id: p.id },
            data: { cash: { decrement: card.amount! } },
          })
        ),
        prisma.player.update({
          where: { id: playerId },
          data: { cash: { increment: totalCollected } },
        }),
      ]);
      break;
    case "pay-all":
      const otherPlayers = players.filter((p) => !p.isBankrupt && p.id !== playerId);
      const totalPaid = card.amount! * otherPlayers.length;
      await prisma.$transaction([
        prisma.player.update({
          where: { id: playerId },
          data: { cash: { decrement: totalPaid } },
        }),
        ...otherPlayers.map((p) =>
          prisma.player.update({
            where: { id: p.id },
            data: { cash: { increment: card.amount! } },
          })
        ),
      ]);
      break;
  }
}

async function advanceTurn(
  matchId: string,
  inviteCode: string,
  players: { id: string; isBankrupt: boolean; turnOrder: number }[],
  currentPlayerId: string
) {
  const activePlayers = players
    .filter((p) => !p.isBankrupt)
    .sort((a, b) => a.turnOrder - b.turnOrder);

  if (activePlayers.length <= 1) {
    // Game over
    const winner = activePlayers[0];
    if (winner) {
      await prisma.match.update({
        where: { id: matchId },
        data: { status: "FINISHED", currentTurnId: null },
      });
      const winnerData = await prisma.player.findUnique({ where: { id: winner.id } });
      await serverBroadcast(inviteCode, {
        type: "game-over",
        payload: { winnerId: winner.id, winnerName: winnerData?.name ?? "Unknown" },
      });
    }
    return;
  }

  const currentIndex = activePlayers.findIndex((p) => p.id === currentPlayerId);
  const nextPlayer = activePlayers[(currentIndex + 1) % activePlayers.length];

  await prisma.match.update({
    where: { id: matchId },
    data: { currentTurnId: nextPlayer.id },
  });

  await serverBroadcast(inviteCode, {
    type: "turn-changed",
    payload: { currentTurnId: nextPlayer.id },
  });
}
