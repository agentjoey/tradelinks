# Railway Setup — worker + scraper (2 services, 1 repo)

> One Railway **project** contains TWO **services**, both deployed from the SAME
> GitHub repo (`agentjoey/tradelinks-mvp`). You do NOT need separate repos and
> you do NOT recreate the worker — a repo-based service is correct; you just set
> the right Root Directory / Build / Start per service.

```
Railway Project: tradelinks
├── Service "worker"  ← Node, repo root,     Start: pnpm worker        (no HTTP)
└── Service "scraper" ← Docker, root=scraper-py, runs uvicorn :8000   (private)
                         worker calls it at http://scraper.railway.internal:8000
Neon (external) = production branch · Vercel (external) = web
```

---

## Service 1 — `worker` (Node, background)

This is your existing service. Fix its settings:

**Settings → Source**
- Repo: `agentjoey/tradelinks-mvp`, branch `main`
- **Root Directory:** (empty / `/`) — the repo root

**Settings → Build**
- Builder: Nixpacks (auto)
- **Build Command:** `pnpm install && pnpm exec prisma generate`
  - (the worker imports `@prisma/client`, which must be generated at build.
    Do NOT use the default `pnpm build` — that also runs `next build`, wasteful.)

**Settings → Deploy**
- **Start Command:** `pnpm worker`
- **Healthcheck:** none / disabled
- **Networking:** the worker has NO HTTP server — **do not add a public domain**.
  (If a domain/health-check was added when it was wrongly running `next start`,
  remove it, or Railway may kill the container expecting an HTTP response.)

**Variables** (all DB urls use the Neon **production** *pooler* host):
```
DATABASE_URL = postgresql://neondb_owner:***@ep-mute-base-aotkza3n-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require&connection_limit=5
DIRECT_URL   = postgresql://neondb_owner:***@ep-mute-base-aotkza3n-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
DEEPSEEK_API_KEY = sk-...
MINIMAX_API_KEY  = sk-cp-...
MINIMAX_MODEL    = MiniMax-M2.7-highspeed
SCRAPER_SERVICE_URL = http://scraper.railway.internal:8000   # set after svc 2 exists
# optional: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID / RESEND_API_KEY / FROM_EMAIL
MAX_ITEMS_PER_CRAWL = 12
```
> ⚠️ `DIRECT_URL` uses the **pooler** host too — the production branch's direct
> (non-pooler) endpoint is unreachable; migrate + pg-boss verified working over
> the pooler.

**Healthy log:** `workers online: scheduler + crawl + scrape + ingest + process + score + trends (pg-boss)`

---

## Service 2 — `scraper` (Docker, private HTTP)

New service, **same repo**, rooted at `scraper-py/`.

1. Project → **+ New** → **GitHub Repo** → pick `agentjoey/tradelinks-mvp` again.
2. Open the new service → **Settings → Source → Root Directory:** `scraper-py`
3. **Build:** Railway auto-detects `scraper-py/Dockerfile` (Builder = Dockerfile).
   - The Dockerfile installs `scrapling[fetchers]` + `patchright install chromium`
     and runs `uvicorn main:app --host 0.0.0.0 --port 8000`.
4. **Networking:** keep it **private** (no public domain needed). Railway exposes
   it to other services at `http://<service-name>.railway.internal:8000`.
   - Name the service `scraper` so the URL is `http://scraper.railway.internal:8000`.
5. **Variables:** none required (stateless scraper).
6. **Resources:** Scrapling + Chromium are memory-hungry — give it **≥1–2 GB RAM**
   (bump the plan/limits if it OOMs on first browser launch).

**Healthy:** `GET http://scraper.railway.internal:8000/health → {"status":"ok"}`
(reachable from the worker's shell, not publicly).

---

## Wire them together
1. Deploy `scraper` first; note its internal hostname (`scraper.railway.internal`).
2. On `worker`, set `SCRAPER_SERVICE_URL = http://scraper.railway.internal:8000`.
3. Redeploy `worker`.

## Verify the full pipeline
- worker logs: `crawled` / `ingested` (RSS), `routed to scrape-queue` (Amazon/trends)
- After scraper is up, Amazon BSR items (sourceId D02–D06/D30–D34) appear in Neon
- Vercel home dispatch count climbs; https://tradelinks-mvp.vercel.app
- pytrends (D01) may hit Google 429 from cloud IPs — expected; RSS/Amazon unaffected.

## Common pitfalls
- Worker runs `next start` → wrong; that's the web app. Start must be `pnpm worker`.
- `@prisma/client did not initialize` → Build Command missing `prisma generate`.
- `P1001 can't reach DB` → using the non-pooler DIRECT host (unreachable on prod);
  use the pooler host for both DATABASE_URL and DIRECT_URL.
- Amazon items stay 0 → scraper service missing or `SCRAPER_SERVICE_URL` wrong.
