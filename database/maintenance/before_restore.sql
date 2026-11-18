-- Runs on the same connection / in the same transaction as the clean restore.
CREATE TEMP TABLE keep_backups ON COMMIT DROP AS SELECT * FROM public.backups;
CREATE TEMP TABLE keep_restores ON COMMIT DROP AS SELECT * FROM public.restore_logs;
