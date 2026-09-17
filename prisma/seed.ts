import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Clear existing properties
  await prisma.matchTile.deleteMany();
  await prisma.property.deleteMany();

  const properties = [
    // Set A (Brown) - Mexico
    { name: "Oaxaca", colorSet: "A", price: 60, rent: [2, 10, 30, 90, 160, 250], houseCost: 50 },
    { name: "Jalisco", colorSet: "A", price: 60, rent: [4, 20, 60, 180, 320, 450], houseCost: 50 },

    // Set B (Light Blue) - Australia
    { name: "Tasmania", colorSet: "B", price: 100, rent: [6, 30, 90, 270, 400, 550], houseCost: 50 },
    { name: "Queensland", colorSet: "B", price: 100, rent: [6, 30, 90, 270, 400, 550], houseCost: 50 },
    { name: "Victoria", colorSet: "B", price: 120, rent: [8, 40, 100, 300, 450, 600], houseCost: 50 },

    // Set C (Pink) - India
    { name: "Goa", colorSet: "C", price: 140, rent: [10, 50, 150, 450, 625, 750], houseCost: 100 },
    { name: "Kerala", colorSet: "C", price: 140, rent: [10, 50, 150, 450, 625, 750], houseCost: 100 },
    { name: "Punjab", colorSet: "C", price: 160, rent: [12, 60, 180, 500, 700, 900], houseCost: 100 },

    // Set D (Orange) - Brazil
    { name: "Bahia", colorSet: "D", price: 180, rent: [14, 70, 200, 550, 750, 950], houseCost: 100 },
    { name: "Rio", colorSet: "D", price: 180, rent: [14, 70, 200, 550, 750, 950], houseCost: 100 },
    { name: "SãoPaulo", colorSet: "D", price: 200, rent: [16, 80, 220, 600, 800, 1000], houseCost: 100 },

    // Set E (Red) - Italy
    { name: "Sicily", colorSet: "E", price: 220, rent: [18, 90, 250, 700, 875, 1050], houseCost: 150 },
    { name: "Tuscany", colorSet: "E", price: 220, rent: [18, 90, 250, 700, 875, 1050], houseCost: 150 },
    { name: "Lombardy", colorSet: "E", price: 240, rent: [20, 100, 300, 750, 925, 1200], houseCost: 150 },

    // Set F (Yellow) - Germany
    { name: "Saxony", colorSet: "F", price: 260, rent: [22, 110, 330, 800, 975, 1150], houseCost: 150 },
    { name: "Bavaria", colorSet: "F", price: 260, rent: [22, 110, 330, 800, 975, 1150], houseCost: 150 },
    { name: "Berlin", colorSet: "F", price: 280, rent: [24, 120, 360, 850, 1025, 1200], houseCost: 150 },

    // Set G (Green) - Japan
    { name: "Kyoto", colorSet: "G", price: 300, rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200 },
    { name: "Osaka", colorSet: "G", price: 300, rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200 },
    { name: "Tokyo", colorSet: "G", price: 320, rent: [28, 150, 450, 1000, 1200, 1400], houseCost: 200 },

    // Set H (Dark Blue) - USA
    { name: "Texas", colorSet: "H", price: 350, rent: [35, 175, 500, 1100, 1300, 1500], houseCost: 200 },
    { name: "NewYork", colorSet: "H", price: 400, rent: [50, 200, 600, 1400, 1700, 2000], houseCost: 200 },

    // Transit (4 stations)
    { name: "JFK", colorSet: "TRANSIT", price: 200, rent: [25, 50, 100, 200], houseCost: 0, isTransit: true },
    { name: "Heathrow", colorSet: "TRANSIT", price: 200, rent: [25, 50, 100, 200], houseCost: 0, isTransit: true },
    { name: "Dubai", colorSet: "TRANSIT", price: 200, rent: [25, 50, 100, 200], houseCost: 0, isTransit: true },
    { name: "Haneda", colorSet: "TRANSIT", price: 200, rent: [25, 50, 100, 200], houseCost: 0, isTransit: true },

    // Utilities (2)
    { name: "Power", colorSet: "UTILITY", price: 150, rent: [4, 10], houseCost: 0, isUtility: true },
    { name: "Water", colorSet: "UTILITY", price: 150, rent: [4, 10], houseCost: 0, isUtility: true },
  ];

  for (const prop of properties) {
    await prisma.property.create({
      data: {
        name: prop.name,
        colorSet: prop.colorSet,
        price: prop.price,
        rent: prop.rent,
        houseCost: prop.houseCost,
        originalMortgage: prop.price / 2, // Hardcoded to exactly 50% of buyPrice
        isUtility: prop.isUtility ?? false,
        isTransit: prop.isTransit ?? false,
      },
    });
  }

  console.log(`✅ Seeded ${properties.length} properties`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
