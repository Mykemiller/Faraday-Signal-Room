-- =====================================================================
-- Signal Room — signal_room_0008_framing_trgm   (FDY-267, CC-FSR-SIGNAL-AUTOMATION-1.0)
--
-- WRITTEN, NOT APPLIED. Run AFTER 0007.
-- MUST RUN OUTSIDE A TRANSACTION: CREATE INDEX CONCURRENTLY cannot run inside BEGIN/COMMIT.
-- In the Supabase SQL editor, run this file on its own (nothing else in the editor).
-- CONCURRENTLY keeps signals writable while the index builds (~3.9k rows; seconds).
--
-- Serves the D4 near-duplicate review lookup (similarity(framing, new framing)) in Phase 2.
-- pg_trgm 1.6 is already installed in schema public.
-- If the build fails it leaves an INVALID index: drop it (line below) and re-run.
-- Rollback: drop index concurrently if exists public.idx_signals_framing_trgm;
-- =====================================================================
create index concurrently if not exists idx_signals_framing_trgm
  on public.signals using gin (framing public.gin_trgm_ops)
  where framing is not null;
