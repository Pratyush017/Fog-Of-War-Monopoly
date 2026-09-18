import type { Prisma } from "@prisma/client";
import { calculatePlayerNetWorth } from "@/lib/game-engine";

/**
 * Intercepts cash inflow for a player and routes it to their creditor if they are in debt.
 * Returns the remainder that actually goes to the player's cash balance.
 */
export async function interceptCashInflow(
  tx: Prisma.TransactionClient,
  playerId: string,
  amount: number
): Promise<number> {
  if (amount <= 0) {
    // If it's a deduction or zero, just apply it and return 0
    await tx.player.update({
      where: { id: playerId },
      data: { cash: { increment: amount } }
    });
    return amount;
  }

  const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
  
  if (player.debtAmount > 0 && player.creditorId) {
    const amountToCreditor = Math.min(amount, player.debtAmount);
    const newDebtAmount = player.debtAmount - amountToCreditor;
    
    // Pay creditor
    await tx.player.update({
      where: { id: player.creditorId },
      data: { cash: { increment: amountToCreditor } }
    });

    // Update debtor (They get the full amount because their cash was already decremented by the full debt when it was created)
    await tx.player.update({
      where: { id: playerId },
      data: {
        debtAmount: newDebtAmount,
        creditorId: newDebtAmount === 0 ? null : player.creditorId,
        cash: { increment: amount }
      }
    });

    return amount;
  } else {
    // No debt to another player
    await tx.player.update({
      where: { id: playerId },
      data: { cash: { increment: amount } }
    });
    return amount;
  }
}

/**
 * Resolves forced bankruptcy for a player who ran out of time while in debt.
 * Pays creditor their remaining net worth, discards houses, and returns properties to bank.
 */
export async function resolveForcedBankruptcy(
  tx: Prisma.TransactionClient,
  matchId: string,
  debtorId: string
) {
  // 1. Get player and their properties
  const player = await tx.player.findUniqueOrThrow({ where: { id: debtorId } });
  if (!player.creditorId || player.debtAmount <= 0) {
    return; // Safety check - not in player debt
  }

  const ownedTiles = await tx.matchTile.findMany({
    where: { matchId, ownerId: debtorId },
    include: { property: true }
  });

  // 2. Compute net worth (base price only)
  // net worth = cash + sum(property.price)
  const netWorth = Math.max(0, calculatePlayerNetWorth(player.cash, ownedTiles));
  
  const paymentToCreditor = Math.min(netWorth, player.debtAmount);
  
  // 3. Pay creditor
  if (paymentToCreditor > 0) {
    await tx.player.update({
      where: { id: player.creditorId },
      data: { cash: { increment: paymentToCreditor } }
    });
  }

  // 4. Return properties to bank fully bare
  for (const tile of ownedTiles) {
    await tx.matchTile.update({
      where: { id: tile.id },
      data: {
        houses: 0,
        isMortgaged: false,
        ownerId: null,
        isRevealed: true
      }
    });
  }

  // 5. Mark as bankrupt and clear debt
  await tx.player.update({
    where: { id: debtorId },
    data: {
      isBankrupt: true,
      cash: 0,
      creditorId: null,
      debtAmount: 0,
      loanPrincipal: 0,
      loanInterest: 0,
      loanType: null,
    }
  });
}
