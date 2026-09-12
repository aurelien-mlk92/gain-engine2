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

// Limiteur de concurrence maison (équivalent p-limit, sans dépendance)
function pLimit(concurrency: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= concurrency) await new Promise<void>((res) => queue.push(res));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}

async function scanProduct(product: RefProduct): Promise<ScrapeResult | { error: string }> {
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

// Scan LIVE par batch : `limit` produits par invocation (budget 10 s Hobby),
// les moins récemment scannés d'abord. Cache DB 1 h par produit.
export async function scanLive(limit = 2) {
  // Dernier scan par EAN (lignes LIVE existantes)
  const rows = await prisma.opportunity.findMany({
    where: {
      ean: { in: CATALOG.map((p) => p.ean) },
      source: { startsWith: LIVE_SOURCE_PREFIX },
    },
    select: { ean: true, updatedAt: true },
    orderBy: { updatedAt: "asc" },
  });
  const lastScanned = new Map<string, Date>();
  for (const r of rows) if (r.ean) lastScanned.set(r.ean, r.updatedAt); // le plus récent gagne

  const cacheFloor = subHours(new Date(), CACHE_HOURS);
  const eligible = CATALOG.filter((p) => {
    const last = lastScanned.get(p.ean);
    return !last || last < cacheFloor;
  }).sort(
    (a, b) => (lastScanned.get(a.ean)?.getTime() ?? 0) - (lastScanned.get(b.ean)?.getTime() ?? 0)
  );

  const batch = eligible.slice(0, Math.max(1, limit));
  const skipped = CATALOG.length - eligible.length;
  const remaining = eligible.length - batch.length;
  const nextCursor = eligible[batch.length]?.ean ?? null;

  const run = pLimit(3);
  const settled = await Promise.allSettled(batch.map((p) => run(() => scanProduct(p))));

  const results: ScrapeResult[] = [];
  const errors: ScanError[] = [];
  settled.forEach((s, i) => {
    const name = batch[i].name;
    if (s.status === "rejected") {
      errors.push({ product: name, error: `EXCEPTION_${String(s.reason)}` });
    } else if ("error" in s.value) {
      errors.push({ product: name, error: s.value.error });
    } else {
      results.push(s.value);
    }
  });

  return {
    count: results.length,
    skipped,
    scanned: batch.map((p) => p.name),
    remaining,
    nextCursor,
    errors,
    results,
  };
}
