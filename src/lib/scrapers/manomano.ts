import { getShoppingResults } from "./serpapi";
import type { RefProduct, SourceResult } from "./types";

// Prix haut via SerpAPI Google Shopping (le scraping HTML ManoMano est bloqué
// par Cloudflare sur Vercel). Priorité au prix ManoMano ; sinon l'offre la
// moins chère hors Amazon (Amazon sert déjà de prix bas).
export async function scrapeManoMano(product: RefProduct): Promise<SourceResult> {
  const { items, error } = await getShoppingResults(product);
  if (error) return { offer: null, error };

  const manomano = items.find((r) => /manomano/i.test(r.source ?? ""));
  const candidates = manomano ? [manomano] : items.filter((r) => !/amazon/i.test(r.source ?? ""));
  if (candidates.length === 0) return { offer: null, error: "SERPAPI_NO_NON_AMAZON_RESULTS" };

  const pick = candidates.reduce((a, b) => (a.priceNum <= b.priceNum ? a : b));

  return {
    offer: {
      price: pick.priceNum,
      url: pick.product_link ?? pick.link ?? "",
      title: pick.title,
      sourceName: manomano ? "manomano" : (pick.source ?? "google-shopping"),
    },
  };
}
