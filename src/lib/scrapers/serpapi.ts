import { fetchJson, parsePrice } from "./http";
import type { RefProduct } from "./types";

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

// Requête stricte : nom exact entre guillemets + EAN + exclusions accessoires
function buildQuery(product: RefProduct): string {
  const excludes = ["accessoire", ...(product.exclude ?? [])].map((e) => `-${e}`).join(" ");
  return `"${product.query}" ${product.ean} ${excludes}`;
}

// Le titre doit contenir au moins 2 mots-clés du produit (ex: Bosch + GSB),
// sinon c'est un accessoire ou un autre produit -> mismatch_produit.
function titleMatches(title: string, product: RefProduct): boolean {
  const tokens = product.query.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
  const t = title.toLowerCase();
  const hits = tokens.filter((tok) => t.includes(tok)).length;
  return hits >= Math.min(2, tokens.length);
}

type CacheEntry = { at: number; promise: Promise<{ items: ShoppingItem[]; error?: string }> };
const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

async function fetchShopping(product: RefProduct): Promise<{ items: ShoppingItem[]; error?: string }> {
  const key = process.env.SERPAPI_KEY;
  if (!key) return { items: [], error: "MISSING_SERPAPI_KEY" };

  const q = buildQuery(product);
  const url = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(q)}&gl=fr&hl=fr&api_key=${key}`;

  const { data, error } = await fetchJson<SerpApiResponse>("serpapi", url);
  if (!data) return { items: [], error: error ?? "SERPAPI_NO_RESPONSE" };
  if (data.error) return { items: [], error: `SERPAPI_${data.error}` };

  const raw = (data.shopping_results ?? [])
    .map((r) => ({
      title: r.title,
      source: r.source,
      link: r.link,
      product_link: r.product_link,
      priceNum: r.extracted_price ?? (r.price ? parsePrice(r.price) : null),
    }))
    .filter((r) => r.priceNum != null && r.priceNum > 0)
    .map((r) => ({ ...r, priceNum: r.priceNum as number }));

  if (raw.length === 0) return { items: [], error: "SERPAPI_NO_SHOPPING_RESULTS" };

  // Plancher anti-accessoire (35% du prix de base) + validation du titre
  const priceFloor = product.basePrice * 0.35;
  const items = raw.filter(
    (r) => r.priceNum >= priceFloor && (!r.title || titleMatches(r.title, product))
  );

  if (items.length === 0) {
    return {
      items: [],
      error: `mismatch_produit (${raw.length} resultats rejetes: titre ou prix < ${priceFloor.toFixed(0)}€)`,
    };
  }
  return { items };
}

export function getShoppingResults(product: RefProduct) {
  const now = Date.now();
  const hit = cache.get(product.ean);
  if (hit && now - hit.at < TTL_MS) return hit.promise;
  const promise = fetchShopping(product);
  cache.set(product.ean, { at: now, promise });
  return promise;
}
