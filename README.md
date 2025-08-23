# Compoundly (Starter)

This is a ready-to-run starter repo for the Compoundly MVP (read-only brokerage access).

## Quick start
```bash
cp .env.example .env.local
# fill in your Supabase values
npm install
npm run dev
# open http://localhost:3000
```

## What’s included
- Next.js App Router + Tailwind
- Supabase auth wiring
- API routes:
  - `POST /api/sync` (demo data import)
  - `POST /api/plan/compute` (contribution split + projection)
- Engines: projections & split
- Demo dashboard (sync + compute)

To deploy, push this repo to GitHub and import into Vercel. Set env vars from `.env.local`.
