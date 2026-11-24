# FDY-419 · ADM-1.7c — Faraday beta access gate on Signal Room

Follow-up to FDY-414. Vendors `faraday-gate` 1.1.0 (byte-identical, `lib/faraday-gate/MANIFEST.sha256`) beside the
already-vendored `faraday-masthead` 1.0.0, and wraps the `/signal-room` route group with `guardRoute()`.

## Evidence (read-only, 2026-11-24 UTC)
- `to_regprocedure('public.estate_entitled(text,text)')` → present in `ycadmmngkdhvpcsrcuaq`.
- `estate_entitled(null, 'signalroom')` → `{allowed: true, reason: "open", mode: "open", code: "SR"}`. Mode not changed.
- Vercel project `faraday-signal-room` env NAMES (values not read): `NEXT_PUBLIC_SUPABASE_URL` (prod+preview),
  `SUPABASE_SERVICE_ROLE_KEY` (prod+preview), `NEXT_PUBLIC_SUPABASE_ANON_KEY` (production only),
  `NEXT_PUBLIC_SIGNAL_ROOM_LIVE`. No `FARADAY_GATE_ENFORCE` → a probe error passes through.

## Behaviour
| Case | Result |
|---|---|
| mode `open` (seeded) | one cached probe, no identity lookup, page renders exactly as before |
| probe error / env missing / URL not the Faraday project | pass through; closed (`unavailable`) only if `FARADAY_GATE_ENFORCE === "1"` |
| mode `invite`/`waitlist`/`live`, denied | gate page (its own masthead; the app's masthead + AppBar are not rendered) |
| identity | app's own verified Supabase session email (only looked up when a `sb-*-auth-token` cookie exists), else the gate's `fgate_at` cookie |

## Local smoke (`next start`, no Supabase env)
- `/signal-room` → 200, app masthead + feed page, no gate (fail-open).
- same with `FARADAY_GATE_ENFORCE=1` → 200, gate `unavailable` view, exactly one masthead, no `$`.
- `GET /api/faraday-gate/code` → 405; unknown URL → 404 with masthead (`app/not-found.tsx`).
