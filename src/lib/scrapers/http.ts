// Client HTTP des sources LIVE : timeout 8 s, log détaillé, pas de retry.
// Aucun fallback mock ici : en MODE=LIVE une source en échec retourne une
// erreur explicite, jamais de fausse donnée.
const TIMEOUT_MS = 8000;

export type FetchJsonResult<T> = { data: T | null; error?: string };

export async function fetchJson<T>(source: string, url: string): Promise<FetchJsonResult<T>> {
  const safeUrl = url.replace(/(key|api_key)=[^&]+/gi, "$1=***");
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      const error = `HTTP_${res.status}_${res.statusText || "error"}`;
      console.log("[SCRAPER]", source, safeUrl, res.status, error);
      return { data: null, error };
    }
    const data = (await res.json()) as T;
    console.log("[SCRAPER]", source, safeUrl, res.status, "OK");
    return { data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const error = msg.includes("timeout") || msg.includes("aborted") ? `TIMEOUT_${TIMEOUT_MS}ms` : `FETCH_${msg}`;
    console.log("[SCRAPER]", source, safeUrl, 0, error);
    return { data: null, error };
  }
}

// "92,79 €" | "1 299,00 €" | 92.79 -> number
export function parsePrice(raw: string | number): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : null;
  const cleaned = raw
    .replace(/ | /g, "")
    .replace(/[^\d,.]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 && n < 100000 ? n : null;
}
