using Microsoft.EntityFrameworkCore;
using System.Text.RegularExpressions;
using StockMS.Domain;
namespace StockMS.Infrastructure;
public sealed class StockDb(DbContextOptions<StockDb> options) : DbContext(options) {
    public DbSet<AdminUser> Admins => Set<AdminUser>(); public DbSet<RefreshToken> Tokens => Set<RefreshToken>();
    protected override void OnModelCreating(ModelBuilder b){
        b.Entity<AdminUser>().ToTable("admin_users").Property(x=>x.Id).ValueGeneratedNever(); b.Entity<RefreshToken>().ToTable("refresh_tokens");
        foreach(var e in b.Model.GetEntityTypes()) foreach(var p in e.GetProperties())p.SetColumnName(Regex.Replace(p.Name,"(?<!^)([A-Z])","_$1").ToLowerInvariant());
    }
}
