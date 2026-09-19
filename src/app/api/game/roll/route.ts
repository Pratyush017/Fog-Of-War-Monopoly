import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { rollDice, calculateRent, drawChanceCard, drawChestCard } from "@/lib/game-engine";
import { serverBroadcast } from "@/lib/supabase-channels";
import { logGameEvent } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const serverReceivedTime = Date.now();
    const { matchId, playerId, actionId, isAutoRoll } = await request.json();

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

    let targetPlayerId = playerId;

    if (match.currentTurnId !== playerId) {
      if (isAutoRoll && match.turnEndsAt && new Date() > match.turnEndsAt) {
        targetPlayerId = match.currentTurnId;
      } else {
        return NextResponse.json({ error: "Not your turn" }, { status: 403 });
      }
    }

    if (match.hasRolled) {
      return NextResponse.json({ error: "Already rolled this turn" }, { status: 400 });
    }

    if (!isAutoRoll && match.turnEndsAt && new Date() > match.turnEndsAt) {
      return NextResponse.json({ error: "Turn time expired" }, { status: 403 });
    }

    const player = match.players.find((p) => p.id === targetPlayerId);
    if (!player || player.isBankrupt) {
      return NextResponse.json({ error: "Invalid player" }, { status: 400 });
    }

    // ── Jail check ──
    const wasInJail = player.inJail;
    let isFreedFromJail = false;
    let newJailTurns = player.jailTurns;

    if (wasInJail) {
      if (player.cash >= 200) {
        return NextResponse.json({
          requiresJailDecision: true,
          jailTurns: player.jailTurns,
        });
      }

      // Player has < $200: Can roll for free
      // Freed if rolls doubles OR if this is their 3rd turn (jailTurns + 1 >= 3)
    }

    // ── Negative balance / Debt check ──
    if (player.cash < 0 || player.debtAmount > 0) {
      return NextResponse.json(
        { error: "Cannot roll while in debt. Mortgage or sell properties to clear your debt, or declare bankruptcy." },
        { status: 400 }
      );
    }

    // ── Roll dice ──
    const dice = rollDice();

    if (wasInJail) {
      isFreedFromJail = dice.isDoubles || (player.jailTurns + 1 >= 3);
      newJailTurns = isFreedFromJail ? 0 : player.jailTurns + 1;
    }

    // ── Pre-compute synchronous properties ──
    const oldPosition = wasInJail ? 10 : player.position;
    let newPosition = wasInJail
      ? (isFreedFromJail ? (10 + dice.total) % 40 : 10)
      : (oldPosition + dice.total) % 40;

    const passedGo = !wasInJail && newPosition < oldPosition && newPosition !== 0;
    const landedOnGo = !wasInJail && oldPosition !== 0 && newPosition === 0;

    const landedTile = match.tiles.find((t) => t.boardIndex === newPosition);
    if (!landedTile) {
      return NextResponse.json({ error: "Tile not found" }, { status: 500 });
    }

    let responseAction: string | null = null;
    const landedBoardIndex = newPosition; // Position BEFORE Go-To-Jail redirect
    if ((!wasInJail || isFreedFromJail) && landedTile.tileType === "PROPERTY" && !landedTile.ownerId) {
      if (!isAutoRoll) {
        responseAction = "buy-prompt";
      }
    } else if ((!wasInJail || isFreedFromJail) && landedTile.tileType === "GO_TO_JAIL") {
      newPosition = 10;
    }

    // Pre-draw Chance/Chest cards synchronously so we can return them immediately
    let drawnCard: { description: string; effect: string; amount?: number; moveTo?: number } | null = null;
    if ((!wasInJail || isFreedFromJail)) {
      if (landedTile.tileType === "CHANCE") {
        drawnCard = drawChanceCard();
      } else if (landedTile.tileType === "CHEST") {
        drawnCard = drawChestCard();
      }
    }

    // ── Run heavy logic in background ──
    after(async () => {
      try {
        // Log dice result
        if (wasInJail) {
          if (isFreedFromJail) {
            if (dice.isDoubles) {
              await logGameEvent(
                match.id,
                match.inviteCode,
                `🎲 ${player.name} rolled DOUBLES (${dice.die1} + ${dice.die2}) and escaped from Jail!`,
                "jail"
              );
            } else {
              await logGameEvent(
                match.id,
                match.inviteCode,
                `🔓 ${player.name} served 3 turns in Jail and is now free! Rolled ${dice.die1} + ${dice.die2} = ${dice.total}`,
                "jail"
              );
            }
          } else {
            await logGameEvent(
              match.id,
              match.inviteCode,
              `🔒 ${player.name} rolled ${dice.die1} + ${dice.die2} (no doubles) — remaining in Jail (Turn ${newJailTurns}/3)`,
              "jail"
            );
          }
        } else {
          await logGameEvent(
            match.id,
            match.inviteCode,
            `${player.name} rolled ${dice.die1} + ${dice.die2} = ${dice.total}${dice.isDoubles ? " (DOUBLES!)" : ""}`,
            "move"
          );
        }

        // Broadcast dice result
        await serverBroadcast(match.inviteCode, {
          actionId,
          type: "dice-rolled",
          telemetry: { serverReceivedTime, serverBroadcastTime: Date.now() },
          payload: {
            playerId,
            dice: [dice.die1, dice.die2],
            isDoubles: dice.isDoubles,
            hasRolled: wasInJail && !isFreedFromJail ? true : !dice.isDoubles,
            newPosition,
          },
          delta: {
            match: { hasRolled: wasInJail && !isFreedFromJail ? true : !dice.isDoubles }
          }
        });

        // ── Handle Jail staying vs escaping vs normal move ──
        if (wasInJail && !isFreedFromJail) {
          // Player failed to roll doubles and stayed in jail
          await prisma.player.update({
            where: { id: playerId },
            data: {
              jailTurns: newJailTurns,
              position: 10,
            },
          });

          await prisma.match.update({
            where: { id: matchId },
            data: { hasRolled: true },
          });

          await serverBroadcast(match.inviteCode, {
            type: "turn-changed",
            payload: {
              currentTurnId: playerId,
              hasRolled: true,
            },
            delta: {
              players: [{ id: playerId, jailTurns: newJailTurns, inJail: true, position: 10 }],
              match: { hasRolled: true },
            }
          });
          return;
        }

        if (wasInJail && isFreedFromJail) {
          await serverBroadcast(match.inviteCode, {
            type: "jail-freed",
            payload: { playerId },
          });
        }

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
            inJail: landedTile.tileType === "GO_TO_JAIL" ? true : false,
            jailTurns: wasInJail && isFreedFromJail ? 0 : (landedTile.tileType === "GO_TO_JAIL" ? 0 : undefined),
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
          telemetry: { serverReceivedTime, serverBroadcastTime: Date.now() },
          payload: {
            playerId,
            from: oldPosition,
            to: newPosition, // this is already 10 if GO_TO_JAIL
            passedGo: passedGo || landedOnGo,
          },
          delta: {
            players: [{
              id: playerId,
              cash: player.cash + cashChange,
              inJail: landedTile.tileType === "GO_TO_JAIL" ? true : false,
              jailTurns: 0,
            }]
          }
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
              delta: {
                players: [{ id: playerId, cash: player.cash + cashChange - taxAmount }]
              }
            });
            break;
          }

          case "CHANCE": {
            // Use the pre-drawn card (drawn synchronously before after())
            const chanceCard = drawnCard!;
            // Pass updated cash (after Go bonus) so delta computation is accurate
            const playersWithUpdatedCash = match.players.map(p => 
              p.id === playerId ? { ...p, cash: player.cash + cashChange } : p
            );
            const chanceDeltas = await applyCardEffect(match.id, match.inviteCode, playerId, chanceCard as any, playersWithUpdatedCash);
            await logGameEvent(match.id, match.inviteCode, `${player.name}: ${chanceCard.description}`, "card");
            await serverBroadcast(match.inviteCode, {
              actionId,
              type: "chance-card",
              payload: { playerId, description: chanceCard.description, effect: chanceCard.effect },
              delta: { players: chanceDeltas }
            });
            break;
          }

          case "CHEST": {
            // Use the pre-drawn card (drawn synchronously before after())
            const chestCard = drawnCard!;
            const chestPlayersWithUpdatedCash = match.players.map(p => 
              p.id === playerId ? { ...p, cash: player.cash + cashChange } : p
            );
            const chestDeltas = await applyCardEffect(match.id, match.inviteCode, playerId, chestCard as any, chestPlayersWithUpdatedCash);
            await logGameEvent(match.id, match.inviteCode, `${player.name}: ${chestCard.description}`, "card");
            await serverBroadcast(match.inviteCode, {
              actionId,
              type: "chest-card",
              payload: { playerId, description: chestCard.description, effect: chestCard.effect },
              delta: { players: chestDeltas }
            });
            break;
          }

          case "PROPERTY": {
            if (!landedTile.ownerId) {
              if (isAutoRoll) {
                if (match.passUpRule === "AUCTION") {
                  await serverBroadcast(match.inviteCode, {
                    type: "auction-start",
                    payload: { boardIndex: landedTile.boardIndex, startingBid: 10 },
                  });
                  await logGameEvent(match.id, match.inviteCode, `Auction started for ${landedTile.property?.name}`, "info");
                } else {
                  await serverBroadcast(match.inviteCode, {
                    type: "tile-passed",
                    payload: { boardIndex: landedTile.boardIndex },
                  });
                  await logGameEvent(match.id, match.inviteCode, `Property at ${landedTile.property?.name || `Tile #${landedTile.boardIndex}`} was passed (Time expired)`, "info");
                }
              } else {
                // We computed responseAction='buy-prompt' synchronously
                await serverBroadcast(match.inviteCode, {
                  type: "buy-prompt",
                  payload: { playerId, boardIndex: landedTile.boardIndex },
                });
              }
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

                // Check if they go negative (only extend if they were forced to roll)
                if (player.cash - rent < 0 && isAutoRoll) {
                  // Extend timer by 60s
                  const newTurnEndsAt = new Date(Date.now() + 60000);
                  await prisma.match.update({
                    where: { id: matchId },
                    data: { turnEndsAt: newTurnEndsAt },
                  });
                  await serverBroadcast(match.inviteCode, {
                    type: "turn-changed",
                    payload: {
                      currentTurnId: playerId,
                      turnEndsAt: newTurnEndsAt.toISOString(),
                      hasRolled: true,
                    },
                  });
                }

                // Pay rent (partial or full based on available cash)
                const availableCash = Math.max(0, player.cash);
                const paidInstantly = Math.min(availableCash, rent);
                const debt = rent - paidInstantly;

                const txs = [];
                if (debt > 0) {
                  // Player can't cover full rent, assign debt
                  txs.push(prisma.player.update({
                    where: { id: playerId },
                    data: { cash: { decrement: rent }, creditorId: owner.id, debtAmount: debt }
                  }));
                } else {
                  // Player can cover it
                  txs.push(prisma.player.update({
                    where: { id: playerId },
                    data: { cash: { decrement: rent } }
                  }));
                }

                if (paidInstantly > 0) {
                  txs.push(prisma.player.update({
                    where: { id: owner.id },
                    data: { cash: { increment: paidInstantly } }
                  }));
                }
                
                await prisma.$transaction(txs);
                await logGameEvent(match.id, match.inviteCode, `${player.name} paid $${rent} rent to ${owner.name} for ${landedTile.property.name}`, "rent");
                const playersDelta: any[] = [];
                if (debt > 0) {
                  playersDelta.push({ id: playerId, cash: player.cash - rent, creditorId: owner.id, debtAmount: player.debtAmount + debt });
                } else {
                  playersDelta.push({ id: playerId, cash: player.cash - rent });
                }
                if (paidInstantly > 0) {
                  playersDelta.push({ id: owner.id, cash: owner.cash + paidInstantly });
                }

                await serverBroadcast(match.inviteCode, {
                  type: "rent-paid",
                  payload: {
                    payerId: playerId,
                    ownerId: owner.id,
                    amount: rent,
                    tileName: landedTile.property.name,
                  },
                  delta: { players: playersDelta }
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
      wasInJail,
      isFreedFromJail,
      jailTurns: newJailTurns,
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
  players: { id: string; cash?: number; isBankrupt: boolean }[]
): Promise<any[]> {
  const callerPlayer = players.find(p => p.id === playerId);
  const baseCash = callerPlayer?.cash ?? 0;

  switch (card.effect) {
    case "gain":
      await prisma.player.update({
        where: { id: playerId },
        data: { cash: { increment: card.amount! } },
      });
      return [{ id: playerId, cash: baseCash + card.amount! }];
    case "lose":
      await prisma.player.update({
        where: { id: playerId },
        data: { cash: { decrement: card.amount! } },
      });
      return [{ id: playerId, cash: baseCash - card.amount! }];
    case "move": {
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
        // Don't include position in delta — DiceRoller handles local player animation,
        // and the case handler sets position for opponents. Including it causes slingshot.
        await serverBroadcast(inviteCode, {
          type: "player-moved",
          payload: { playerId, from: player?.position ?? 0, to: card.moveTo, passedGo },
        });
        return [{ id: playerId, cash: (player?.cash ?? 0) + cashChange }];
      }
      return [];
    }
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
      return [{ id: playerId, cash: baseCash }];
    case "collect-from-all": {
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
      return [
        { id: playerId, cash: baseCash + totalCollected },
        ...activePlayers.map(p => ({ id: p.id, cash: (p.cash ?? 0) - card.amount! }))
      ];
    }
    case "pay-all": {
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
      return [
        { id: playerId, cash: baseCash - totalPaid },
        ...otherPlayers.map(p => ({ id: p.id, cash: (p.cash ?? 0) + card.amount! }))
      ];
    }
    default:
      return [];
  }
}

