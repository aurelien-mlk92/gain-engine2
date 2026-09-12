import { NextResponse } from "next/server";
import { getMode } from "@/lib/mode";
import { scanArbitrage } from "@/lib/engines";
import { scanLive } from "@/lib/scrapers";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function POST() {
  console.log("[SCAN] start", new Date());
  const mode = getMode();
  try {
    if (mode === "LIVE") {
      const { count, skipped, errors, results } = await scanLive();
      console.log("[SCAN] done", { count, skipped, errorCount: errors.length });
      return NextResponse.json({ success: true, mode, count, skipped, errors, results });
    }
    const count = await scanArbitrage();
    return NextResponse.json({ success: true, mode, count });
  } catch (e) {
    console.log("[SCAN] fatal", String(e));
    return NextResponse.json({ success: false, mode, error: String(e) }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}
