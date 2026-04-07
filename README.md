# CAPN Patrol Dashboard

Next.js dashboard that reads **live** data from Neon using **`patrol_reports_dashboard`** only. The UI polls on filter changes and every 60 seconds.

## Environment

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon **pooled** Postgres URL (server-only). |

Copy `.env.example` to `.env.local` and set `DATABASE_URL`.

## Local

```bash
npm install
cp .env.example .env.local
npm run dev
```

- [http://localhost:3000/dashboard](http://localhost:3000/dashboard)

## API: `GET /api/dashboard`

Query parameters (all optional; combine as needed):

| Param | Description |
|-------|-------------|
| `startDate` | `YYYY-MM-DD` — filters `patrol_date >=` |
| `endDate` | `YYYY-MM-DD` — filters `patrol_date <=` |
| `location` | Exact match on `location` |
| `reportType` | Exact match on `report_type` |
| `securityOfficer` | Exact match on `security_officer` |
| `hasImages` | `true` or `false` |
| `search` | `ILIKE` on `report_details_clean` (recent table query) |

Response JSON includes KPIs, chart series, filter option lists (distinct values), and recent rows. See `src/lib/types/dashboard.ts`.

## SQL

All analytics live in **`src/lib/queries.ts`**, scoped to **`patrol_reports_dashboard`** with shared filter fragments.

## Deploy (Vercel)

1. Set `DATABASE_URL` in project environment variables.
2. Deploy the repo.

---

Built with [Next.js](https://nextjs.org).
