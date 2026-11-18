namespace StockMS.Domain;
public sealed class Category
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
public sealed class Product
{
    public int Id { get; set; }
    public string Sku { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public int? CategoryId { get; set; }
    public string? ImagePath { get; set; }
    public decimal SellingPrice { get; set; }
    public int CurrentStock { get; set; }
    public int? LowStockThreshold { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public uint Version { get; set; }
}
public sealed class Customer
{
    public int Id { get; set; }
    public string FullName { get; set; } = "";
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? Gender { get; set; }
    public string? Location { get; set; }
    public string? Notes { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
public sealed class StockIn
{
    public int Id { get; set; }
    public string ReferenceNo { get; set; } = "";
    public DateOnly ReceivedDate { get; set; }
    public string? SourceName { get; set; }
    public string? ExternalRef { get; set; }
    public string? Notes { get; set; }
    public string Status { get; set; } = "";
    public DateTime? ReversedAt { get; set; }
    public string? ReversalReason { get; set; }
    public DateTime CreatedAt { get; set; }
}
public sealed class StockInItem
{
    public int Id { get; set; }
    public int StockInId { get; set; }
    public int ProductId { get; set; }
    public int Quantity { get; set; }
}
public sealed class StockOut
{
    public int Id { get; set; }
    public string ReferenceNo { get; set; } = "";
    public string Type { get; set; } = "";
    public int ProductId { get; set; }
    public int Quantity { get; set; }
    public string RecipientName { get; set; } = "";
    public string Reason { get; set; } = "";
    public DateOnly OutDate { get; set; }
    public string? Notes { get; set; }
    public string Status { get; set; } = "";
    public DateTime? ReversedAt { get; set; }
    public string? ReversalReason { get; set; }
    public DateTime CreatedAt { get; set; }
}
public sealed class Order
{
    public int Id { get; set; }
    public string OrderNo { get; set; } = "";
    public string CustomerType { get; set; } = "";
    public int? CustomerId { get; set; }
    public string? CashCustomerName { get; set; }
    public string? CashCustomerPhone { get; set; }
    public DateOnly OrderDate { get; set; }
    public string Status { get; set; } = "";
    public decimal TotalAmount { get; set; }
    public string? Notes { get; set; }
    public DateTime? ConfirmedAt { get; set; }
    public DateTime? DeliveredAt { get; set; }
    public DateTime? CancelledAt { get; set; }
    public string? CancelReason { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public uint Version { get; set; }
}
public sealed class OrderItem
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public int ProductId { get; set; }
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal LineTotal { get; set; }
    public int ReturnedQty { get; set; }
}
public sealed class Return
{
    public int Id { get; set; }
    public string ReturnNo { get; set; } = "";
    public int OrderId { get; set; }
    public DateOnly ReturnDate { get; set; }
    public string Reason { get; set; } = "";
    public string Status { get; set; } = "";
    public string? Notes { get; set; }
    public DateTime? ApprovedAt { get; set; }
    public DateTime? RejectedAt { get; set; }
    public string? RejectReason { get; set; }
    public DateTime CreatedAt { get; set; }
    public uint Version { get; set; }
}
public sealed class ReturnItem
{
    public int Id { get; set; }
    public int ReturnId { get; set; }
    public int OrderItemId { get; set; }
    public int ProductId { get; set; }
    public int Quantity { get; set; }
    public string Condition { get; set; } = "";
    public string? Notes { get; set; }
}
public sealed class StockAdjustment
{
    public int Id { get; set; }
    public string ReferenceNo { get; set; } = "";
    public int ProductId { get; set; }
    public int PreviousQuantity { get; set; }
    public int NewQuantity { get; set; }
    public int Difference { get; set; }
    public string Reason { get; set; } = "";
    public DateOnly AdjustmentDate { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
}
public sealed class StockMovement
{
    public long Id { get; set; }
    public int ProductId { get; set; }
    public string MovementType { get; set; } = "";
    public int Quantity { get; set; }
    public int StockBefore { get; set; }
    public int StockAfter { get; set; }
    public string SourceType { get; set; } = "";
    public int SourceId { get; set; }
    public string ReferenceNo { get; set; } = "";
    public DateOnly OccurredAt { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
}
public sealed class AuditLog
{
    public long Id { get; set; }
    public int? AdminId { get; set; }
    public string Action { get; set; } = "";
    public string EntityType { get; set; } = "";
    public int? EntityId { get; set; }
    public string? ReferenceNo { get; set; }
    public string Description { get; set; } = "";
    public string? OldValues { get; set; }
    public string? NewValues { get; set; }
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
    public DateTime CreatedAt { get; set; }
}
public sealed class Backup
{
    public int Id { get; set; }
    public string FileName { get; set; } = "";
    public string FilePath { get; set; } = "";
    public long? FileSize { get; set; }
    public string? ChecksumSha256 { get; set; }
    public string Type { get; set; } = "";
    public string Status { get; set; } = "";
    public DateTime? VerifiedAt { get; set; }
    public DateTime StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public string? ErrorMessage { get; set; }
}
public sealed class RestoreLog
{
    public int Id { get; set; }
    public int BackupId { get; set; }
    public string Status { get; set; } = "";
    public DateTime StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public string? ErrorMessage { get; set; }
}
public sealed class SystemSetting
{
    public int Id { get; set; }
    public string SystemName { get; set; } = "";
    public string CompanyName { get; set; } = "";
    public string? CompanyPhone { get; set; }
    public string? CompanyEmail { get; set; }
    public string? CompanyAddress { get; set; }
    public string? LogoPath { get; set; }
    public string CurrencyCode { get; set; } = "";
    public string CurrencySymbol { get; set; } = "";
    public string TimeZone { get; set; } = "";
    public string DateFormat { get; set; } = "";
    public string DefaultLanguage { get; set; } = "";
    public string DefaultTheme { get; set; } = "";
    public int LowStockThreshold { get; set; }
    public int SessionTimeoutMinutes { get; set; }
    public DateTime UpdatedAt { get; set; }
}
public sealed class ReferenceCounter
{
    public string Prefix { get; set; } = "";
    public int Year { get; set; }
    public int LastNumber { get; set; }
}
