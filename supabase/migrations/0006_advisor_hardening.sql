-- =====================================================================
-- Signal Room v1.2 — Migration 0006: post-deploy hardening.
-- Items surfaced by the Supabase database advisors after 0001–0005 were
-- applied to the live project. All additive / privilege-tightening; no
-- behavioural change to the configurator or wallet flows.
-- =====================================================================

-- (a) advisor: rls_disabled_in_public (ERROR) on signal_room_settings.
-- Settings is config-only and is read through the security-definer
-- signal_room_activate(); enable RLS with no policy so there is no direct
-- PostgREST path, while definer functions continue to bypass it.
alter table public.signal_room_settings enable row level security;

-- (b) advisor: function_search_path_mutable (WARN). wallet_burn and
-- signal_room_activate already pin search_path; pin it on the rest.
alter function public.num_nonnull(anyarray)               set search_path = 'public', 'pg_temp';
alter function public.enforce_rule_cap()                  set search_path = 'public', 'pg_temp';
alter function public.touch_configuration_last_modified() set search_path = 'public', 'pg_temp';
alter function public.wallet_token_balance(uuid)          set search_path = 'public', 'pg_temp';

-- (c) advisor: *_security_definer_function_executable (WARN). The revoke in
-- 0003 missed the implicit PUBLIC execute grant. wallet_burn must be callable
-- ONLY via signal_room_activate; signal_room_activate only by authenticated
-- (it enforces auth.uid() ownership internally).
revoke execute on function public.wallet_burn(uuid, text, uuid, interval) from public;
revoke execute on function public.signal_room_activate(uuid)              from public, anon;
grant  execute on function public.signal_room_activate(uuid)              to authenticated;
