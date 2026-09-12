import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { format, startOfDay, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import { getMode } from "@/lib/mode";
import { CATALOG } from "@/lib/scrapers/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const todayStart = startOfDay(new Date());
    const weekStart = startOfDay(subDays(new Date(), 6));

    const trades = await prisma.paperTrade.findMany({
      where: {
        OR: [{ status: "OPEN" }, { closedAt: { gte: weekStart } }],
      },
    });

    const pnlDate = (t: (typeof trades)[number]) => t.closedAt ?? t.createdAt;
    const gainToday = trades
      .filter((t) => t.status === "OPEN" || pnlDate(t) >= todayStart)
      .reduce((s, t) => s + t.pnl, 0);
    const profit7d = trades.reduce((s, t) => s + t.pnl, 0);

    const chartData = Array.from({ length: 7 }, (_, i) => {
      const day = startOfDay(subDays(new Date(), 6 - i));
      const next = startOfDay(subDays(new Date(), 5 - i));
      const pnl = trades
        .filter((t) => {
          const d = t.status === "OPEN" ? new Date() : pnlDate(t);
          return d >= day && d < next;
        })
        .reduce((s, t) => s + t.pnl, 0);
      return { day: format(day, "EEE d", { locale: fr }), profit: Math.round(pnl * 100) / 100 };
    });

    const [opportunitiesCount, hotCount, scoreAgg, topCount, states] = await Promise.all([
      prisma.opportunity.count(),
      prisma.opportunity.count({ where: { diff_percent: { gt: 15 } } }),
      prisma.opportunity.aggregate({ _avg: { score: true } }),
      prisma.opportunity.count({ where: { score: { gt: 80 } } }),
      prisma.scanState.findMany({ orderBy: { lastScannedAt: "desc" } }),
    ]);

    const nameByEan = new Map(CATALOG.map((p) => [p.ean, p.name]));
    const scanStates = states.map((s) => ({
      product: nameByEan.get(s.ean) ?? s.ean,
      ean: s.ean,
      lastScannedAt: s.lastScannedAt,
      lastPriceLow: s.lastPriceLow,
      lastPriceHigh: s.lastPriceHigh,
      lastError: s.lastError,
    }));

    return NextResponse.json({
      mode: getMode(),
      scanStates,
      gainToday: Math.round(gainToday * 100) / 100,
      profitToday: Math.round(gainToday * 100) / 100,
      profit7d: Math.round(profit7d * 100) / 100,
      opportunitiesCount,
      hotCount,
      avgScore: Math.round(scoreAgg._avg.score ?? 0),
      topCount,
      chartData,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
