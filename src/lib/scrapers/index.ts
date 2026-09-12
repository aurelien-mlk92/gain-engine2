import { prisma } from "@/lib/prisma";
import { subHours } from "date-fns";
import { scrapeAmazon } from "./amazon";
import { scrapeManoMano } from "./manomano";
import { CATALOG, SOURCE_RELIABILITY, type ScrapeResult } from "./types";

const LIVE_SOURCE = "amazon→manomano";
const CACHE_HOURS = 1;

function computeScore(diffPercent: number, low: string, high: string): number {
  const reliability = ((SOURCE_RELIABILITY[low] ?? 10) + (SOURCE_RELIABILITY[high] ?? 10)) / 2;
  return Math.max(0, Math.min(100, Math.round(diffPercent * 1.5 + reliability)));
}

// Scan LIVE : Amazon (prix bas) vs ManoMano (prix haut) pour chaque produit
// du catalogue. Cache DB 1 h : un produit déjà rafraîchi est sauté.
export async function scanLive() {
  const results: ScrapeResult[] = [];
  const errors: string[] = [];
  let skipped = 0;

  for (const product of CATALOG) {
    const fresh = await prisma.opportunity.findFirst({
      where: {
        ean: product.ean,
        source: LIVE_SOURCE,
        updatedAt: { gte: subHours(new Date(), CACHE_HOURS) },
      },
    });
    if (fresh) {
      skipped++;
      continue;
    }

    const [low, high] = await Promise.all([
      scrapeAmazon(product.query),
      scrapeManoMano(product.query),
    ]);

    if (!low || !high) {
      errors.push(
        `${product.name}: ${!low ? "amazon KO" : ""}${!low && !high ? ", " : ""}${!high ? "manomano KO" : ""}`
      );
      continue;
    }
    if (high.price <= low.price) {
      errors.push(`${product.name}: pas d'écart exploitable (${low.price}€ vs ${high.price}€)`);
      continue;
    }

    const diffPercent = Math.round(((high.price - low.price) / low.price) * 1000) / 10;
    const result: ScrapeResult = {
      productName: product.name,
      prixBas: low.price,
      prixHaut: high.price,
      diffPercent,
      source: LIVE_SOURCE,
      urlOffre: low.url,
    };
    results.push(result);

    const data = {
      title: `${product.name} - Amazon ${low.price.toFixed(2)}€ vs ManoMano ${high.price.toFixed(2)}€`,
      image: product.image,
      ean: product.ean,
      price_low: low.price,
      price_high: high.price,
      diff_percent: diffPercent,
      affiliate_url: low.url,
      score: computeScore(diffPercent, "amazon", "manomano"),
      source: LIVE_SOURCE,
    };
    const existing = await prisma.opportunity.findFirst({
      where: { ean: product.ean, source: LIVE_SOURCE },
    });
    if (existing) {
      await prisma.opportunity.update({ where: { id: existing.id }, data });
    } else {
      await prisma.opportunity.create({ data });
    }
  }

  return { count: results.length, skipped, errors, results };
}
