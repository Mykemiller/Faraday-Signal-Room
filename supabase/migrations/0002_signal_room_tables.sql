-- =====================================================================
-- Signal Room v1.2 — Migration 0002: configurations, rules, signals,
-- settings. Mirrors the jw_watchlists / jw_watchlist_items parent/child
-- pattern (§4.4, §8.1). All additive.
-- =====================================================================

-- Tiny immutable helper: count non-null args (review item 1 CHECK, §8.1).
create or replace function public.num_nonnull(variadic anyarray)
returns integer
language sql
immutable
as $$
  select count(*)::int from unnest($1) as x where x is not null;
$$;

-- ---------------------------------------------------------------------
-- Parent: a subscriber-composed Subscription Configuration (§4.4)
-- ---------------------------------------------------------------------
create table if not exists public.signal_configurations (
  id              uuid primary key default gen_random_uuid(),
  subscriber_id   uuid not null,
  status          text not null default 'inactive'
                  check (status in ('inactive','active','paused','cancelled')),
  -- no free tier; activation is gated purely by wallet balance (GF-3)
  activated_until timestamptz,             -- set by the activation burn window
  created_at      timestamptz not null default now(),
  last_modified   timestamptz not null default now()
);

create index if not exists signal_configurations_subscriber_idx
  on public.signal_configurations(subscriber_id);
create index if not exists signal_configurations_active_idx
  on public.signal_configurations(status, activated_until);

-- ---------------------------------------------------------------------
-- Child: one dimension per rule row (review item 1, single-FK invariant)
-- ---------------------------------------------------------------------
create table if not exists public.signal_configuration_rules (
  id               uuid primary key default gen_random_uuid(),
  configuration_id uuid not null
                   references public.signal_configurations(id) on delete cascade,
  dimension        text not null
                   check (dimension in ('theme','domain','subdomain','company','threshold')),

  -- discrete typed FKs replace the polymorphic ref_key (review item 1):
  theme_code     text references public.faraday_themes(theme_code)        on delete restrict,
  domain_code    text references public.faraday_domains(domain_code)      on delete restrict,
  subdomain_code text references public.faraday_subdomains(subdomain_code) on delete restrict,
  company_id     text references public.tracking_companies(company_id)    on delete restrict,
  threshold_spec jsonb,                    -- only when dimension='threshold'

  frequency      text not null
                 check (frequency in ('realtime','daily','weekly','monthly','threshold')),
  delivery_rail  text not null default 'in_app'
                 check (delivery_rail in ('email_digest','in_app')),
  paused         boolean not null default false,
  selection_order int not null default 0,
  added_at       timestamptz not null default now(),

  -- exactly one taxonomy FK on a taxonomy rule; a threshold rule carries a
  -- spec and zero taxonomy FKs (review item 1 x item 4 resolution):
  constraint exactly_one_dimension_ref check (
    (dimension = 'threshold'
       and threshold_spec is not null
       and public.num_nonnull(theme_code, domain_code, subdomain_code, company_id) = 0)
    or
    (dimension <> 'threshold'
       and threshold_spec is null
       and public.num_nonnull(theme_code, domain_code, subdomain_code, company_id) = 1)
  ),

  -- the populated FK must match the declared dimension:
  constraint dimension_matches_ref check (
    (dimension = 'theme'     and theme_code     is not null) or
    (dimension = 'domain'    and domain_code    is not null) or
    (dimension = 'subdomain' and subdomain_code is not null) or
    (dimension = 'company'   and company_id     is not null) or
    (dimension = 'threshold' and threshold_spec is not null)
  )
);

create index if not exists signal_configuration_rules_config_idx
  on public.signal_configuration_rules(configuration_id);

-- Cap: max 30 rule rows per configuration (review item 6, §10).
create or replace function public.enforce_rule_cap()
returns trigger
language plpgsql
as $$
declare v_count int;
begin
  select count(*) into v_count
  from public.signal_configuration_rules
  where configuration_id = new.configuration_id;
  if v_count >= 30 then
    raise exception 'rule cap exceeded: max 30 rules per configuration';
  end if;
  return new;
end $$;

drop trigger if exists trg_enforce_rule_cap on public.signal_configuration_rules;
create trigger trg_enforce_rule_cap
  before insert on public.signal_configuration_rules
  for each row execute function public.enforce_rule_cap();

-- Keep last_modified fresh (edits are free; do NOT touch activated_until — item 5).
create or replace function public.touch_configuration_last_modified()
returns trigger
language plpgsql
as $$
begin
  update public.signal_configurations
     set last_modified = now()
   where id = coalesce(new.configuration_id, old.configuration_id);
  return coalesce(new, old);
end $$;

drop trigger if exists trg_touch_config on public.signal_configuration_rules;
create trigger trg_touch_config
  after insert or update or delete on public.signal_configuration_rules
  for each row execute function public.touch_configuration_last_modified();

-- ---------------------------------------------------------------------
-- Signals — generalized jurisdiction_signals (§4.3, §8.1)
-- conviction is INTERNAL ONLY and is never exposed to subscribers (0004).
-- ---------------------------------------------------------------------
create table if not exists public.signals (
  id             uuid primary key default gen_random_uuid(),
  fired_at       timestamptz not null default now(),
  source         text not null,
  theme_tags     jsonb not null default '[]'::jsonb,
  domain_tags    jsonb not null default '[]'::jsonb,
  subdomain_tags jsonb not null default '[]'::jsonb,
  company_tags   jsonb not null default '[]'::jsonb,
  conviction     text,                     -- INTERNAL — never serialized out
  framing        text not null,
  byline         text,                     -- 'Gil' | 'Mach' | null
  faradays_take  text,
  -- at least one dimension tag (§4.3 AC)
  constraint signal_has_dimension check (
    jsonb_array_length(theme_tags) > 0
    or jsonb_array_length(domain_tags) > 0
    or jsonb_array_length(subdomain_tags) > 0
    or jsonb_array_length(company_tags) > 0
  )
);

create index if not exists signals_fired_at_idx on public.signals(fired_at desc);

-- ---------------------------------------------------------------------
-- Config-driven settings (window length + trial values, GF-2 / GF-9).
-- Single row; values are FAR-56 always-human carve-outs — placeholders here.
-- ---------------------------------------------------------------------
create table if not exists public.signal_room_settings (
  id                     int primary key default 1 check (id = 1),
  activation_window_days int not null default 30,  -- GF-2 LOCKED 30 days
  trial_allowance        int not null default 0,   -- GF-9 pending Myke (placeholder)
  trial_length_days      int not null default 0,   -- GF-9 pending Myke (placeholder)
  updated_at             timestamptz not null default now()
);

insert into public.signal_room_settings (id) values (1)
on conflict (id) do nothing;
