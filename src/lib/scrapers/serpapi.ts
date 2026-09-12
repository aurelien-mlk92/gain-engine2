import { fetchJson, parsePrice } from "./http";

// Appel SerpAPI Google Shopping partagé entre les sources (prix bas Amazon en
// fallback + prix haut comparateur) : 1 seule requête par produit et par scan
// pour préserver le quota gratuit (100 recherches/mois).
export type ShoppingItem = {
  title?: string;
  source?: string;
  link?: string;
  product_link?: string;
  priceNum: number;
};

type SerpApiResponse = {
  error?: string;
  shopping_results?: {
    title?: string;
    source?: string;
    price?: string;
    extracted_price?: number;
    link?: string;
    product_link?: string;
  }[];
};

type CacheEntry = { at: number; promise: Promise<{ items: ShoppingItem[]; error?: string }> };
const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

async function fetchShopping(query: string): Promise<{ items: ShoppingItem[]; error?: string }> {
  const key = process.env.SERPAPI_KEY;
  if (!key) return { items: [], error: "MISSING_SERPAPI_KEY" };

  const url = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(query)}&gl=fr&hl=fr&api_key=${key}`;
  const { data, error } = await fetchJson<SerpApiResponse>("serpapi", url);
  if (!data) return { items: [], error: error ?? "SERPAPI_NO_RESPONSE" };
  if (data.error) return { items: [], error: `SERPAPI_${data.error}` };

  const items = (data.shopping_results ?? [])
    .map((r) => ({
      title: r.title,
      source: r.source,
      link: r.link,
      product_link: r.product_link,
      priceNum: r.extracted_price ?? (r.price ? parsePrice(r.price) : null),
    }))
    .filter((r) => r.priceNum != null && r.priceNum > 0)
    .map((r) => ({ ...r, priceNum: r.priceNum as number }));

  if (items.length === 0) return { items: [], error: "SERPAPI_NO_SHOPPING_RESULTS" };
  return { items };
}

export function getShoppingResults(query: string) {
  const now = Date.now();
  const hit = cache.get(query);
  if (hit && now - hit.at < TTL_MS) return hit.promise;
  const promise = fetchShopping(query);
  cache.set(query, { at: now, promise });
  return promise;
}
