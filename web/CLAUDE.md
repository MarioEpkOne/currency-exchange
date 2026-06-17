# web/ — Agent Notes

**Talks only to our API via `lib/api.ts`. Never talks to the exchange-rate provider directly.**
**The openexchangerates App ID is NEVER present in this bundle — it is backend-only.**

This is the Next.js (App Router) frontend. It consumes `/api/convert`, `/api/currencies`, and `/api/stats` via the typed client in `lib/api.ts`.

## Key invariants

- `lib/api.ts` uses `NEXT_PUBLIC_API_URL` (SST-injected) to reach our API — never the provider.
- No `OPENEXCHANGERATES_APP_ID` anywhere in `web/` (it would end up in the client bundle).
- `StatsPanel` is a Server Component. `ConvertForm` is a Client Component (`'use client'`).
- The stale badge (`<span className="stale-badge">`) appears in `ConvertForm` and `ResultCard` whenever `result.stale === true`.

## Structure

```
app/
  layout.tsx    # root layout with global CSS
  page.tsx      # home page — ConvertForm + StatsPanel
  globals.css   # styles
components/
  ConvertForm.tsx  # client component: form + result display
  ResultCard.tsx   # reusable result card with stale badge
  StatsPanel.tsx   # server component: stats from /api/stats
lib/
  api.ts        # typed fetch wrappers — talks only to our API
```

## Build

```bash
pnpm --filter @currency/web build   # Next.js build
```

Root `tsc -b` does NOT include web (Next.js owns its own typecheck via `next build`).
