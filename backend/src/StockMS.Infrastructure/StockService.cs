using Microsoft.EntityFrameworkCore;
using FluentValidation;
using Npgsql;
using System.Text.Json;
using StockMS.Application;
namespace StockMS.Infrastructure;
// Native PostgreSQL functions keep the stock/reservation/audit transaction indivisible across clients.
public sealed class StockService(StockDb db) : IStockService
{
    public async Task<JsonElement> Json(FormattableString sql, CancellationToken ct = default)
    {
        var rows = await db.Database.SqlQuery<string>(sql).ToListAsync(ct);
        return JsonSerializer.Deserialize<JsonElement>(rows.Single());
    }
    public Task<JsonElement> List(string resource, IReadOnlyDictionary<string, string> filters,
                                  CancellationToken ct) =>
        Json($"SELECT stock_list({resource},{JsonSerializer.Serialize(filters)}::jsonb)::text", ct);
    public Task<JsonElement> Detail(string resource, int id,
                                    CancellationToken ct) => Json($"SELECT stock_detail({resource},{id})::text",
                                                                  ct);
    public async Task<JsonElement> Command(string resource, string operation, int? id, JsonElement body,
                                           string? ip, string? agent, CancellationToken ct)
    {
        await new CommandValidator().ValidateAndThrowAsync(new DocumentCommand(resource, operation, body), ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT set_config('stockms.ip',{ip??""},true),set_config('stockms.agent',{agent??""},true)", ct);
        var idParam = new NpgsqlParameter("eid", NpgsqlTypes.NpgsqlDbType.Integer) { Value = (object?)id ?? DBNull.Value };
        var result = await Json($"SELECT stock_command({resource},{operation},{idParam},{body.GetRawText()}::jsonb)::text",ct);
        await tx.CommitAsync(ct);
        return result;
    }
    public Task<JsonElement> Settings(CancellationToken ct = default) => Json(
        $"SELECT (to_jsonb(s)||jsonb_build_object('version',xmin::text))::text FROM system_settings s WHERE id=1",
        ct);
    public Task<JsonElement> Dashboard(CancellationToken ct) => Json($"SELECT dashboard_summary()::text", ct);
    public Task<JsonElement> Integrity(CancellationToken ct) => Json($"SELECT stock_integrity()::text", ct);
    public Task
    Audit(string action, string description, string? ip = null) => db.Database.ExecuteSqlInterpolatedAsync(
        $"INSERT INTO audit_logs(admin_id,action,entity_type,description,ip_address) VALUES(1,{action},'system',{description},{ip})");
}
