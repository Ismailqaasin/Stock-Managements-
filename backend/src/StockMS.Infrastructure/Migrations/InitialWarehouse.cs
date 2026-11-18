using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
namespace StockMS.Infrastructure.Migrations;
[DbContext(typeof(StockDb)),Migration("202611180001_InitialWarehouse")]
public sealed class InitialWarehouse : Migration {
    protected override void Up(MigrationBuilder m){
        var a=typeof(InitialWarehouse).Assembly;
        foreach(var name in a.GetManifestResourceNames().Where(x=>x.EndsWith(".sql")).Order()){
            using var reader=new StreamReader(a.GetManifestResourceStream(name)!); m.Sql(reader.ReadToEnd());
        }
    }
    protected override void Down(MigrationBuilder m)=>throw new NotSupportedException("Restore a verified pre-migration backup instead of destroying warehouse history.");
}
