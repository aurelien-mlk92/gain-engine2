import { NextRequest, NextResponse } from "next/server";
import { getMode } from "@/lib/mode";
import { scanArbitrage } from "@/lib/engines";
import { scanLive } from "@/lib/scrapers";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

async function run(req: NextRequest) {
  const mode = getMode();
  const limit = Math.min(4, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "2", 10) || 2));
  console.log(`[SCAN][CRON] ${mode} start`, new Date().toISOString());
  try {
    if (mode === "LIVE") {
      const { count, skipped, scanned, remaining, nextCursor, errors } = await scanLive(limit);
      console.log("[SCAN] batch", limit, "remaining", remaining);
      return json({ success: true, mode, count, skipped, scanned, remaining, nextCursor, errors });
    }
    const count = await scanArbitrage();
    return json({ success: true, mode, count, remaining: 0 });
  } catch (e) {
    return json({ success: false, mode, error: String(e) }, 500);
  }
}

export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}
