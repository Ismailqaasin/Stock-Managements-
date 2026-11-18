namespace StockMS.Domain;

public sealed class AdminUser
{
    public int Id { get; set; }
    public required string Username { get; set; }
    public required string FullName { get; set; }
    public required string PasswordHash { get; set; }
    public string? RecoveryKeyHash { get; set; }
    public bool MustChangePassword { get; set; }
    public int FailedLoginCount { get; set; }
    public DateTime? LockedUntil { get; set; }
    public DateTime? LastLoginAt { get; set; }
    public DateTime PasswordChangedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
public sealed class RefreshToken
{
    public int Id { get; set; }
    public int AdminId { get; set; }
    public Guid SessionId { get; set; }
    public required string TokenHash { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime LastSeen { get; set; }
    public string? CreatedIp { get; set; }
    public DateTime? RevokedAt { get; set; }
    public int? ReplacedById { get; set; }
    public DateTime CreatedAt { get; set; }
}
public static class ReportCatalog
{
    public static readonly IReadOnlyDictionary<string, string> Types =
        new Dictionary<string, string> { ["products"] = "products",
                                         ["stock"] = "stock",
                                         ["low-stock"] = "low-stock",
                                         ["out-of-stock"] = "out-of-stock",
                                         ["stock-in"] = "stock-ins",
                                         ["stock-out"] = "dispatches",
                                         ["orders"] = "orders",
                                         ["customers"] = "customers",
                                         ["returns"] = "returns",
                                         ["damaged-items"] = "damaged-items",
                                         ["adjustments"] = "stock-adjustments",
                                         ["ledger"] = "stock-movements",
                                         ["audit"] = "audit-logs" };
}
