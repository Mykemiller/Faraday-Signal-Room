-- Rollback for signal_room_0007_review_status (FDY-267). Run only if 0007 must be undone.
-- Restores subscriber_signals to its pre-0007 definition FIRST, then removes the columns.
-- If 0008 was applied, drop its index too (line at the bottom).
begin;
create or replace view public.subscriber_signals
  with (security_invoker = on) as
select id, fired_at, source, theme_tags, domain_tags, subdomain_tags, company_tags, framing, byline, faradays_take
from public.signals;

drop index if exists public.idx_signals_pending_review;
alter table public.signals drop constraint if exists signals_review_status_check;
alter table public.signals drop column if exists review_note;
alter table public.signals drop column if exists reviewed_at;
alter table public.signals drop column if exists reviewed_by;
alter table public.signals drop column if exists review_status;
commit;

-- 0008 (run separately, outside a transaction):
-- drop index concurrently if exists public.idx_signals_framing_trgm;
