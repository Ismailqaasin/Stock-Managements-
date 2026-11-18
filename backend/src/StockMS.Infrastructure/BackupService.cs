using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Npgsql;
namespace StockMS.Infrastructure;
// Full, portable archives. During an in-place restore, temporary tables retain the local archive catalog.
public sealed class BackupService(StockDb db, StockService stock, string directory, string connection)
{
    static readonly SemaphoreSlim BackupLock = new(1, 1);
    string PathFor(string file) => Path.Combine(directory, Path.GetFileName(file));
    async Task Run(string tool, IEnumerable<string> args, CancellationToken ct)
    {
        var cs = new NpgsqlConnectionStringBuilder(connection);
        var p = new ProcessStartInfo(tool) { UseShellExecute = false, RedirectStandardError = true,
                                             RedirectStandardOutput = true };
        p.Environment["PGPASSWORD"] = cs.Password;
        p.Environment["PGHOST"] = cs.Host;
        p.Environment["PGPORT"] = cs.Port.ToString();
        p.Environment["PGUSER"] = cs.Username;
        p.Environment["PGDATABASE"] = cs.Database;
        foreach (var a in args)
            p.ArgumentList.Add(a);
        using var process =
            Process.Start(p) ?? throw new InvalidOperationException("PostgreSQL client unavailable.");
        var err = process.StandardError.ReadToEndAsync(ct);
        var output = process.StandardOutput.BaseStream.CopyToAsync(Stream.Null, ct);
        try
        {
            await process.WaitForExitAsync(ct);
            await Task.WhenAll(err, output);
        }
        catch (OperationCanceledException)
        {
            if (!process.HasExited)
                process.Kill(true);
            throw;
        }
        if (process.ExitCode != 0)
            throw new InvalidOperationException(
                "PostgreSQL archive operation failed. Check database connectivity and client version.");
    }
    Task<JsonElement> Row(int id) => stock.Detail("backups", id, default);
    static async Task<string> Checksum(string path)
    {
        await using var f = File.OpenRead(path);
        return Convert.ToHexString(await SHA256.HashDataAsync(f));
    }
    async Task<int> Enqueue(string type, CancellationToken ct)
    {
        Directory.CreateDirectory(directory);
        var file = $"stockroom_{DateTime.UtcNow:yyyyMMdd_HHmmss}_{Guid.NewGuid():N}.dump";
        var ids =
            await db.Database
                .SqlQuery<int>(
                    $"INSERT INTO backups(file_name,file_path,type,status) VALUES({file},{file},{type},'InProgress') RETURNING id")
                .ToListAsync(ct);
        return ids.Single();
    }
    public async Task<JsonElement> Create(CancellationToken ct) => await Row(await Enqueue("Manual", ct));
    public async Task<bool> RunQueued(CancellationToken ct)
    {
        await BackupLock.WaitAsync(ct);
        try
        {
            var jobs =
                await db.Database
                    .SqlQuery<int>(
                        $"SELECT id FROM backups WHERE type='Manual' AND status='InProgress' ORDER BY id LIMIT 1")
                    .ToListAsync(ct);
            if (jobs.Count == 0)
                return false;
            await WriteSnapshot(jobs[0], ct);
            return true;
        }
        finally
        {
            BackupLock.Release();
        }
    }
    async Task WriteSnapshot(int id, CancellationToken ct)
    {
        var row = await Row(id);
        var path = PathFor(row.GetProperty("file_name").GetString()!);
        try
        {
            await Run("pg_dump", ["-Fc", "--no-owner", "--no-acl", "--file", path + ".partial"], ct);
            File.Move(path + ".partial", path, true);
            var sha = await Checksum(path);
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE backups SET status='Completed',file_size={new FileInfo(path).Length},checksum_sha256={sha},completed_at=now() WHERE id={id}",
                ct);
            await stock.Audit("Backup", "Database backup completed");
        }
        catch
        {
            if (File.Exists(path + ".partial"))
                File.Delete(path + ".partial");
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE backups SET status='Failed',error_message='Archive creation failed',completed_at=now() WHERE id={id}");
            throw;
        }
    }
    public async Task<string> Verify(int id, CancellationToken ct)
    {
        var r = await Row(id);
        var path = PathFor(r.GetProperty("file_name").GetString()!);
        if (r.GetProperty("status").GetString() != "Completed" || !File.Exists(path) ||
            await Checksum(path) != r.GetProperty("checksum_sha256").GetString())
            throw new InvalidOperationException("Backup checksum verification failed.");
        await Run("pg_restore", ["--list", path], ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE backups SET verified_at=now() WHERE id={id}", ct);
        await stock.Audit("Verify", "Backup verified");
        return path;
    }
    public async Task Restore(int id, CancellationToken ct)
    {
        await BackupLock.WaitAsync(ct);
        try
        {
            var path = await Verify(id, ct);
            var safetyId = await Enqueue("PreRestore", ct);
            await WriteSnapshot(safetyId, ct);
            await Verify(safetyId, ct);
            var log = await db.Database
                          .SqlQuery<int>(
                              $"INSERT INTO restore_logs(backup_id,status) VALUES({id},'InProgress') RETURNING id")
                          .ToListAsync(ct);
            var scratch = Path.Combine(directory, "restore-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(scratch);
            try
            {
                // Decompress only after verifying the archive. Use psql's single transaction
                // so even a post-restore integrity failure rolls the ENTIRE restore back.
                var dump = Path.Combine(scratch, "archive.sql");
                var before = Path.Combine(scratch, "before.sql");
                var after = Path.Combine(scratch, "after.sql");
                await Run("pg_restore", ["--file", dump, "--clean", "--if-exists", "--no-owner", "--no-acl", path], ct);
                await File.WriteAllTextAsync(before, """
                    CREATE TEMP TABLE keep_backups ON COMMIT DROP AS SELECT * FROM public.backups;
                    CREATE TEMP TABLE keep_restores ON COMMIT DROP AS SELECT * FROM public.restore_logs;
                    """, ct);
                await File.WriteAllTextAsync(after, $$"""
                    SET LOCAL search_path TO public, pg_catalog;
                    TRUNCATE restore_logs, backups RESTART IDENTITY;
                    INSERT INTO backups OVERRIDING SYSTEM VALUE SELECT * FROM pg_temp.keep_backups;
                    INSERT INTO restore_logs OVERRIDING SYSTEM VALUE SELECT * FROM pg_temp.keep_restores;
                    SELECT setval(pg_get_serial_sequence('backups','id'),max(id)) FROM backups;
                    SELECT setval(pg_get_serial_sequence('restore_logs','id'),max(id)) FROM restore_logs;
                    DO $check$ BEGIN
                      IF NOT ((stock_integrity()->>'ok')::boolean) THEN RAISE EXCEPTION 'Restored balances do not reconcile'; END IF;
                    END $check$;
                    UPDATE refresh_tokens SET revoked_at=now() WHERE revoked_at IS NULL;
                    SELECT log_event('Restore','backups',{{id}},'Verified database backup restored');
                    UPDATE restore_logs SET status='Completed',completed_at=now() WHERE id={{log[0]}};
                    """, ct);
                await Run("psql", ["-X", "--quiet", "--single-transaction", "--set", "ON_ERROR_STOP=1", "-f", before, "-f", dump, "-f", after], ct);
                NpgsqlConnection.ClearAllPools();
            }
            catch
            {
                await db.Database.ExecuteSqlInterpolatedAsync(
                    $"UPDATE restore_logs SET status='Failed',completed_at=now(),error_message='Restore failed; safety backup retained' WHERE id={log[0]}");
                throw;
            }
            finally
            {
                if (Directory.Exists(scratch)) Directory.Delete(scratch, recursive:true);
            }
        }
        finally
        {
            BackupLock.Release();
        }
    }
}
