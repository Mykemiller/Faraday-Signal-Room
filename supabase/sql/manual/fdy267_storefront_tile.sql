-- FDY-267 · D8 · Myke runs this (status_tag is an editorial field).
-- Sets the Signal Room storefront tile to PLANNED · 2026-12-14 and binds it to FDY-267.
-- Live state 2026-11-14 18:20 UTC: enabled = true, status_tag = 'SR 00.08 · NOT READY', linear_issue_keys = null.
begin;

create table if not exists public._snap_workbench_storefront_tiles_signal_room_20261114 as
  select *, now() as snapped_at from public.workbench_storefront_tiles where slug = 'signal-room';

do $$
declare n int;
begin
  update public.workbench_storefront_tiles
     set status_tag = 'PLANNED · 2026-12-14',
         linear_issue_keys = '{FDY-267}'
   where slug = 'signal-room';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'expected exactly 1 row for slug signal-room, got %', n;
  end if;
end $$;

select slug, enabled, status_tag, linear_issue_keys, updated_at from public.workbench_storefront_tiles where slug = 'signal-room';
commit;

-- Revert (one line):
-- update public.workbench_storefront_tiles t set status_tag = s.status_tag, linear_issue_keys = s.linear_issue_keys from public._snap_workbench_storefront_tiles_signal_room_20261114 s where t.slug = 'signal-room' and s.slug = 'signal-room';
