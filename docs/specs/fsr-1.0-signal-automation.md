# FSR 1.0 — Signal Room review gate (artifact → Signal automation)

**Linear:** FDY-267 · **Owner:** Myke Miller · **Target build start:** 2026-12-14 (after the Dec 1 JW launch)
**Prompt:** CC-FSR-SIGNAL-AUTOMATION-1.0 · **Written:** 2026-11-14 12:30 CT · **Status:** Phase 1 (scope) — waiting on Myke's "go"

## 1. What exists today (read-only, 2026-11-14 18:20 UTC)

- `public.signals`: 3,875 rows, 38 in the last 24 h, newest `fired_at` 2026-11-14 07:30 UTC. No `created_at`; `fired_at` is the clock.
- The artifact → Signal automation already runs and **publishes with no review**: `public.generate_signals_interim(...)` (v2, CC-DAILY-SIGNAL-FEED-REALIGN-1.0) from cron jobid 139 `auto199-signal-promotion-daily`, 07:30 UTC, `p_min_relevance 0.80, p_per_domain 10, p_dry_run false`. It hard-blocks re-fires on `artifact_id` / `content_hash` and suppresses near-duplicates with R1 (same `source_url`), R2 (company Jaccard ≥ 0.67 + trigram ≥ 0.25 + event dates within 1 day) and R3 (`similarity(coalesce(faradays_take, framing), summary)` ≥ 0.45).
- Volume, last 14 days: 541 signals, **38.6 a day**. Tier mix: `t1_canonical_exact` and `t2_name_normalized` almost all; `t3_alias` 15 (1.1 a day); no `t4`; no row missing `source_url`.
- `subscriber_signals` (`security_invoker=on`) selects id, fired_at, source, theme/domain/subdomain/company tags, framing, byline, faradays_take from `signals` with no filter.
- PR #9 (FDY-249) was **merged** on 2026-11-07 as `supabase/migrations/0007_fsr_1_0_review_status_trgm.sql` but never applied: no `review_status` column exists in production.
- Storefront tile `signal-room`: `enabled = true`, `status_tag = 'SR 00.08 · NOT READY'`, `linear_issue_keys = null`.

## 2. What PR #9 did and what changes

| | PR #9 (`0007_fsr_1_0_review_status_trgm.sql`) | This scope (`signal_room_0007` + `0008`) |
|---|---|---|
| `review_status` | text not null default `approved`, check `pending_review / approved / rejected` | same |
| Reviewer columns | none | `reviewed_by`, `reviewed_at`, `review_note` |
| Queue index | `fired_at desc where review_status <> 'approved'` | `fired_at desc where review_status = 'pending_review'` (rejected rows are not a queue) |
| Trigram index | plain `create index` in the same file | own file, `create index concurrently`, run outside a transaction |
| `subscriber_signals` | unchanged (no filter) | recreated with the same columns and order plus `where review_status = 'approved'` |
| pg_trgm | `create extension if not exists` | not repeated (installed, 1.6, schema public) |

The PR #9 file is kept but its body is commented out with a SUPERSEDED header, so a migration runner that walks the folder does nothing there. It cannot be "closed" any more because it was merged.

## 3. Decisions (D1–D10)

- **D1 — Table:** `public.signals`. It is what the app, `subscriber_signals`, the digest and the Predicts generator read; there is no other candidate.
- **D2 — Existing rows:** `approved` through the column default. No backfill UPDATE (constant default, no table rewrite).
- **D3 — Routing (set inside `generate_signals_interim` v3 on insert):**
  - `pending_review` when any of: company tier `t3_alias` or `t4*`; `source_url` missing; borderline near-duplicate (D4).
  - `approved` otherwise. `Faraday desk` rows are always approved.
  - Pending rows never auto-publish and never expire into `approved`.
- **D4 — Near-duplicates:** keep R1–R3 and the `dedup_key` / `artifact_id` hard block as suppression, unchanged. Add a **review band** for `similarity(framing, new framing)` against approved signals of the last 14 days.
  - **Measured on the last 14 days, the band as first proposed (`[0.30, 0.45)` against any approved signal) would send 317 of 541 signals to review: about 23 a day, not 1–4.** Framings share a house style, so trigram similarity between unrelated signals sits around 0.25–0.40.
  - **Recommendation (changed): band `[0.35, 0.45)` against approved signals that share at least one `company_tags` entry.** Measured: 3.4 a day from the band, plus 1.1 a day from `t3_alias`, about **4 a day** in total with some overlap.
  - Other measured options: `[0.30, 0.45)` same company, 7.8 a day; `[0.40, 0.45)` any signal, 4.4 a day.
- **D5 — Approver and mechanism:** Myke, through `public.signal_review_decide(p_id, p_decision, p_note)` (SECURITY DEFINER, `service_role` only, `approved` or `rejected`, stamps `reviewed_by` / `reviewed_at` / `review_note`) and the saved queue query `supabase/sql/manual/fsr_review_queue.sql`. Review UI deferred to FSR 1.1.
- **D6 — Readers:** every reader that feeds subscribers, the public page or a forecast filters to `review_status = 'approved'`; ops counters are exempt (section 4).
- **D7 — Cron:** no new jobs. Jobids 139 and 145 keep their schedules. The delivery sweep stays off.
- **D8 — Storefront tile:** `supabase/sql/manual/fdy267_storefront_tile.sql` sets `PLANNED · 2026-12-14` and binds `{FDY-267}`. Myke runs it (editorial field).
- **D9 — Linear project:** Myke creates it from section 8.
- **D10 — Out of scope, listed as open items:** the conviction badge on the public feed and the delivery sweep secrets (both from FDY-305).

