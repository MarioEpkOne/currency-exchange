# web/ — Agent Notes

**Talks only to our API via `lib/api.ts`. Never talks to the exchange-rate provider directly.**
**The openexchangerates App ID is NEVER present in this bundle — it is backend-only.**

This is the Next.js (App Router) frontend. It consumes `/api/convert`, `/api/currencies`, and `/api/stats` via the typed client in `lib/api.ts`.

## Key invariants

- `lib/api.ts` uses `NEXT_PUBLIC_API_URL` (SST-injected) to reach our API — never the provider.
- No `OPENEXCHANGERATES_APP_ID` anywhere in `web/` (it would end up in the client bundle).
- All three (`Dashboard`, `ConvertForm`, `StatsPanel`) are Client Components (`'use client'`).
  `Dashboard` is the coordinator: a successful conversion bumps a counter passed to
  `StatsPanel` as `refreshSignal`, so usage stats re-fetch **automatically** (no manual refresh).
  `StatsPanel` keeps the prior numbers on screen while re-fetching (skeleton only on first load).
- Currency `<select>`s render the **ISO code only** (full name is the `<option title>` tooltip) —
  keeps the controls readable; long names no longer overflow.
- The stale badge (`<span className="stale-badge">`) appears in the result whenever `result.stale === true`.

## Structure

```
app/
  layout.tsx    # root layout with global CSS
  page.tsx      # home page — title + <Dashboard/>
  globals.css   # styles
components/
  Dashboard.tsx    # client coordinator: wires conversion -> stats auto-refresh
  ConvertForm.tsx  # client component: form (+ inline ResultCard) + swap button
  StatsPanel.tsx   # client component: stats from /api/stats, refetch on refreshSignal
lib/
  api.ts        # typed fetch wrappers — talks only to our API
```

## Build

```bash
pnpm --filter @currency/web build   # Next.js build
```

Root `tsc -b` does NOT include web (Next.js owns its own typecheck via `next build`).
