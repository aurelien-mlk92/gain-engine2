import * as cheerio from "cheerio";
import { fetchHtml, parsePrice } from "./http";
import type { ScrapedOffer } from "./types";

// Source "prix bas" : première offre de la recherche Amazon.fr
export async function scrapeAmazon(query: string): Promise<ScrapedOffer | null> {
  const url = `https://www.amazon.fr/s?k=${encodeURIComponent(query)}`;
  const html = await fetchHtml(url);
  if (!html) return null;

  const $ = cheerio.load(html);
  const first = $('div[data-component-type="s-search-result"]').first();
  if (first.length === 0) return null;

  const priceText = first.find(".a-price .a-offscreen").first().text();
  const price = parsePrice(priceText);
  if (!price) return null;

  const href = first.find("h2 a, a.a-link-normal.s-link-style").first().attr("href") ?? "";
  const title = first.find("h2").first().text().trim();

  return {
    price,
    url: href ? new URL(href, "https://www.amazon.fr").toString() : url,
    title: title || undefined,
  };
}
