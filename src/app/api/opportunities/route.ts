import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const opportunities = await prisma.opportunity.findMany({
      orderBy: { score: "desc" },
    });
    return NextResponse.json(opportunities);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
