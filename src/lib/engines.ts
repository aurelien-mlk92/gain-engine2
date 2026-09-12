import { prisma } from "@/lib/prisma";
import { subDays } from "date-fns";

const CATALOG = [
  { title: "Bosch Perceuse GSB 13 RE", base: 89, high: 129, sourceLow: "Amazon", sourceHigh: "ManoMano", image: "https://picsum.photos/seed/gsb13re/80/80", ean: "3165140371940" },
  { title: "Dyson V8 Absolute Aspirateur", base: 299, high: 399, sourceLow: "Amazon", sourceHigh: "Darty", image: "https://picsum.photos/seed/dysonv8/80/80", ean: "5025155025421" },
  { title: "Philips Hue White E27 x2", base: 19, high: 29, sourceLow: "Amazon", sourceHigh: "Fnac", image: "https://picsum.photos/seed/hue/80/80", ean: "8719514289193" },
  { title: "Karcher K5 Nettoyeur Haute Pression", base: 249, high: 329, sourceLow: "Amazon", sourceHigh: "Leroy Merlin", image: "https://picsum.photos/seed/k5/80/80", ean: "4054278608730" },
  { title: "Makita DDF485 Perceuse 18V", base: 119, high: 169, sourceLow: "Amazon", sourceHigh: "ManoMano", image: "https://picsum.photos/seed/ddf485/80/80", ean: "0088381860307" },
  { title: "Ninja Foodi MAX Friteuse AF400EU", base: 149, high: 219, sourceLow: "Amazon", sourceHigh: "Boulanger", image: "https://picsum.photos/seed/af400/80/80", ean: "0622356261791" },
  { title: "Tefal Ingenio Batterie 10 pièces", base: 99, high: 149, sourceLow: "Amazon", sourceHigh: "Carrefour", image: "https://picsum.photos/seed/ingenio/80/80", ean: "3168430310551" },
  { title: "Rowenta X-Force Flex 9.60", base: 199, high: 279, sourceLow: "Amazon", sourceHigh: "Darty", image: "https://picsum.photos/seed/xforce/80/80", ean: "3221614006661" },
];

const rand = (min: number, max: number) => Math.random() * (max - min) + min;

export async function scanArbitrage() {
  await prisma.opportunity.deleteMany({
    where: { createdAt: { lt: subDays(new Date(), 7) } },
  });

  const picks = [...CATALOG].sort(() => Math.random() - 0.5).slice(0, Math.floor(rand(5, 9)));
  let count = 0;

  for (const p of picks) {
    const low = Math.round(p.base * rand(0.92, 1.05) * 100) / 100;
    const high = Math.round(p.high * rand(0.95, 1.1) * 100) / 100;
    const diff = Math.round(((high - low) / low) * 100 * 10) / 10;
    if (diff <= 0) continue;

    const title = `${p.title} - ${p.sourceLow} ${low.toFixed(0)}€ vs ${p.sourceHigh} ${high.toFixed(0)}€`;
    const existing = await prisma.opportunity.findFirst({ where: { ean: p.ean } });
    const data = {
      title,
      image: p.image,
      ean: p.ean,
      price_low: low,
      price_high: high,
      diff_percent: diff,
      affiliate_url: "#",
      score: Math.floor(rand(60, 96)),
      source: "mock",
    };
    if (existing) {
      await prisma.opportunity.update({ where: { id: existing.id }, data });
    } else {
      await prisma.opportunity.create({ data });
    }
    count++;
  }
  return count;
}

// EDUCATIONAL ONLY - NO REAL MONEY
export async function paperTrading() {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=eur",
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const data: Record<string, { eur: number }> = await res.json();

  const prices: Record<string, number> = {
    BTC: data.bitcoin?.eur,
    ETH: data.ethereum?.eur,
    SOL: data.solana?.eur,
  };

  for (const [symbol, price] of Object.entries(prices)) {
    if (typeof price !== "number") continue;
    await prisma.price.create({ data: { symbol, price } });
  }

  const open = await prisma.paperTrade.findMany({ where: { status: "OPEN" } });

  if (open.length === 0) {
    const symbols = Object.keys(prices).filter((s) => typeof prices[s] === "number");
    const symbol = symbols[Math.floor(Math.random() * symbols.length)];
    if (symbol) {
      await prisma.paperTrade.create({
        data: { symbol, entry_price: prices[symbol], current_price: prices[symbol] },
      });
      return 1;
    }
    return 0;
  }

  let updated = 0;
  for (const t of open) {
    const price = prices[t.symbol];
    if (typeof price !== "number") continue;
    const pnl = (price - t.entry_price) * t.quantity;
    const pnlPct = ((price - t.entry_price) / t.entry_price) * 100;
    const shouldClose = pnlPct < -5 || pnlPct > 8;
    await prisma.paperTrade.update({
      where: { id: t.id },
      data: {
        current_price: price,
        pnl: Math.round(pnl * 100) / 100,
        pnl_percent: Math.round(pnlPct * 100) / 100,
        ...(shouldClose ? { status: "CLOSED", closedAt: new Date() } : {}),
      },
    });
    updated++;
  }
  return updated;
}

export async function alphaScoring() {
  const opportunities = await prisma.opportunity.findMany();
  const alerts: string[] = [];

  for (const o of opportunities) {
    const score = Math.min(100, Math.round(50 + o.diff_percent * 1.5 + rand(0, 10)));
    await prisma.opportunity.update({ where: { id: o.id }, data: { score } });
    if (score > 85) alerts.push(`🔥 ${o.title} — score ${score} (diff ${o.diff_percent}%)`);
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (alerts.length > 0 && token && chatId) {
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: alerts.join("\n") }),
      });
    } catch {
      // Telegram unreachable: scoring already persisted, nothing else to do
    }
  }
  return opportunities.length;
}
