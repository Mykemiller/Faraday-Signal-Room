-- =====================================================================
-- Signal Room v1.2 — Migration 0003: generalize the JW wallet (§6, §8.2)
-- Additive only. JW functions (jw_token_balance, jw_unlock_jurisdiction,
-- wallet_record_grant) are LEFT INTACT. We add product-agnostic siblings.
--
-- Ground truth (read from live project ycadmmngkdhvpcsrcuaq):
--   token_transactions(subscriber_id, jurisdiction_id, tokens_burned,
--                      kind, unlocked_until, created_at)
--   kind values in use: 'grant' (adds), 'unlock' (spends).
--   jw_token_balance = trial allowance + sum(grants) - sum(unlocks).
-- Signal Room burns are recorded with kind='unlock' so they are counted by
-- the SAME balance math — one balance, one burn path (§5.5).
-- =====================================================================

-- 1) Generalize the ledger: add product_key + ref_id, backfill JW rows.
alter table public.token_transactions
  add column if not exists product_key text,
  add column if not exists ref_id      uuid;

update public.token_transactions
   set product_key = 'jurisdiction_watch',
       ref_id      = jurisdiction_id
 where product_key is null
   and jurisdiction_id is not null;

-- Grants have no product/ref; leave them null. Mark legacy unlocks.
update public.token_transactions
   set product_key = 'jurisdiction_watch'
 where product_key is null
   and kind = 'unlock';

-- 2) Product-agnostic balance — same formula as jw_token_balance, so JW and
--    Signal Room share one wallet balance.
create or replace function public.wallet_token_balance(p_sub uuid)
returns integer
language sql
stable
as $$
  select coalesce((select token_allowance from public.jw_watchlists
                   where subscriber_id = p_sub and status in ('trialing','active')
                   order by created_at desc limit 1), 0)
       + coalesce((select sum(tokens_burned) from public.token_transactions
                   where subscriber_id = p_sub and kind = 'grant'), 0)
       - coalesce((select sum(tokens_burned) from public.token_transactions
                   where subscriber_id = p_sub and kind = 'unlock'), 0);
$$;

-- 3) Product-agnostic, atomic burn-to-unlock-for-a-window (review item 2).
--    Reads cost from product_meters (config-driven). Per-subscriber advisory
--    xact lock + single atomic debit means no read-then-write race, so rapid
--    double-clicks and webhook retries cannot double-burn or overdraft.
create or replace function public.wallet_burn(
  p_sub         uuid,
  p_product_key text,
  p_ref_id      uuid,
  p_window      interval
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cost     int;
  v_until    timestamptz;
  v_existing public.token_transactions%rowtype;
  v_inserted int;
begin
  -- Serialize all wallet writes for this subscriber.
  perform pg_advisory_xact_lock(hashtextextended(p_sub::text, 0));

  select tokens_cost into v_cost
  from public.product_meters where product_key = p_product_key;
  if v_cost is null then
    return jsonb_build_object('error','unknown_meter','product_key',p_product_key);
  end if;

  -- Double-activation is a no-op while a window is active (cached).
  select * into v_existing
  from public.token_transactions
  where subscriber_id = p_sub
    and product_key = p_product_key
    and ref_id = p_ref_id
    and kind = 'unlock'
    and unlocked_until > now()
  order by unlocked_until desc limit 1;
  if found then
    return jsonb_build_object(
      'charged', 0, 'cached', true,
      'unlocked_until', v_existing.unlocked_until,
      'balance', public.wallet_token_balance(p_sub));
  end if;

  v_until := now() + p_window;

  -- Atomic debit: the row only inserts if the balance covers the cost.
  insert into public.token_transactions
    (subscriber_id, jurisdiction_id, product_key, ref_id,
     tokens_burned, kind, unlocked_until)
  select p_sub, null, p_product_key, p_ref_id, v_cost, 'unlock', v_until
  where public.wallet_token_balance(p_sub) >= v_cost;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object(
      'error','insufficient_tokens',
      'cost', v_cost,
      'balance', public.wallet_token_balance(p_sub));
  end if;

  return jsonb_build_object(
    'charged', v_cost, 'cached', false,
    'unlocked_until', v_until,
    'balance', public.wallet_token_balance(p_sub));
end $$;

-- 4) Signal Room activation: validates ownership, burns via wallet_burn with
--    the config-driven 30-day window, flips the configuration to active.
create or replace function public.signal_room_activate(p_config_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_sub    uuid;
  v_days   int;
  v_result jsonb;
begin
  select subscriber_id into v_sub
  from public.signal_configurations where id = p_config_id;
  if v_sub is null then
    return jsonb_build_object('error','not_found');
  end if;
  -- Ownership: only the configuration owner may activate it.
  if v_sub <> auth.uid() then
    return jsonb_build_object('error','forbidden');
  end if;

  select activation_window_days into v_days
  from public.signal_room_settings where id = 1;
  v_days := coalesce(v_days, 30);

  v_result := public.wallet_burn(
    v_sub, 'signal_room', p_config_id, make_interval(days => v_days));

  if (v_result ? 'error') then
    return v_result;
  end if;

  update public.signal_configurations
     set status = 'active',
         activated_until = (v_result->>'unlocked_until')::timestamptz,
         last_modified = now()
   where id = p_config_id;

  return v_result;
end $$;

grant execute on function public.wallet_token_balance(uuid) to authenticated;
grant execute on function public.signal_room_activate(uuid) to authenticated;
-- wallet_burn is invoked only via signal_room_activate (security definer);
-- it is not granted to authenticated directly.
revoke execute on function public.wallet_burn(uuid, text, uuid, interval)
  from authenticated, anon;
