import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function run() {
  const match = await prisma.match.create({
    data: {
      inviteCode: "TEST" + Math.floor(Math.random()*1000),
      hostId: "test-host",
      status: "LOBBY"
    }
  });

  const res = await fetch(`http://localhost:3001/api/match/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      matchId: match.id,
      playerId: "test-host",
      gameMode: "CLASSIC"
    })
  });
  
  const data = await res.json().catch(() => null);
  console.log("Settings Response:", res.status, data);

  const updatedMatch = await prisma.match.findUnique({ where: { id: match.id }});
  console.log("Updated GameMode:", updatedMatch?.gameMode);
}

run().catch(console.error).finally(() => prisma.$disconnect());
