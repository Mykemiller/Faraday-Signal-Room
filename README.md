# Signal Room

Faraday Intelligence's **configurator storefront** — the surface where a subscriber
composes a personalized intelligence subscription across Theme / Domain / Sub-Domain /
Company / Frequency and receives matching **Signals** through delivery rails.

Standalone Next.js (App Router) app, mirroring the Jurisdiction Watch repo pattern.
Built to **Design Specification v1.2** (Senior Engineering Review incorporated).
Shares Supabase project `ycadmmngkdhvpcsrcuaq` with Jurisdiction Watch.

> Status: MVP build for adversarial review. The live surface is gated behind
> `NEXT_PUBLIC_SIGNAL_ROOM_LIVE` (default **off**). Commerce stays held behind
> FAR-44 / FAR-46 / FAR-16 until the launch gates pass.

## What this build contains

| Area | Where |
| --- | --- |
| Config-driven meter read (no hardcoded value, FAR-46) | `lib/signal-room/meter.ts` |
| Conviction serializer (single chokepoint) | `lib/signal-room/serialize.ts` |
| OR-union matching + digest collapse (review items 4, 6) | `lib/signal-room/matching.ts` |
| Composer / presets / manage / preview UI | `components/signal-room/*` |
| CRUD / activate / preview APIs | `app/api/signal-room/*` |
| Additive SQL migrations | `supabase/migrations/*` |
| Tests (serializer, matching, meter, rule mapping) | `tests/*` |

## Architecture (Option A — activation-window metering)

```
compose configuration → POST /api/signal-room/configurations (status=inactive)
                       → POST /api/signal-room/activate
                            cost := product_meters.tokens_cost (config-driven)
                            signal_room_activate() → wallet_burn() atomic debit
                            status=active, activated_until = now()+30d
delivery sweep (separate track) reads active configs, matches Signals, sends via rail
```

- A burn **activates a configuration for 30 days** (GF-1, GF-2). Delivery inside the
  window is **never** metered per-unit — runaway configs can't bankrupt a wallet.
- Editing an active configuration is **free** and does not reset the clock (review item 5).
- Tiers retired; no free tier inside Signal Room (GF-3). On-ramp is a wallet-level
  trial allowance (§5.5), shared with the JW wallet.

## The six Senior-Review hardenings (all implemented)

1. **Discrete TEXT FKs + exactly-one CHECK** — `signal_configuration_rules` carries
   `theme_code / domain_code / subdomain_code / company_id`, each `REFERENCES` its
   mirror table `ON DELETE RESTRICT`, with a CHECK enforcing exactly one taxonomy FK
   (threshold rules exempt). Prerequisite mirror tables created in `0001`.
2. **Atomic burn** — `wallet_burn` takes a per-subscriber advisory xact lock and debits
   with a single `INSERT … SELECT … WHERE balance >= cost`; zero rows ⇒ `402`.
3. **DB-layer conviction separation** — `public.subscriber_signals` view omits
   `conviction`; the base `signals` table is revoked from subscriber roles. The
   serializer is defense-in-depth, not the sole guard.
4. **Deterministic matching** — one dimension per rule; a signal matches on ANY active
   rule (OR union). Compound AND deferred to V2.
5. **Mid-window mutation** — edits free, clock not reset; burn only once expired.
6. **Volume caps** — max 30 rules/config (DB trigger); digests > 20 matches collapse to
   top 5 + in-app link.

## Wallet reuse (FAR-44)

Generalizes the JW wallet **additively** — `jw_token_balance`, `jw_unlock_jurisdiction`
and `wallet_record_grant` are **left intact**. Adds `wallet_token_balance` and
`wallet_burn` (product-agnostic), and `product_key` / `ref_id` columns on
`token_transactions` with a back-compat backfill. Signal Room burns use `kind='unlock'`
so they share the **same one balance** as JW (verified against the live function bodies).

## Local development

```bash
npm install
cp .env.example .env.local   # fill in Supabase URL + anon key
npm run dev                  # http://localhost:3000/signal-room
npm run typecheck && npm test && npm run build
```

## Applying the migrations

The five migrations in `supabase/migrations/` are **additive only** and have been
**dry-run-validated** against the live schema inside a rolled-back transaction (they
apply clean; JW is unaffected). Apply with the Supabase migration tooling, in order:

```
0001_taxonomy_mirror.sql             -- mirror tables (themes / subdomains / companies)
0002_signal_room_tables.sql          -- configurations, rules, signals, settings
0003_wallet_generalize.sql           -- wallet_token_balance, wallet_burn, signal_room_activate
0004_subscriber_signals_view_rls.sql -- RLS + conviction-free view
0005_seed_taxonomy_and_signals.sql   -- MVP seed data
```

> Production taxonomy is synced from IDF 4.0 canon (Notion/Airtable). `0005` seeds an
> illustrative subset so the MVP is testable; replace with the canon sync in production.

## Human-only steps (kept minimal, §12)

These are intentionally **not** automated and require Myke / FAR sign-off:

- [ ] Add Supabase + Stripe + Resend/Beehiiv env vars in the Vercel dashboard.
- [ ] Apply the additive migrations to `ycadmmngkdhvpcsrcuaq`.
- [ ] Set the **FAR-46 meter value** and flip `product_meters.signal_room` to `final`
      (the build reads it at runtime; nothing redeploys). **GF-7.**
- [ ] Set the **GF-9 trial values** in `signal_room_settings` (allowance + length).
- [ ] Re-point the Faraday home-page tile (engine repo) from the `/signal-room` stub to
      this app; retire the stub only after the live route verifies.
- [ ] Flip `NEXT_PUBLIC_SIGNAL_ROOM_LIVE=true` once FAR-44 / FAR-46 / FAR-16 gates pass.
- [ ] Merge the PR to `main` via the GitHub web UI.

## FAR-31 acceptance-criteria traceability

| FAR-31 criterion | Where satisfied |
| --- | --- |
| Atomic Signal unit spec locked | `supabase/migrations/0002` (`signals`), `lib/signal-room/types.ts` |
| Standalone vs feature (GF-4 standalone) | this repo (standalone app) |
| Subscription Configuration model | `0002` (`signal_configurations` + `_rules`) |
| MVP: subscriber composes a profile | `components/signal-room/Composer.tsx` |
| MVP: signals route via ≥1 rail | preview/digest path; `delivery_rail` on rules |
| Gating model (tiers retired; metered; trial on-ramp) | `0003` wallet, `signal_room_settings` |
| Governance: conviction internal-only | `0004` view + `lib/signal-room/serialize.ts` + tests |
| Governance: signal content under Myke gate | meter/trial values config-driven, not in code |

## Governance flags

GF-1…GF-8 resolved (Myke, 2026-06-20). **GF-9** (trial allowance + length) is the only
open item and is non-blocking — the mechanism ships with placeholder config in
`signal_room_settings`; the numbers are an FAR-56 always-human carve-out.
