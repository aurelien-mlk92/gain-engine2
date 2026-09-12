import { fetchJson, parsePrice } from "./http";
import type { RefProduct, SourceResult } from "./types";

// Prix haut via SerpAPI Google Shopping (le scraping HTML ManoMano est bloqué
// par Cloudflare sur Vercel). Priorité au prix ManoMano, sinon le moins cher.
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

export async function scrapeManoMano(product: RefProduct): Promise<SourceResult> {
  const key = process.env.SERPAPI_KEY;
  if (!key) return { offer: null, error: "MISSING_SERPAPI_KEY" };

  const url = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(product.query)}&gl=fr&hl=fr&api_key=${key}`;

  const { data, error } = await fetchJson<SerpApiResponse>("serpapi", url);
  if (!data) return { offer: null, error: error ?? "SERPAPI_NO_RESPONSE" };
  if (data.error) return { offer: null, error: `SERPAPI_${data.error}` };

  const results = (data.shopping_results ?? [])
    .map((r) => ({ ...r, priceNum: r.extracted_price ?? (r.price ? parsePrice(r.price) : null) }))
    .filter((r): r is typeof r & { priceNum: number } => r.priceNum != null && r.priceNum > 0);

  if (results.length === 0) return { offer: null, error: "SERPAPI_NO_SHOPPING_RESULTS" };

  const manomano = results.find((r) => /manomano/i.test(r.source ?? ""));
  const pick = manomano ?? results.reduce((a, b) => (a.priceNum <= b.priceNum ? a : b));

  return {
    offer: {
      price: pick.priceNum,
      url: pick.product_link ?? pick.link ?? url,
      title: pick.title,
      sourceName: manomano ? "manomano" : (pick.source ?? "google-shopping"),
    },
  };
}
