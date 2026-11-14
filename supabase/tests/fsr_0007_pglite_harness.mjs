// FDY-267 local harness for signal_room_0007 / 0008, the verify file and the rollback.
// Run from the repo root:  npm i --no-save @electric-sql/pglite@0.3 && node supabase/tests/fsr_0007_pglite_harness.mjs
// PGlite is a single backend and cannot build an index CONCURRENTLY, so 0008 runs without that word here only.
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { readFileSync } from "node:fs";
const db = new PGlite({ extensions: { pg_trgm } });
const f = (p) => readFileSync(new URL("../../" + p, import.meta.url), "utf8");
await db.exec(`create extension pg_trgm with schema public;
create role authenticated; create role anon;
create table public.signals (id uuid primary key default gen_random_uuid(), fired_at timestamptz not null default now(), source text, theme_tags jsonb, domain_tags jsonb, subdomain_tags jsonb, company_tags jsonb, conviction text, framing text, byline text, faradays_take text, artifact_id uuid, source_url text);
insert into public.signals (source, framing) select 'pipeline:auto:enrichment', 'Signal number ' || g from generate_series(1,50) g;
create view public.subscriber_signals with (security_invoker=on) as select id, fired_at, source, theme_tags, domain_tags, subdomain_tags, company_tags, framing, byline, faradays_take from public.signals;
grant select on public.subscriber_signals to authenticated;
create table cron_job(jobid int, jobname text, schedule text, active bool);`);
const before = (await db.query("select string_agg(column_name, ',' order by ordinal_position) c from information_schema.columns where table_name='subscriber_signals'")).rows[0].c;
await db.exec(f("supabase/migrations/0007_fsr_1_0_review_status_trgm.sql")); // superseded: must be a no-op
await db.exec(f("supabase/migrations/20261114182500_signal_room_0007_review_status.sql"));
await db.exec(f("supabase/migrations/20261114182500_signal_room_0007_review_status.sql")); // idempotent
// PGlite is single-connection; CONCURRENTLY is accepted outside a transaction
await db.exec(f("supabase/migrations/20261114182600_signal_room_0008_framing_trgm.sql").replaceAll("concurrently ", "")); // PGlite cannot build CONCURRENTLY (single backend)
const after = (await db.query("select string_agg(column_name, ',' order by ordinal_position) c from information_schema.columns where table_name='subscriber_signals'")).rows[0].c;
console.log("view columns unchanged:", before === after, after);
const verify = f("supabase/sql/manual/fsr_0007_verify.sql").split("-- Prompt's own verification:")[0];
console.log((await db.query(verify)).rows.map(r => (r.pass ? "PASS " : "FAIL ") + r.check_name).join("\n"));
await db.exec("update public.signals set review_status='pending_review' where framing='Signal number 1'; update public.signals set review_status='rejected' where framing='Signal number 2';");
console.log("view hides pending+rejected:", (await db.query("select count(*)::int n from public.subscriber_signals")).rows[0].n === 48);
let bad = false; try { await db.exec("update public.signals set review_status='maybe' where framing='Signal number 3'"); } catch { bad = true; }
console.log("check constraint rejects bad value:", bad);
console.log("grant kept:", (await db.query("select has_table_privilege('authenticated','public.subscriber_signals','select') g")).rows[0].g);
await db.exec(f("supabase/rollback/20261114182500_signal_room_0007_review_status_rollback.sql"));
const rb = (await db.query("select count(*)::int n from information_schema.columns where table_name='signals' and column_name like 'review%'")).rows[0].n;
console.log("rollback removed columns:", rb === 0, "view back to 50:", (await db.query("select count(*)::int n from public.subscriber_signals")).rows[0].n === 50);
