using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Npgsql;
namespace StockMS.Infrastructure;
// Metadata tables are intentionally outside the dump so the safety backup and restore history survive restoration.
public sealed class BackupService(StockDb db,StockService stock,string directory,string connection) {
    static readonly SemaphoreSlim BackupLock=new(1,1);
    string PathFor(string file)=>Path.Combine(directory,Path.GetFileName(file));
    async Task Run(string tool,IEnumerable<string> args,CancellationToken ct){
        var cs=new NpgsqlConnectionStringBuilder(connection);var p=new ProcessStartInfo(tool){UseShellExecute=false,RedirectStandardError=true,RedirectStandardOutput=true};
        p.Environment["PGPASSWORD"]=cs.Password; p.Environment["PGHOST"]=cs.Host; p.Environment["PGPORT"]=cs.Port.ToString(); p.Environment["PGUSER"]=cs.Username;p.Environment["PGDATABASE"]=cs.Database;
        foreach(var a in args)p.ArgumentList.Add(a);using var process=Process.Start(p)??throw new InvalidOperationException("PostgreSQL client unavailable.");
        var err=process.StandardError.ReadToEndAsync(ct);var output=process.StandardOutput.BaseStream.CopyToAsync(Stream.Null,ct);
        try{await process.WaitForExitAsync(ct);await Task.WhenAll(err,output);}catch(OperationCanceledException){if(!process.HasExited)process.Kill(true);throw;}
        if(process.ExitCode!=0)throw new InvalidOperationException("PostgreSQL archive operation failed. Check database connectivity and client version.");
    }
    Task<JsonElement> Row(int id)=>stock.Detail("backups",id,default);
    static async Task<string> Checksum(string path){await using var f=File.OpenRead(path);return Convert.ToHexString(await SHA256.HashDataAsync(f));}
    public async Task<JsonElement> Create(CancellationToken ct){await BackupLock.WaitAsync(ct);try{return await Snapshot("Manual",ct);}finally{BackupLock.Release();}}
    async Task<JsonElement> Snapshot(string type,CancellationToken ct){Directory.CreateDirectory(directory);string file=$"stockroom_{DateTime.UtcNow:yyyyMMdd_HHmmss}_{Guid.NewGuid():N}.dump";string path=PathFor(file);
        var id=await db.Database.SqlQuery<int>($"INSERT INTO backups(file_name,file_path,type,status) VALUES({file},{file},{type},'InProgress') RETURNING id").ToListAsync(ct);
        try{await Run("pg_dump",["-Fc","--no-owner","--no-acl","--exclude-table=backups","--exclude-table=restore_logs","--file",path],ct);var sha=await Checksum(path);await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE backups SET status='Completed',file_size={new FileInfo(path).Length},checksum_sha256={sha},completed_at=now() WHERE id={id[0]}",ct);await stock.Audit("Backup","Database backup completed");return await Row(id[0]);}
        catch{await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE backups SET status='Failed',error_message='Archive creation failed',completed_at=now() WHERE id={id[0]}");throw;}}
    public async Task<string> Verify(int id,CancellationToken ct){var r=await Row(id);var path=PathFor(r.GetProperty("file_name").GetString()!);if(r.GetProperty("status").GetString()!="Completed"||!File.Exists(path)||await Checksum(path)!=r.GetProperty("checksum_sha256").GetString())throw new InvalidOperationException("Backup checksum verification failed.");
        await Run("pg_restore",["--list",path],ct);await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE backups SET verified_at=now() WHERE id={id}",ct);await stock.Audit("Verify","Backup verified");return path;}
    public async Task Restore(int id,CancellationToken ct){await BackupLock.WaitAsync(ct);try{var path=await Verify(id,ct);await Snapshot("PreRestore",ct);var log=await db.Database.SqlQuery<int>($"INSERT INTO restore_logs(backup_id,status) VALUES({id},'InProgress') RETURNING id").ToListAsync(ct);
        try{var cs=new NpgsqlConnectionStringBuilder(connection);await Run("pg_restore",["--dbname",cs.Database!,"--clean","--if-exists","--single-transaction","--exit-on-error","--no-owner","--no-acl",path],ct);
            if(!(await stock.Integrity(ct)).GetProperty("ok").GetBoolean())throw new InvalidOperationException("Restored ledger does not reconcile. Use the safety backup.");await db.Database.ExecuteSqlRawAsync("UPDATE refresh_tokens SET revoked_at=now() WHERE revoked_at IS NULL",ct);await stock.Audit("Restore","Verified database backup restored");await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE restore_logs SET status='Completed',completed_at=now() WHERE id={log[0]}",ct);}
        catch{await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE restore_logs SET status='Failed',completed_at=now(),error_message='Restore failed; safety backup retained' WHERE id={log[0]}");throw;}}
        finally{BackupLock.Release();}}
}
