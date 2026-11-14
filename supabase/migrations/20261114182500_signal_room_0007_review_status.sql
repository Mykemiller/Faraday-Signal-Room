-- =====================================================================
-- Signal Room — signal_room_0007_review_status   (FDY-267, CC-FSR-SIGNAL-AUTOMATION-1.0)
-- Supersedes 0007_fsr_1_0_review_status_trgm.sql (PR #9, merged 2026-11-07, never applied).
--
-- WRITTEN, NOT APPLIED. Myke runs it in the Supabase SQL editor (project ycadmmngkdhvpcsrcuaq),
-- then 20261114182600_signal_room_0008_framing_trgm.sql, then supabase/sql/manual/fsr_0007_verify.sql.
-- Not between 07:00 and 09:00 UTC (crawl + Predicts + signal promotion lanes).
--
-- What it does (all additive, idempotent, no backfill UPDATE, no cron):
--   1. signals.review_status text not null default 'approved' + check (pending_review|approved|rejected).
--      Existing rows become 'approved' through the constant default (no table rewrite on PG 11+). D2.
--   2. signals.reviewed_by text, reviewed_at timestamptz, review_note text.
--   3. Partial index on fired_at desc where review_status = 'pending_review' (the review queue).
--   4. subscriber_signals recreated with the same columns, same order, plus
--      where review_status = 'approved'; security_invoker stays on. Grants are kept by
--      CREATE OR REPLACE VIEW.
-- Nothing writes 'pending_review' until the Phase 2 function migration is applied, so after this
-- file every reader sees exactly what it sees today.
--
-- Expected after apply: every existing row 'approved'; subscriber_signals count = signals count.
-- Rollback: supabase/rollback/20261114182500_signal_room_0007_review_status_rollback.sql
-- =====================================================================

alter table public.signals
  add column if not exists review_status text not null default 'approved';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'signals_review_status_check' and conrelid = 'public.signals'::regclass
  ) then
    alter table public.signals
      add constraint signals_review_status_check
      check (review_status in ('pending_review', 'approved', 'rejected'));
  end if;
end $$;

alter table public.signals add column if not exists reviewed_by text;
alter table public.signals add column if not exists reviewed_at timestamptz;
alter table public.signals add column if not exists review_note text;

create index if not exists idx_signals_pending_review
  on public.signals (fired_at desc)
  where review_status = 'pending_review';

-- Same column list and order as the live definition (read 2026-11-14 18:20 UTC):
--   id, fired_at, source, theme_tags, domain_tags, subdomain_tags, company_tags, framing, byline, faradays_take
-- conviction stays out (internal only).
create or replace view public.subscriber_signals
  with (security_invoker = on) as
select id, fired_at, source, theme_tags, domain_tags, subdomain_tags, company_tags, framing, byline, faradays_take
from public.signals
where review_status = 'approved';

comment on column public.signals.review_status is
  'FSR 1.0 (FDY-267): pending_review | approved | rejected. Only approved rows reach any reader.';
