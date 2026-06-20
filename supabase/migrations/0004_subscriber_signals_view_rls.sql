-- =====================================================================
-- Signal Room v1.2 — Migration 0004: RLS + conviction containment (§8.3,
-- §8.4, §10). Review item 3: the DB is the hard guard, the serializer is
-- defense-in-depth.
-- =====================================================================

-- ---------------------------------------------------------------------
-- RLS on subscriber-owned tables: a subscriber sees only their own rows.
-- ---------------------------------------------------------------------
alter table public.signal_configurations      enable row level security;
alter table public.signal_configuration_rules enable row level security;

drop policy if exists signal_configurations_owner on public.signal_configurations;
create policy signal_configurations_owner on public.signal_configurations
  for all to authenticated
  using (subscriber_id = auth.uid())
  with check (subscriber_id = auth.uid());

-- Rules inherit ownership via their parent configuration.
drop policy if exists signal_configuration_rules_owner on public.signal_configuration_rules;
create policy signal_configuration_rules_owner on public.signal_configuration_rules
  for all to authenticated
  using (exists (
    select 1 from public.signal_configurations c
    where c.id = configuration_id and c.subscriber_id = auth.uid()))
  with check (exists (
    select 1 from public.signal_configurations c
    where c.id = configuration_id and c.subscriber_id = auth.uid()));

-- ---------------------------------------------------------------------
-- Conviction containment (review item 3, §8.4).
-- The base signals table is NEVER granted to subscriber roles. They get a
-- VIEW that omits the conviction column entirely.
--
-- The view is intentionally NOT security_invoker: it runs with the view
-- owner's privileges, so subscribers read signals ONLY through the view and
-- have no path to the base table (and thus no path to conviction), even
-- though RLS is enabled on the base table.
-- ---------------------------------------------------------------------
alter table public.signals enable row level security;

create or replace view public.subscriber_signals as
  select id, fired_at, source, theme_tags, domain_tags, subdomain_tags,
         company_tags, framing, byline, faradays_take
  from public.signals;             -- conviction column intentionally omitted

-- Lock the base table away from subscribers; expose only the view.
revoke all on public.signals from authenticated, anon;
grant select on public.subscriber_signals to authenticated, anon;
