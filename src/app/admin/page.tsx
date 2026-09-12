"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Stats = {
  mode: "PAPER" | "LIVE";
  gainToday: number;
  profitToday: number;
  profit7d: number;
  opportunitiesCount: number;
  hotCount: number;
  avgScore: number;
  topCount: number;
  chartData: { day: string; profit: number }[];
};

type Opportunity = {
  id: string;
  title: string;
  image: string | null;
  price_low: number;
  price_high: number;
  diff_percent: number;
  affiliate_url: string | null;
  score: number;
  source: string;
};

const eur = (n: number) =>
  n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    const [s, o] = await Promise.all([
      fetch("/api/stats").then((r) => r.json()),
      fetch("/api/opportunities").then((r) => r.json()),
    ]);
    if (!s.error) setStats(s);
    if (Array.isArray(o)) setOpportunities(o);
    setUpdatedAt(new Date().toLocaleString("fr-FR"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const scanNow = async () => {
    setScanning(true);
    try {
      // Le scan est batché (2 produits / appel, budget 10 s Vercel Hobby) :
      // on enchaîne les batchs jusqu'à épuisement, puis refresh
      let remaining = 1;
      for (let i = 0; i < 6 && remaining > 0; i++) {
        const r = await fetch("/api/scan", { method: "POST" }).then((res) => res.json());
        remaining = r?.remaining ?? 0;
      }
      await load();
    } finally {
      setScanning(false);
    }
  };

  const exportCsv = async () => {
    // Export depuis la DB (état courant), pas depuis le state React
    const fresh: Opportunity[] = await fetch("/api/opportunities").then((r) => r.json());
    const data = Array.isArray(fresh) ? fresh : opportunities;
    const header = "titre;prix_bas;prix_haut;diff_percent;score;source";
    const rows = data.map(
      (o) =>
        `"${o.title.replace(/"/g, '""')}";${o.price_low};${o.price_high};${o.diff_percent};${o.score};${o.source}`
    );
    const blob = new Blob([[header, ...rows].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "opportunites.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Tableau de bord</h1>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                stats?.mode === "LIVE"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              Mode {stats?.mode ?? "PAPER"}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {updatedAt ? `Mis à jour le ${updatedAt}` : "Chargement…"}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={exportCsv}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-slate-100"
          >
            Export CSV
          </button>
          <button
            onClick={scanNow}
            disabled={scanning}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {scanning ? "Scan en cours…" : "Scanner maintenant"}
          </button>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          label="Gain du jour"
          value={stats ? eur(stats.gainToday) : "—"}
          sub="PnL paper trading (aujourd'hui)"
          accent={stats && stats.gainToday >= 0 ? "text-emerald-600" : "text-red-600"}
        />
        <Card
          label="Bénéfice net du jour"
          value={stats ? eur(stats.profitToday) : "—"}
          sub={stats ? `7 jours : ${eur(stats.profit7d)}` : ""}
          accent={stats && stats.profitToday >= 0 ? "text-emerald-600" : "text-red-600"}
        />
        <Card
          label="Opportunités en cours"
          value={stats ? String(stats.hotCount) : "—"}
          sub={stats ? `${stats.opportunitiesCount} créées, en cours` : ""}
          accent="text-slate-900"
        />
        <Card
          label="Score moyen"
          value={stats ? `${stats.avgScore}/100` : "—"}
          sub={stats ? `${stats.topCount} opportunités >80` : ""}
          accent="text-slate-900"
        />
      </div>

      <div className="mb-8 rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold">Bénéfice net sur 7 jours</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats?.chartData ?? []}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} />
              <Tooltip formatter={(v) => [eur(Number(v)), "Bénéfice"]} />
              <Bar dataKey="profit" fill="#10B981" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl bg-white shadow">
        <h2 className="px-6 pt-6 text-lg font-semibold">
          Opportunités ({opportunities.length})
        </h2>
        <div className="overflow-x-auto p-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-slate-500">
                <th className="pb-3 pr-4">Produit</th>
                <th className="pb-3 pr-4">Prix bas</th>
                <th className="pb-3 pr-4">Prix haut</th>
                <th className="pb-3 pr-4">Diff %</th>
                <th className="pb-3 pr-4">Score</th>
                <th className="pb-3 pr-4">Source</th>
                <th className="pb-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {opportunities.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Aucune opportunité — lancez un scan.
                  </td>
                </tr>
              )}
              {opportunities.map((o) => (
                <tr key={o.id} className="border-b last:border-0">
                  <td className="max-w-md py-3 pr-4">
                    <div className="flex items-center gap-3">
                      {o.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={o.image}
                          alt=""
                          className="h-10 w-10 rounded-lg object-cover"
                        />
                      )}
                      <span className="font-medium">{o.title}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4">{eur(o.price_low)}</td>
                  <td className="py-3 pr-4">{eur(o.price_high)}</td>
                  <td className="py-3 pr-4">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        o.diff_percent > 20
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      +{o.diff_percent}%
                    </span>
                  </td>
                  <td className="py-3 pr-4 font-semibold">{o.score}</td>
                  <td className="py-3 pr-4 text-slate-500">{o.source}</td>
                  <td className="py-3">
                    <a
                      href={o.affiliate_url ?? "#"}
                      className="text-emerald-600 hover:underline"
                    >
                      Voir l&apos;offre
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

function Card({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${accent}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-400">{sub}</p>
    </div>
  );
}
