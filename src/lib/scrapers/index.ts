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

// Estampille CHAQUE tentative (succès ou échec) : c'est ce qui fait tourner
// la rotation des batchs et empêche de re-scanner le même produit en boucle.
async function stampScan(ean: string, error: string | null, low?: number, high?: number) {
  const data = {
    lastScannedAt: new Date(),
    lastError: error,
    lastPriceLow: low ?? null,
    lastPriceHigh: high ?? null,
  };
  await prisma.scanState.upsert({
    where: { ean },
    update: data,
    create: { ean, ...data },
  });
}

async function scanProduct(product: RefProduct): Promise<ScrapeResult | { error: string }> {
  const [low, high] = await Promise.all([scrapeAmazon(product), scrapeManoMano(product)]);

  const errs: string[] = [];
  if (!low.offer) errs.push(`amazon KO (${low.error})`);
  if (!high.offer) errs.push(`comparateur KO (${high.error})`);
  if (errs.length > 0) {
    const error = errs.join(", ");
    await stampScan(product.ean, error, low.offer?.price, high.offer?.price);
    return { error };
  }

  const lowOffer = low.offer!;
  const highOffer = high.offer!;
  if (highOffer.price <= lowOffer.price) {
    const error = `pas d'écart exploitable (${lowOffer.price}€ vs ${highOffer.price}€)`;
    await stampScan(product.ean, error, lowOffer.price, highOffer.price);
    return { error };
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

  await stampScan(product.ean, null, lowOffer.price, highOffer.price);

  return {
    productName: product.name,
    prixBas: lowOffer.price,
    prixHaut: highOffer.price,
    diffPercent,
    source,
    urlOffre: lowOffer.url,
  };
}

// Scan LIVE par batch : `limit` produits par invocation (budget 10 s Hobby).
// Tri sur ScanState.lastScannedAt ASC, jamais scannés (NULL) d'abord ;
// un produit tenté (même en échec) sort de la rotation pendant 1 h.
export async function scanLive(limit = 2) {
  const states = await prisma.scanState.findMany({
    where: { ean: { in: CATALOG.map((p) => p.ean) } },
  });
  const lastMap = new Map(states.map((s) => [s.ean, s.lastScannedAt]));

  const cacheFloor = subHours(new Date(), CACHE_HOURS);
  const eligible = CATALOG.filter((p) => {
    const last = lastMap.get(p.ean);
    return !last || last < cacheFloor;
  }).sort(
    (a, b) => (lastMap.get(a.ean)?.getTime() ?? 0) - (lastMap.get(b.ean)?.getTime() ?? 0)
  );

  const batch = eligible.slice(0, Math.max(1, limit));
  const skipped = CATALOG.length - eligible.length;
  const remaining = eligible.length - batch.length;

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

  // Curseur = lastScannedAt du dernier produit traité de ce batch
  const lastEan = batch[batch.length - 1]?.ean;
  const lastState = lastEan
    ? await prisma.scanState.findUnique({ where: { ean: lastEan } })
    : null;
  const nextCursor = remaining > 0 ? (lastState?.lastScannedAt.toISOString() ?? null) : null;

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
