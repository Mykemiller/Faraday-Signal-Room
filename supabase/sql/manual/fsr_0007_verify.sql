-- FDY-267 · read-only checks after signal_room_0007 and signal_room_0008. Every row should say pass = true.
select 'review_status column exists, default approved' as check_name,
       exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'signals' and column_name = 'review_status'
                 and column_default like '%approved%' and is_nullable = 'NO') as pass
union all
select 'reviewed_by / reviewed_at / review_note exist',
       (select count(*) = 3 from information_schema.columns
        where table_schema = 'public' and table_name = 'signals' and column_name in ('reviewed_by', 'reviewed_at', 'review_note'))
union all
select 'check constraint present',
       exists (select 1 from pg_constraint where conname = 'signals_review_status_check' and conrelid = 'public.signals'::regclass)
union all
select 'every existing row approved',
       not exists (select 1 from public.signals where review_status <> 'approved')
union all
select 'view count = approved count',
       (select count(*) from public.subscriber_signals) = (select count(*) from public.signals where review_status = 'approved')
union all
select 'view keeps security_invoker',
       coalesce((select 'security_invoker=on' = any(reloptions) from pg_class where oid = 'public.subscriber_signals'::regclass), false)
union all
select 'view has no conviction column',
       not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'subscriber_signals' and column_name = 'conviction')
union all
select 'idx_signals_pending_review valid',
       coalesce((select i.indisvalid from pg_index i join pg_class c on c.oid = i.indexrelid where c.relname = 'idx_signals_pending_review'), false)
union all
select 'idx_signals_framing_trgm valid',
       coalesce((select i.indisvalid from pg_index i join pg_class c on c.oid = i.indexrelid where c.relname = 'idx_signals_framing_trgm'), false);

-- Prompt's own verification:
select column_name, column_default from information_schema.columns
where table_schema = 'public' and table_name = 'signals' and column_name like 'review%';
select review_status, count(*), max(fired_at) from public.signals group by 1;
select jobid, jobname, schedule, active from cron.job where jobid in (139, 145);
