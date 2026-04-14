# Tristar PT — Referral Intelligence

Live referral-intelligence dashboard for Tristar Physical Therapy. Reads case-level data from Supabase, rendered with Next.js on Vercel.

## Architecture

- **Database**: Supabase Postgres (`ucsbezjalvewvksrjqgl`, us-east-1, HIPAA BAA)
- **App**: Next.js 14 (App Router) on Vercel
- **Data flow**: Prompt EMR → XLSX → seeder script → Supabase → Next.js SSR → browser
- **Brand**: Tristar orange (#FF8200) + peach (#FFEAD5) via Tailwind

## Environment variables (Vercel)

```
NEXT_PUBLIC_SUPABASE_URL=https://ucsbezjalvewvksrjqgl.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=<server-only, for ingestion scripts>
```

## Local development

```bash
npm install
cp .env.example .env.local
# fill in the Supabase keys
npm run dev
```

## Schema

- `physicians` — NPI-keyed, includes `departed` flag (Caldwell/Grimaldi auto-excluded from actionable views)
- `cases` — case-level referral data (PHI under Supabase BAA, RLS enforced)
- `locations` — 8 Tristar clinic lookups
- `payer_tiers` — A/B/C scoring
- `analysis_config` — business constants (RPV, thresholds)
- Views: `v_summary`, `v_physician_ytd`, `v_location_scorecard`, `v_monthly_trend`, `v_funnel`

All metrics compute live from the base `cases` table — no materialization needed at this data volume.

## Ingestion

To load a new Created Cases Report XLSX:

```bash
cd scripts
python seed.py --file "/path/to/Created Cases Report.xlsx" \
  --supabase-url $NEXT_PUBLIC_SUPABASE_URL \
  --service-role-key $SUPABASE_SERVICE_ROLE_KEY
```

The seeder upserts by `patient_account_number` so running it repeatedly with fresh exports just updates visit counts and discharge info on existing cases, and inserts new ones.

## Deployment

Push to `main` → Vercel auto-deploys. Environment variables are managed in the Vercel dashboard.

## Security notes

- Case-level data contains PHI. Supabase Team BAA is signed.
- RLS: all tables require authenticated role to SELECT. Anonymous users see nothing.
- Auth layer (Supabase Auth with email/password restricted to @tristarpt.com) is the next iteration.
- Service role key must never be committed or exposed client-side.
