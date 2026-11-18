#!/usr/bin/env bash
# Optional native acceptance check. Needs initdb, pg_ctl, psql, pg_dump, pg_restore (PostgreSQL 16).
# Creates a new temp cluster, UNIX socket only. Never touches any configured business database.
set -euo pipefail
cd "$(dirname "$0")/.."
work=$(mktemp -d); chmod 700 "$work"
export PGUSER=postgres PGHOST="$work" PGDATABASE=postgres PGPORT=55447
trap 'pg_ctl -D "$work/db" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$work"' EXIT
initdb -D "$work/db" --auth=trust -U postgres >/dev/null
pg_ctl -D "$work/db" -o "-k $work -p $PGPORT -c listen_addresses=''" -l "$work/server.log" -w start >/dev/null
sql(){ psql -XqAt -v ON_ERROR_STOP=1 "$@"; }
for f in database/00*.sql; do sql -f "$f"; done
sql <<'SQL' >/dev/null
SELECT stock_command('products','create',NULL,'{"name":"Test item","sku":"TEST1","selling_price":2.50}');
SELECT stock_command('stock-ins','create',NULL,'{"items":[{"product_id":1,"quantity":5}]}');
SQL
sale="SELECT stock_command('orders','create',NULL,'{\"customer_type\":\"Cash\",\"confirm\":true,\"items\":[{\"product_id\":1,\"quantity\":4}]}');"
sql -c "$sale" >"$work/a" 2>&1 & a=$!
sql -c "$sale" >"$work/b" 2>&1 & b=$!
wins=0; if wait "$a"; then wins=$((wins+1)); fi; if wait "$b"; then wins=$((wins+1)); fi
[[ $wins == 1 && $(sql -c 'SELECT current_stock FROM products') == 1 ]]
pg_dump -Fc --no-owner --no-acl --file "$work/snapshot.dump"; pg_restore --list "$work/snapshot.dump" >/dev/null
sql <<'SQL' >/dev/null
SELECT stock_command('stock-ins','create',NULL,'{"items":[{"product_id":1,"quantity":7}]}');
INSERT INTO backups(file_name,file_path,type,status) VALUES('snapshot.dump','snapshot.dump','Manual','Completed'),('safety.dump','safety.dump','PreRestore','Completed');
INSERT INTO restore_logs(backup_id,status) VALUES(1,'InProgress');
SQL
pg_dump -Fc --no-owner --no-acl --file "$work/safety.dump"
pg_restore --clean --if-exists --no-owner --no-acl -f "$work/restore.sql" "$work/snapshot.dump"
sql --single-transaction -v stockroom_backup_id=1 -v stockroom_log_id=1 -f database/maintenance/before_restore.sql -f "$work/restore.sql" -f database/maintenance/after_restore.sql >"$work/restore.log"
[[ $(sql -c 'SELECT current_stock FROM products') == 1 ]]
[[ $(sql -c 'SELECT count(*) FROM backups') == 2 ]]
[[ $(sql -c 'SELECT status FROM restore_logs') == Completed ]]
[[ $(sql -c "SELECT stock_integrity()->>'ok'") == true ]]
printf '%s\n' 'Passed native PostgreSQL concurrency, full archive, transactional restore, retained safety catalog and ledger reconciliation.'
