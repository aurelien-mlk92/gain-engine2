import { fetchJson } from "./http";
import { getShoppingResults } from "./serpapi";
import type { RefProduct, SourceResult } from "./types";

// Prix bas Amazon.fr via Keepa API (le scraping HTML direct est bloqué sur
// Vercel : IP datacenter -> challenge JS). domain=5 = amazon.fr, prix en centimes.
type KeepaResponse = {
  error?: { message?: string };
  products?: {
    asin: string;
    title?: string;
    stats?: { current?: number[] };
  }[];
};

// stats.current : 0 = prix AMAZON, 1 = prix NEW (3P), 18 = Buy Box
const PRICE_INDEXES = [0, 1, 18];

// Fallback sans Keepa : prix Amazon extrait des résultats Google Shopping
// (même requête SerpAPI que le prix haut, donc aucun coût supplémentaire).
async function amazonViaShopping(product: RefProduct): Promise<SourceResult> {
  const { items, error } = await getShoppingResults(product);
  if (error) return { offer: null, error: `MISSING_KEEPA_API_KEY + ${error}` };

  const amazon = items.filter((r) => /amazon/i.test(r.source ?? ""));
  if (amazon.length === 0) {
    return { offer: null, error: "MISSING_KEEPA_API_KEY + AMAZON_NOT_IN_SHOPPING_RESULTS" };
  }

  const pick = amazon.reduce((a, b) => (a.priceNum <= b.priceNum ? a : b));
  return {
    offer: { price: pick.priceNum, url: pick.product_link ?? pick.link ?? "", title: pick.title },
  };
}

export async function scrapeAmazon(product: RefProduct): Promise<SourceResult> {
  const key = process.env.KEEPA_API_KEY;
  if (!key) return amazonViaShopping(product);

  // ASIN connu en priorité, sinon lookup Keepa par EAN (param code)
  const idParam = product.asin ? `asin=${product.asin}` : `code=${product.ean}`;
  const url = `https://api.keepa.com/product?key=${key}&domain=5&${idParam}&stats=90`;

  const { data, error } = await fetchJson<KeepaResponse>("keepa", url);
  if (!data) return { offer: null, error: error ?? "KEEPA_NO_RESPONSE" };
  if (data.error) return { offer: null, error: `KEEPA_${data.error.message ?? "error"}` };

  const p = data.products?.[0];
  if (!p) return { offer: null, error: "KEEPA_PRODUCT_NOT_FOUND" };

  const current = p.stats?.current ?? [];
  const cents = PRICE_INDEXES.map((i) => current[i]).find((v) => typeof v === "number" && v > 0);
  if (!cents) return { offer: null, error: "KEEPA_NO_CURRENT_PRICE" };

  return {
    offer: {
      price: Math.round(cents) / 100,
      url: `https://www.amazon.fr/dp/${p.asin}`,
      title: p.title,
    },
  };
}
