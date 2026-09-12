import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

export async function GET() {
  try {
    const opportunities = await prisma.opportunity.findMany({
      orderBy: { score: "desc" },
    });
    return json(opportunities);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
}

// DELETE /api/opportunities?source=mock : purge ciblée (source obligatoire
// pour ne jamais vider toute la table par accident)
export async function DELETE(req: NextRequest) {
  const source = req.nextUrl.searchParams.get("source");
  if (!source) {
    return json({ success: false, error: "param ?source= requis (ex: source=mock)" }, 400);
  }
  try {
    const { count } = await prisma.opportunity.deleteMany({ where: { source } });
    return json({ success: true, deleted: count, source });
  } catch (e) {
    return json({ success: false, error: String(e) }, 500);
  }
}
