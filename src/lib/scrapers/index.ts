import { prisma } from "@/lib/prisma";
import { subHours } from "date-fns";
import { scrapeAmazon } from "./amazon";
import { scrapeManoMano } from "./manomano";
import { CATALOG, SOURCE_RELIABILITY, type RefProduct, type ScanError, type ScrapeResult } from "./types";

const LIVE_SOURCE_PREFIX = "amazon→";
const CACHE_HOURS = 1;

function computeScore(diffPercent: number, low: string, high: string): number {
  const reliability = ((SOURCE_RELIABILITY[low] ?? 10) + (SOURCE_RELIABILITY[high] ?? 10)) / 2;
  return Math.max(0, Math.min(100, Math.round(diffPercent * 1.5 + reliability)));
}

async function scanProduct(product: RefProduct): Promise<ScrapeResult | { skipped: true } | { error: string }> {
  const fresh = await prisma.opportunity.findFirst({
    where: {
      ean: product.ean,
      source: { startsWith: LIVE_SOURCE_PREFIX },
      updatedAt: { gte: subHours(new Date(), CACHE_HOURS) },
    },
  });
  if (fresh) return { skipped: true };

  const [low, high] = await Promise.all([scrapeAmazon(product), scrapeManoMano(product)]);

  const errs: string[] = [];
  if (!low.offer) errs.push(`amazon KO (${low.error})`);
  if (!high.offer) errs.push(`comparateur KO (${high.error})`);
  if (errs.length > 0) return { error: errs.join(", ") };

  const lowOffer = low.offer!;
  const highOffer = high.offer!;
  if (highOffer.price <= lowOffer.price) {
    return { error: `pas d'écart exploitable (${lowOffer.price}€ vs ${highOffer.price}€)` };
  }

  const highName = highOffer.sourceName ?? "manomano";
  const source = `${LIVE_SOURCE_PREFIX}${highName}`;
  const diffPercent = Math.round(((highOffer.price - lowOffer.price) / lowOffer.price) * 1000) / 10;

  const data = {
    title: `${product.name} - Amazon ${lowOffer.price.toFixed(2)}€ vs ${highName} ${highOffer.price.toFixed(2)}€`,
    image: product.image,
    ean: product.ean,
    price_low: lowOffer.price,
    price_high: highOffer.price,
    diff_percent: diffPercent,
    affiliate_url: lowOffer.url,
    score: computeScore(diffPercent, "amazon", highName),
    source,
  };

  // Upsert par EAN : jamais de suppression, les anciennes données restent si échec
  const existing = await prisma.opportunity.findFirst({
    where: { ean: product.ean, source: { startsWith: LIVE_SOURCE_PREFIX } },
  });
  if (existing) {
    await prisma.opportunity.update({ where: { id: existing.id }, data });
  } else {
    await prisma.opportunity.create({ data });
  }

  return {
    productName: product.name,
    prixBas: lowOffer.price,
    prixHaut: highOffer.price,
    diffPercent,
    source,
    urlOffre: lowOffer.url,
  };
}

// Scan LIVE : produits en parallèle (allSettled), cache DB 1 h par produit.
export async function scanLive() {
  const settled = await Promise.allSettled(CATALOG.map((p) => scanProduct(p)));

  const results: ScrapeResult[] = [];
  const errors: ScanError[] = [];
  let skipped = 0;

  settled.forEach((s, i) => {
    const name = CATALOG[i].name;
    if (s.status === "rejected") {
      errors.push({ product: name, error: `EXCEPTION_${String(s.reason)}` });
    } else if ("skipped" in s.value) {
      skipped++;
    } else if ("error" in s.value) {
      errors.push({ product: name, error: s.value.error });
    } else {
      results.push(s.value);
    }
  });

  return { count: results.length, skipped, errors, results };
}