## 4. Reader inventory (Step 3)

Sources: grep of `Mykemiller/Faraday` (main) and `Mykemiller/Faraday-Signal-Room` (main), GitHub code search across Mykemiller repos (default branches), `pg_views` / `pg_proc` definitions in production, and the deployed source of 23 of the 139 edge functions.

**Must filter to `approved` in Phase 2 (subscriber, public or forecast output):**

| Reader | Where | Reads | Phase 2 change |
|---|---|---|---|
| `subscriber_signals` view | DB | `signals` | filtered by `signal_room_0007` itself |
| Signal Room public feed | `lib/signal-room/feed-source.ts:55` | `signals` (service role, bypasses RLS) | add `.eq("review_status", "approved")` |
| Signal Room preview API | `app/api/signal-room/preview/route.ts:42` | `subscriber_signals` | covered by the view |
| Signal Room sweep | `app/api/signal-room/sweep/route.ts:46` | `subscriber_signals` | covered by the view (sweep is off) |
| `daily-signal-digest` (edge, v27, not in any repo) | deployed only | `signals` | add the filter; source needs capturing into a repo first |
| `faraday-predicts-generate` | Faraday repo | `signals` (grounding) | add the filter |
| `faraday-predicts-generate-keyplayers` | Faraday repo | `signals` | add the filter |
| `predicts-health-check` | Faraday repo | `signals` | review: filter if it gates output |
| `predicts_tags_from_signals`, `predicts_evidence_search`, `predicts_rescore_candidates` | DB functions | `signals` | add the filter |
| `v_predicts_eligible_domains`, `v_predicts_key_players`, `v_idf_d13_opposition`, `jpas_status` | DB views | `signals` | add the filter |
| `predicts-widget`, `tf-breaking-news`, `predicts-flash-detect` | Faraday default branch only (`claude/faraday-first-live-dollar-durjkk`), not on `main` | `signals` | confirm which branch is deployed, then filter |

**Exempt (ops counts, not output):** `faraday_ops_snapshot`, `app_registry_metric`, `workbench_health_compute`, `workbench_storefront_compute`, the `wayback_*` functions. `generate_signals_interim` itself reads `signals` for suppression; it should compare against all rows (pending included) so a pending item is not re-fired.

**Inventory gap — blocks Phase 2:** 116 deployed edge functions were not read. Before Phase 2, grep a full download of deployed functions (`supabase functions download`) for `from("signals"`, `subscriber_signals` and the RPC names above, and add anything found here.

The daily digest goes to an internal list, not subscribers, but it still shows unreviewed rows today and is listed as a reader to filter.

## 5. Expected queue volume

| Rule | Per day (last 14 days) |
|---|---|
| `t3_alias` / `t4` tier | 1.1 |
| Missing `source_url` | 0 |
| Borderline band, D4 recommended (`[0.35, 0.45)`, same company) | 3.4 |
| **Total (with overlap)** | **about 4** |
| For comparison: band as first proposed (`[0.30, 0.45)`, any signal) | 22.6 |

## 6. Acceptance criteria

1. After `signal_room_0007` + `0008`: `fsr_0007_verify.sql` returns pass on every row; `subscriber_signals` count equals `signals` count; feed unchanged.
2. After the Phase 2 function migration: `generate_signals_interim(p_lookback := '24 hours', p_dry_run := true, p_min_relevance := 0.80, p_per_domain := 10)` returns `approved_n`, `pending_n`, `pending_reasons`; pending is about 4 a day on a normal day; version string `v3 (CC-FSR-SIGNAL-AUTOMATION-1.0)`; same signature and all R1–R3 rules intact.
3. A pending or rejected row appears in no reader in section 4.
4. `signal_review_decide` accepts only `approved` / `rejected`, only for `service_role`, and stamps the reviewer columns.
5. No cron added or changed; jobids 139 and 145 unchanged; sweep off.

## 7. Rollback

- `signal_room_0008`: `drop index concurrently if exists public.idx_signals_framing_trgm;`
- `signal_room_0007`: `supabase/rollback/20261114182500_signal_room_0007_review_status_rollback.sql` (restores the unfiltered view first, then drops the columns).
- Phase 2 function: re-apply the snapshot `docs/signal-room/sql-snapshots/generate_signals_interim_pre_fdy267.sql`. Pending rows can be released in one statement (`update signals set review_status = 'approved' where review_status = 'pending_review'`).

## 8. Proposed Linear project

- **Name:** FSR 1.0 — Signal Room review gate
- **Target date:** 2026-12-14
- **Lead:** Myke Miller
- **Milestones:**
  1. Schema live — `signal_room_0007` + `0008` applied and verified; tile set to PLANNED.
  2. Full reader inventory — all deployed edge functions checked; section 4 complete.
  3. Review gate built — function v3, `signal_review_decide`, queue query, reader filters (draft PRs).
  4. Gate on — Myke applies the function migration and deploys reader changes; one week of queue at about 4 a day.

## 9. Open items (not FSR 1.0)

- Public feed shows a conviction badge; README says conviction is internal (FDY-305).
- Delivery sweep needs `SWEEP_SECRET` and `RESEND_API_KEY` before it can be switched on (FDY-305).
- `daily-signal-digest` source lives only in production; capture it into a repo.
- Found while reading deployed functions: `engine-two-analyst` (v30) carries the cron house token in plain text instead of a SHA-256 compare. Recommend rotating the token and moving that function to the shared cron auth (Tier 3, Myke).
