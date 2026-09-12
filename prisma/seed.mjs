import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const rand = (min, max) => Math.random() * (max - min) + min;

const CATALOG = [
  ["Bosch Perceuse GSB 13 RE - Amazon 89€ vs ManoMano 129€", 89, 129, "3165140371940", "gsb13re"],
  ["Dyson V8 Absolute - Amazon 299€ vs Darty 399€", 299, 399, "5025155025421", "dysonv8"],
  ["Karcher K5 - Amazon 249€ vs Leroy Merlin 329€", 249, 329, "4054278608730", "k5"],
  ["Makita DDF485 18V - Amazon 119€ vs ManoMano 169€", 119, 169, "0088381860307", "ddf485"],
  ["Ninja Foodi AF400EU - Amazon 149€ vs Boulanger 219€", 149, 219, "0622356261791", "af400"],
];

for (const [title, low, high, ean, seed] of CATALOG) {
  const diff = Math.round(((high - low) / low) * 1000) / 10;
  await prisma.opportunity.create({
    data: {
      title,
      image: `https://picsum.photos/seed/${seed}/80/80`,
      ean,
      price_low: low,
      price_high: high,
      diff_percent: diff,
      affiliate_url: "#",
      score: Math.floor(rand(60, 96)),
      source: "mock",
    },
  });
}

// EDUCATIONAL ONLY - NO REAL MONEY: historical paper trades for the 7-day chart
const now = Date.now();
for (let i = 6; i >= 1; i--) {
  const entry = rand(50000, 60000);
  const pct = rand(-5, 8);
  const current = entry * (1 + pct / 100);
  await prisma.paperTrade.create({
    data: {
      symbol: ["BTC", "ETH", "SOL"][i % 3],
      entry_price: Math.round(entry * 100) / 100,
      current_price: Math.round(current * 100) / 100,
      quantity: 0.01,
      pnl: Math.round((current - entry) * 0.01 * 100) / 100,
      pnl_percent: Math.round(pct * 100) / 100,
      status: "CLOSED",
      createdAt: new Date(now - i * 86400000),
      closedAt: new Date(now - i * 86400000 + 3600000),
    },
  });
}

console.log("Seed OK");
await prisma.$disconnect();
