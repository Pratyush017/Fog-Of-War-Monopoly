import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    // Clear existing properties
    await prisma.matchTile.deleteMany();
    await prisma.property.deleteMany();

    // From User JSON Data
    const rawProperties = [
        { "name": "Oaxaca", "price": 60, "upgradeCost": 50, "rent": [2, 10, 30, 90, 160, 250], colorSet: "A" },
        { "name": "Jalisco", "price": 60, "upgradeCost": 50, "rent": [4, 20, 60, 180, 320, 450], colorSet: "A" },
        { "name": "Tasmania", "price": 100, "upgradeCost": 50, "rent": [6, 30, 90, 270, 400, 550], colorSet: "B" },
        { "name": "Queensland", "price": 100, "upgradeCost": 50, "rent": [6, 30, 90, 270, 400, 550], colorSet: "B" },
        { "name": "Victoria", "price": 120, "upgradeCost": 50, "rent": [8, 40, 100, 300, 450, 600], colorSet: "B" },
        { "name": "Goa", "price": 140, "upgradeCost": 100, "rent": [10, 50, 150, 450, 625, 750], colorSet: "C" },
        { "name": "Kerala", "price": 140, "upgradeCost": 100, "rent": [10, 50, 150, 450, 625, 750], colorSet: "C" },
        { "name": "Punjab", "price": 160, "upgradeCost": 100, "rent": [12, 60, 180, 500, 700, 900], colorSet: "C" },
        { "name": "Bahia", "price": 180, "upgradeCost": 100, "rent": [14, 70, 200, 550, 750, 950], colorSet: "D" },
        { "name": "Rio", "price": 180, "upgradeCost": 100, "rent": [14, 70, 200, 550, 750, 950], colorSet: "D" },
        { "name": "SãoPaulo", "price": 200, "upgradeCost": 100, "rent": [16, 80, 220, 600, 800, 1000], colorSet: "D" },
        { "name": "Sicily", "price": 220, "upgradeCost": 150, "rent": [18, 90, 250, 700, 875, 1050], colorSet: "E" },
        { "name": "Tuscany", "price": 220, "upgradeCost": 150, "rent": [18, 90, 250, 700, 875, 1050], colorSet: "E" },
        { "name": "Lombardy", "price": 240, "upgradeCost": 150, "rent": [20, 100, 300, 750, 925, 1200], colorSet: "E" },
        { "name": "Saxony", "price": 260, "upgradeCost": 150, "rent": [22, 110, 330, 800, 975, 1150], colorSet: "F" },
        { "name": "Bavaria", "price": 260, "upgradeCost": 150, "rent": [22, 110, 330, 800, 975, 1150], colorSet: "F" },
        { "name": "Berlin", "price": 280, "upgradeCost": 150, "rent": [24, 120, 360, 850, 1025, 1200], colorSet: "F" },
        { "name": "Kyoto", "price": 300, "upgradeCost": 200, "rent": [26, 130, 390, 900, 1100, 1275], colorSet: "G" },
        { "name": "Osaka", "price": 300, "upgradeCost": 200, "rent": [26, 130, 390, 900, 1100, 1275], colorSet: "G" },
        { "name": "Tokyo", "price": 320, "upgradeCost": 200, "rent": [28, 150, 450, 1000, 1200, 1400], colorSet: "G" },
        { "name": "Texas", "price": 350, "upgradeCost": 200, "rent": [35, 175, 500, 1100, 1300, 1500], colorSet: "H" },
        { "name": "NewYork", "price": 400, "upgradeCost": 200, "rent": [50, 200, 600, 1400, 1700, 2000], colorSet: "H" },
        { "name": "✈️ JFK", "price": 200, "upgradeCost": 0, "rent": [25, 50, 100, 200], colorSet: "TRANSIT", isTransit: true },
        { "name": "✈️ Heathrow", "price": 200, "upgradeCost": 0, "rent": [25, 50, 100, 200], colorSet: "TRANSIT", isTransit: true },
        { "name": "✈️ Dubai", "price": 200, "upgradeCost": 0, "rent": [25, 50, 100, 200], colorSet: "TRANSIT", isTransit: true },
        { "name": "✈️ Haneda", "price": 200, "upgradeCost": 0, "rent": [25, 50, 100, 200], colorSet: "TRANSIT", isTransit: true },
        { "name": "⚡ Power", "price": 150, "upgradeCost": 0, "rent": [4, 10], colorSet: "UTILITY", isUtility: true },
        { "name": "💧 Water", "price": 150, "upgradeCost": 0, "rent": [4, 10], colorSet: "UTILITY", isUtility: true }
    ];

    for (const prop of rawProperties) {
        await prisma.property.create({
            data: {
                name: prop.name,
                colorSet: prop.colorSet,
                price: prop.price,
                rent: prop.rent,
                houseCost: prop.upgradeCost,
                originalMortgage: Math.floor(prop.price / 2),
                isUtility: prop.isUtility ?? false,
                isTransit: prop.isTransit ?? false,
            },
        });
    }

    console.log(`✅ Seeded ${rawProperties.length} properties`);
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
