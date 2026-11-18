SET LOCAL search_path TO public, pg_catalog;
TRUNCATE restore_logs, backups RESTART IDENTITY;
INSERT INTO backups OVERRIDING SYSTEM VALUE SELECT * FROM pg_temp.keep_backups;
INSERT INTO restore_logs OVERRIDING SYSTEM VALUE SELECT * FROM pg_temp.keep_restores;
SELECT setval(pg_get_serial_sequence('backups','id'), max(id)) FROM backups;
SELECT setval(pg_get_serial_sequence('restore_logs','id'), max(id)) FROM restore_logs;
DO $check$ BEGIN
    IF NOT ((stock_integrity()->>'ok')::boolean) THEN RAISE EXCEPTION 'Restored balances do not reconcile'; END IF;
END $check$;
UPDATE refresh_tokens SET revoked_at=now() WHERE revoked_at IS NULL;
SELECT log_event('Restore','backups',:stockroom_backup_id,'Verified database backup restored');
UPDATE restore_logs SET status='Completed',completed_at=now() WHERE id=:stockroom_log_id;
