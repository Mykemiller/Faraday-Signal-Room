-- =====================================================================
-- Signal Room v1.2 — Migration 0001: taxonomy + company mirror tables
-- Review item 1 prerequisite (§8.1): config rules need real FKs, so we
-- first create read-only Postgres mirrors of the IDF 4.0 taxonomy and the
-- Tracking Companies registry, keyed on the immutable TEXT ids.
-- Notion/Airtable remain the source of truth; these are synced mirrors.
-- All additive. faraday_domains already exists (text PK domain_code).
-- =====================================================================

-- Themes: T-001 .. T-007
create table if not exists public.faraday_themes (
  theme_code  text primary key,            -- 'T-001'..'T-007'
  name        text not null,
  tagline     text,
  active      boolean not null default true
);

-- Sub-Domains: D1.1, D2.10, ... (child of faraday_domains)
create table if not exists public.faraday_subdomains (
  subdomain_code text primary key,          -- 'D1.1', 'D2.10'
  domain_code    text not null references public.faraday_domains(domain_code),
  display_name   text not null,
  theme_tags     jsonb not null default '[]'::jsonb,
  active         boolean not null default true
);

-- Tracking Companies (Key Player registry) — mirror of Airtable base
create table if not exists public.tracking_companies (
  company_id text primary key,              -- Airtable record id
  name       text not null,
  active     boolean not null default true
);

-- These mirrors are read-only to subscribers; only the sync job (service
-- role) writes them. RLS denies all by default once enabled.
alter table public.faraday_themes     enable row level security;
alter table public.faraday_subdomains enable row level security;
alter table public.tracking_companies enable row level security;

-- Subscribers may read the taxonomy surfaces (needed to render pickers).
drop policy if exists faraday_themes_read on public.faraday_themes;
create policy faraday_themes_read on public.faraday_themes
  for select to authenticated, anon using (true);

drop policy if exists faraday_subdomains_read on public.faraday_subdomains;
create policy faraday_subdomains_read on public.faraday_subdomains
  for select to authenticated, anon using (true);

drop policy if exists tracking_companies_read on public.tracking_companies;
create policy tracking_companies_read on public.tracking_companies
  for select to authenticated, anon using (true);
