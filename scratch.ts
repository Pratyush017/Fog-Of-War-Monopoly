import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function run() {
  const match = await prisma.match.findFirst({ orderBy: { createdAt: 'desc' } });
  console.log("Latest match gameMode:", match?.gameMode);
  if (match) {
    const tiles = await prisma.matchTile.findMany({ where: { matchId: match.id }, take: 10 });
    console.log("Tiles revealed:", tiles.map(t => t.isRevealed));
  }
}
run().catch(console.error).finally(() => prisma.$disconnect());
