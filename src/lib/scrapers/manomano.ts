import * as cheerio from "cheerio";
import { fetchHtml, parsePrice } from "./http";
import type { ScrapedOffer } from "./types";

// Source "prix haut" : recherche ManoMano.fr (JSON-LD prioritaire, fallback DOM)
export async function scrapeManoMano(query: string): Promise<ScrapedOffer | null> {
  const url = `https://www.manomano.fr/recherche/${encodeURIComponent(query)}`;
  const html = await fetchHtml(url);
  if (!html) return null;

  const $ = cheerio.load(html);

  // 1) JSON-LD (ItemList ou Product avec offers)
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    try {
      const data = JSON.parse($(el).contents().text());
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const products =
          item["@type"] === "ItemList"
            ? (item.itemListElement ?? []).map((e: { item?: unknown }) => e.item ?? e)
            : item["@type"] === "Product"
              ? [item]
              : [];
        for (const p of products) {
          const offer = Array.isArray(p?.offers) ? p.offers[0] : p?.offers;
          const price = offer?.price != null ? parsePrice(String(offer.price)) : null;
          if (price) {
            return {
              price,
              url: p.url ? new URL(p.url, "https://www.manomano.fr").toString() : url,
              title: p.name,
            };
          }
        }
      }
    } catch {
      // JSON-LD illisible : on tente le bloc suivant
    }
  }

  // 2) Fallback DOM : premier lien produit + premier prix affiché
  const link = $('a[href*="/p/"]').first();
  const priceText = $('[data-testid*="price"], [class*="price"]').first().text();
  const price = parsePrice(priceText);
  if (!price) return null;

  const href = link.attr("href");
  return {
    price,
    url: href ? new URL(href, "https://www.manomano.fr").toString() : url,
  };
}
