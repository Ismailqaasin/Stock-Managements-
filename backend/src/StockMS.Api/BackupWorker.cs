using StockMS.Infrastructure;
namespace StockMS.Api;
/// <summary>Manual backup jobs are durable rows, not fire-and-forget HTTP tasks.</summary>
public sealed class BackupWorker(IServiceScopeFactory scopes, ILogger<BackupWorker> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                using var scope = scopes.CreateScope();
                var service = scope.ServiceProvider.GetRequiredService<BackupService>();
                if (await service.RunQueued(ct))
                    continue;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Database backup job failed");
            }
            await Task.Delay(TimeSpan.FromSeconds(3), ct);
        }
    }
}
