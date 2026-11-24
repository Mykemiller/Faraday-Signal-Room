# FDY-297 (ADM-2.4) — Signal Room live flag as data

`NEXT_PUBLIC_SIGNAL_ROOM_LIVE` is now read on the server from the Faraday config store (`v_effective_config`,
app `SR`, key `signal_room_live`) through `lib/config/resolver.ts` (the FDY-295 reference contract: 60 s cache,
4 s timeout, fail closed, service key server-only).

| Env var (fallback) | Setting key | Status | Read in |
|---|---|---|---|
| `NEXT_PUBLIC_SIGNAL_ROOM_LIVE` (code default off; only the literal `"true"` is on) | `signal_room_live` | enforced | `app/signal-room/page.tsx` (Preview banner), `app/api/signal-room/health/route.ts` (`live`) |

Rule: a value set in the Workbench console wins within 60 s. The env value is used when the read fails, the key
is unknown, the value is not a boolean, or nobody has set a value. The cold-start diagnostics line
(`lib/signal-room/diagnostics.ts`) still reports the env value as `liveFlag`; it describes the deploy, not the
console. The health route keeps its CDN cache (`s-maxage` = feed TTL), so its `live` field can lag by that much.

Secrets (`SUPABASE_SERVICE_ROLE_KEY`, `SWEEP_SECRET`, `RESEND_API_KEY`) stay in env; the resolver never logs a key or value.

Tests: `tests/fdy297-config-resolver.test.ts`, `tests/fdy297-signal-room-flag.test.ts`.
