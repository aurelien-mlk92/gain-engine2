// Requêtes HTTP "navigateur" : headers réalistes, timeout, détection anti-bot.
// Volume volontairement faible (catalogue < 10 produits, cache DB 1 h).
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.5",
  "Cache-Control": "no-cache",
  "Upgrade-Insecure-Requests": "1",
};

const BOT_MARKERS = [
  "captcha",
  "api-services-support@amazon.com",
  "datadome",
  "Access Denied",
  "blocked",
];

export async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();
    const head = html.slice(0, 4000).toLowerCase();
    if (BOT_MARKERS.some((m) => head.includes(m.toLowerCase()))) return null;
    return html;
  } catch {
    return null;
  }
}

// "92,79 €" | "1 299,00 €" | "92.79" -> number
export function parsePrice(raw: string): number | null {
  const cleaned = raw
    .replace(/ | /g, "")
    .replace(/[^\d,.]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 && n < 100000 ? n : null;
}
