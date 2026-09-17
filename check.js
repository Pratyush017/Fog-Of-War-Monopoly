const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const p = await prisma.property.findMany();
  console.log(p.map(x => ({name: x.name, colorSet: x.colorSet})));
}

main().finally(() => prisma.$disconnect());
