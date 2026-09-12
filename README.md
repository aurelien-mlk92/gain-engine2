# Gain Engine — Mode PAPER

Dashboard d'opportunités d'arbitrage (données simulées) + paper trading crypto (prix réels CoinGecko, **aucun argent réel** — éducatif uniquement).

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · Prisma 6 · Supabase Postgres · Recharts · Vercel Cron

## Démarrage local

```bash
npm install
npx prisma db push
npm run dev
```

Ouvrir http://localhost:3000/admin puis cliquer « Scanner maintenant » (ou appeler les crons ci-dessous) pour peupler la base.

## Variables d'environnement

| Variable | Description |
|---|---|
| `DATABASE_URL` | Pooler Supabase — région **aws-1-eu-west-1** (port 6543, `pgbouncer=true`) |
| `DIRECT_URL` | Connexion directe Supabase (port 5432) |
| `TELEGRAM_BOT_TOKEN` | Optionnel — alertes score > 85 |
| `TELEGRAM_CHAT_ID` | Optionnel |

## Moteurs (Vercel Cron — `vercel.json`)

| Route | Fréquence | Rôle |
|---|---|---|
| `/api/cron/scan` | toutes les 30 min | Génère 5–8 opportunités réalistes, purge > 7 jours |
| `/api/cron/trade` | toutes les 5 min | Paper trading BTC/ETH/SOL (prix CoinGecko), SL −5 % / TP +8 % |
| `/api/cron/alpha` | toutes les heures | Re-score les opportunités, alerte Telegram si score > 85 |

## Déploiement Vercel

1. Pousser le repo sur GitHub, importer dans Vercel.
2. Ajouter les 4 variables d'environnement ci-dessus (Production + Preview).
3. Déployer — les crons de `vercel.json` sont activés automatiquement.
