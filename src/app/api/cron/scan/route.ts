import { NextResponse } from "next/server";
import { scanArbitrage } from "@/lib/engines";

export const dynamic = "force-dynamic";

async function run() {
  try {
    const count = await scanArbitrage();
    return NextResponse.json({ success: true, count });
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}

export async function GET() {
  return run();
}

export async function POST() {
  return run();
}
