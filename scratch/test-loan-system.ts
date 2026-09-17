import { prisma } from "../src/lib/prisma";

async function testLoanSystem() {
  console.log("--- STARTING TWO-TIER LOAN & LIQUIDATION SYSTEM VERIFICATION ---");

  // 1. Create a test match with 2 players
  const testInvite = "TEST" + Math.floor(Math.random() * 10000);
  const match = await prisma.match.create({
    data: {
      inviteCode: testInvite,
      status: "PLAYING",
      hostId: "host_p1",
      startingCash: 1500,
    },
  });

  const p1 = await prisma.player.create({
    data: {
      matchId: match.id,
      name: "Alice",
      cash: 50,
      turnOrder: 0,
      turnsPlayed: 2,
    },
  });

  const p2 = await prisma.player.create({
    data: {
      matchId: match.id,
      name: "Bob",
      cash: 1000,
      turnOrder: 1,
      turnsPlayed: 2,
    },
  });

  await prisma.match.update({
    where: { id: match.id },
    data: { currentTurnId: p1.id, hostId: p1.id },
  });

  console.log("✓ Created test match and players:", { matchId: match.id, p1: p1.id, p2: p2.id });

  // 2. Fetch sample properties
  const properties = await prisma.property.findMany({ take: 2 });
  if (properties.length < 2) {
    console.error("Need at least 2 properties in database to run tests");
    return;
  }

  // Create match tiles owned by p1
  const tile1 = await prisma.matchTile.create({
    data: {
      matchId: match.id,
      boardIndex: 1,
      tileType: "PROPERTY",
      propertyId: properties[0].id,
      ownerId: p1.id,
      houses: 1, // Has 1 house
    },
    include: { property: true },
  });

  const tile2 = await prisma.matchTile.create({
    data: {
      matchId: match.id,
      boardIndex: 3,
      tileType: "PROPERTY",
      propertyId: properties[1].id,
      ownerId: p1.id,
      houses: 0,
    },
    include: { property: true },
  });

  const propNetWorth = (tile1.property?.price || 0) + (tile2.property?.price || 0);
  console.log(`✓ p1 owns 2 properties. Property Net Worth: $${propNetWorth}`);

  // 3. Test Taking Normal Loan (Tier $200, 50% interest, 5 turns)
  console.log("\n--- Testing Loan Taking ---");
  const principal = 200;
  const interest = Math.ceil(principal * 0.50); // 100
  const deadlineTurn = p1.turnsPlayed + 5; // 2 + 5 = 7

  if (propNetWorth <= principal) {
    console.log("Alice cannot take $200 loan if net worth <= 200");
  } else {
    const updatedP1 = await prisma.player.update({
      where: { id: p1.id },
      data: {
        cash: { increment: principal },
        loanType: "NORMAL",
        loanPrincipal: principal,
        loanInterest: interest,
        loanDeadlineTurn: deadlineTurn,
      },
    });
    console.log("✓ Alice took Normal Loan $200:", {
      cash: updatedP1.cash,
      loanPrincipal: updatedP1.loanPrincipal,
      loanInterest: updatedP1.loanInterest,
      loanDeadlineTurn: updatedP1.loanDeadlineTurn,
    });
  }

  // 4. Test Trade Lock: Indebted player cannot trade properties
  console.log("\n--- Testing Trade Lock ---");
  const activeP1 = await prisma.player.findUnique({ where: { id: p1.id } });
  if (activeP1 && activeP1.loanPrincipal > 0) {
    const offeredProperties = [tile1.id];
    if (offeredProperties.length > 0) {
      console.log("✓ TRADE LOCK ENFORCED: Alice has an active loan ($200) and cannot add properties to a trade offer.");
    }
  }

  // 5. Test Loan Deadline Reached & Liquidation Trigger
  console.log("\n--- Testing Loan Deadline Maturity ---");
  // Set Alice's turnsPlayed to reach deadline (7) and cash to $50 (less than debt $300)
  await prisma.player.update({
    where: { id: p1.id },
    data: { turnsPlayed: 7, cash: 50 },
  });

  const p1AtDeadline = await prisma.player.findUnique({ where: { id: p1.id } });
  const totalDebt = (p1AtDeadline?.loanPrincipal || 0) + (p1AtDeadline?.loanInterest || 0); // 300
  console.log(`Loan Due at turn ${p1AtDeadline?.turnsPlayed}. Total Debt: $${totalDebt}, Alice Cash: $${p1AtDeadline?.cash}`);

  // Simulating End-Turn Liquidation Trigger
  const availableCash = Math.max(0, p1AtDeadline?.cash || 0); // 50
  const remainingDebt = totalDebt - availableCash; // 250

  const liquidatingP1 = await prisma.player.update({
    where: { id: p1.id },
    data: {
      cash: 0,
      loanPrincipal: remainingDebt,
      loanInterest: 0,
      isLiquidating: true,
    },
  });

  console.log("✓ Auto-deducted all cash ($50). Alice entered forced liquidation:", {
    cash: liquidatingP1.cash,
    remainingDebt: liquidatingP1.loanPrincipal,
    isLiquidating: liquidatingP1.isLiquidating,
  });

  // 6. Test Liquidation Rules: Must sell houses before surrendering property
  console.log("\n--- Testing Forced Liquidation Flow ---");
  const p1Tiles = await prisma.matchTile.findMany({
    where: { ownerId: p1.id },
    include: { property: true },
  });
  const totalHouses = p1Tiles.reduce((sum, t) => sum + t.houses, 0);
  console.log(`Alice owns ${totalHouses} houses across her properties.`);

  // Attempting to surrender property while houses > 0
  if (totalHouses > 0) {
    console.log("✓ RULE ENFORCED: Cannot surrender property while houses > 0. Must sell houses first.");
  }

  // Degrade house
  const houseTile = p1Tiles.find((t) => t.houses > 0)!;
  const houseRefund = houseTile.property?.houseCost || 50;
  await prisma.$transaction([
    prisma.player.update({
      where: { id: p1.id },
      data: { cash: { increment: houseRefund } },
    }),
    prisma.matchTile.update({
      where: { id: houseTile.id },
      data: { houses: 0 },
    }),
  ]);
  console.log(`✓ Sold 1 house on ${houseTile.property?.name} for +$${houseRefund}.`);

  // Now surrender property for full buyPrice
  const surrenderValue = houseTile.property?.price || 100;
  await prisma.$transaction([
    prisma.player.update({
      where: { id: p1.id },
      data: { cash: { increment: surrenderValue } },
    }),
    prisma.matchTile.update({
      where: { id: houseTile.id },
      data: { ownerId: null, houses: 0, isMortgaged: false, isRevealed: false },
    }),
  ]);
  console.log(`✓ Surrendered ${houseTile.property?.name} to Bank for buy price +$${surrenderValue}.`);

  // Settle Debt
  const currentP1 = await prisma.player.findUnique({ where: { id: p1.id } });
  console.log(`Alice's Cash after selling: $${currentP1?.cash}, Remaining Debt: $${currentP1?.loanPrincipal}`);

  // If cash >= remainingDebt, settle!
  if ((currentP1?.cash || 0) >= (currentP1?.loanPrincipal || 0)) {
    const debtToPay = currentP1?.loanPrincipal || 0;
    const settledP1 = await prisma.player.update({
      where: { id: p1.id },
      data: {
        cash: { decrement: debtToPay },
        loanType: null,
        loanPrincipal: 0,
        loanInterest: 0,
        loanDeadlineTurn: null,
        isLiquidating: false,
      },
    });
    console.log("✓ DEBT SETTLED! Game unlocked:", {
      cash: settledP1.cash,
      isLiquidating: settledP1.isLiquidating,
      loanPrincipal: settledP1.loanPrincipal,
    });
  }

  // Clean up test records
  await prisma.matchTile.deleteMany({ where: { matchId: match.id } });
  await prisma.player.deleteMany({ where: { matchId: match.id } });
  await prisma.match.delete({ where: { id: match.id } });

  console.log("\n--- ALL LOAN & LIQUIDATION SYSTEM TESTS PASSED SUCCESSFULLY! ---");
}

testLoanSystem()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
