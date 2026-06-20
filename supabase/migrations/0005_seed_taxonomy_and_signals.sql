-- =====================================================================
-- Signal Room v1.2 — Migration 0005: seed data for MVP.
-- The taxonomy mirror is normally synced from IDF 4.0 canon (Notion/Airtable).
-- For a buildable/testable MVP we seed the 7 Themes and a small, illustrative
-- set of Sub-Domains + Companies + sample Signals. Idempotent.
--
-- NOTE: subscriber-facing copy is count-agnostic and uses plain-language
-- names only (no framework/Engine names) — §9.3.
-- =====================================================================

-- 7 IDF Themes (T-001..T-007), plain-language names.
insert into public.faraday_themes (theme_code, name, tagline) values
  ('T-001','Capital Flows','Where money is moving and why'),
  ('T-002','Power & Energy','The physical backbone of compute and industry'),
  ('T-003','Regulation & Policy','Rules taking shape across jurisdictions'),
  ('T-004','Technology Frontier','Capabilities crossing from lab to market'),
  ('T-005','Supply & Materials','The inputs everything else depends on'),
  ('T-006','Markets & Demand','Where appetite is forming and shifting'),
  ('T-007','Risk & Resilience','Stress, fragility, and what absorbs it')
on conflict (theme_code) do nothing;

-- A handful of Sub-Domains hung off existing faraday_domains rows, guarded so
-- the seed never fails if a parent domain_code is absent in this environment.
insert into public.faraday_subdomains (subdomain_code, domain_code, display_name, theme_tags)
select v.subdomain_code, v.domain_code, v.display_name, v.theme_tags::jsonb
from (values
  ('D1.1','D1','Data Center Capacity','["T-002","T-004"]'),
  ('D1.2','D1','Grid Interconnection','["T-002","T-003"]'),
  ('D2.1','D2','Battery Supply Chain','["T-005"]'),
  ('D2.2','D2','Critical Minerals','["T-005","T-007"]')
) as v(subdomain_code, domain_code, display_name, theme_tags)
where exists (select 1 from public.faraday_domains d where d.domain_code = v.domain_code)
on conflict (subdomain_code) do nothing;

-- Illustrative Key Player companies (mirror of Airtable record ids).
insert into public.tracking_companies (company_id, name) values
  ('rec_acme','Acme Power Holdings'),
  ('rec_helios','Helios Grid Systems'),
  ('rec_terra','Terra Minerals Corp')
on conflict (company_id) do nothing;

-- Sample Signals so a composed configuration has something to match (MVP).
-- conviction is set INTERNALLY here; it must never reach a subscriber payload.
insert into public.signals
  (source, theme_tags, domain_tags, subdomain_tags, company_tags, conviction, framing, byline)
select * from (values
  ('Faraday desk','["T-002"]'::jsonb,'["D1"]'::jsonb,'["D1.1"]'::jsonb,'["rec_acme"]'::jsonb,
   'High','Acme commits to a 400MW build, front-running grid approvals.','Gil'),
  ('Faraday desk','["T-005"]'::jsonb,'["D2"]'::jsonb,'["D2.2"]'::jsonb,'["rec_terra"]'::jsonb,
   'Medium','Critical-minerals tightness is showing up in forward pricing.','Mach'),
  ('Faraday desk','["T-003"]'::jsonb,'["D1"]'::jsonb,'["D1.2"]'::jsonb,'["rec_helios"]'::jsonb,
   'Low','Interconnection queue reform clears committee; timeline still soft.',null)
) as v(source, theme_tags, domain_tags, subdomain_tags, company_tags, conviction, framing, byline)
where not exists (select 1 from public.signals where source = 'Faraday desk');
