import { NextResponse } from "next/server";
import { getMode } from "@/lib/mode";
import { scanArbitrage } from "@/lib/engines";
import { scanLive } from "@/lib/scrapers";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

async function run() {
  console.log("[SCAN][CRON] start", new Date());
  const mode = getMode();
  try {
    if (mode === "LIVE") {
      const { count, skipped, errors } = await scanLive();
      return NextResponse.json({ success: true, mode, count, skipped, errors });
    }
    const count = await scanArbitrage();
    return NextResponse.json({ success: true, mode, count });
  } catch (e) {
    return NextResponse.json({ success: false, mode, error: String(e) }, { status: 500 });
  }
}

export async function GET() {
  return run();
}

export async function POST() {
  return run();
}
