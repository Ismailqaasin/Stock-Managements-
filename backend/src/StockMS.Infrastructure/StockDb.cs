using Microsoft.EntityFrameworkCore;
using System.Text.RegularExpressions;
using StockMS.Domain;
namespace StockMS.Infrastructure;
public sealed class StockDb(DbContextOptions<StockDb> options) : DbContext
(options)
{
    public DbSet<AdminUser> Admins => Set<AdminUser>();
    public DbSet<RefreshToken> Tokens => Set<RefreshToken>();
    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<AdminUser>().ToTable("admin_users").Property(x => x.Id).ValueGeneratedNever();
        b.Entity<RefreshToken>().ToTable("refresh_tokens");
        b.Entity<Category>().ToTable("categories");
        b.Entity<Product>().ToTable("products");
        b.Entity<Customer>().ToTable("customers");
        b.Entity<StockIn>().ToTable("stock_ins");
        b.Entity<StockInItem>().ToTable("stock_in_items");
        b.Entity<StockOut>().ToTable("stock_outs");
        b.Entity<Order>().ToTable("orders");
        b.Entity<OrderItem>().ToTable("order_items");
        b.Entity<Return>().ToTable("returns");
        b.Entity<ReturnItem>().ToTable("return_items");
        b.Entity<StockAdjustment>().ToTable("stock_adjustments");
        b.Entity<StockMovement>().ToTable("stock_movements");
        b.Entity<AuditLog>().ToTable("audit_logs");
        b.Entity<Backup>().ToTable("backups");
        b.Entity<RestoreLog>().ToTable("restore_logs");
        b.Entity<SystemSetting>().ToTable("system_settings");
        b.Entity<ReferenceCounter>().ToTable("reference_counters");
        b.Entity<ReferenceCounter>().HasKey(c => new { c.Prefix, c.Year });
        b.Entity<AuditLog>().Property(a => a.OldValues).HasColumnType("jsonb");
        b.Entity<AuditLog>().Property(a => a.NewValues).HasColumnType("jsonb");
        b.Entity<OrderItem>()
            .Property(i => i.LineTotal)
            .HasComputedColumnSql("quantity * unit_price", stored: true);
        b.Entity<StockAdjustment>()
            .Property(i => i.Difference)
            .HasComputedColumnSql("new_quantity - previous_quantity", stored: true);
        foreach (var e in b.Model.GetEntityTypes())
            foreach (var p in e.GetProperties())
                p.SetColumnName(Regex.Replace(p.Name, "(?<!^)([A-Z])", "_$1").ToLowerInvariant());
        b.Entity<Product>().Property(p => p.Version).IsRowVersion().HasColumnName("xmin");
        b.Entity<Order>().Property(p => p.Version).IsRowVersion().HasColumnName("xmin");
        b.Entity<Return>().Property(p => p.Version).IsRowVersion().HasColumnName("xmin");
    }
    void EnforceStockBoundary()
    {
        if (ChangeTracker.Entries().Any(
                e => (e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted) &&
                     e.Entity is not(AdminUser or RefreshToken)))
            throw new InvalidOperationException("Use StockService for warehouse commands.");
    }
    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        EnforceStockBoundary();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }
    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken ct = default)
    {
        EnforceStockBoundary();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, ct);
    }
}
