using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using System.Text.Json;
namespace StockMS.Infrastructure;
public static class ReportPdf
{
    static readonly JsonElement Catalog = Load();
    static JsonElement Load()
    {
        var a = typeof(ReportPdf).Assembly;
        using var s = a.GetManifestResourceStream(
            a.GetManifestResourceNames().Single(n => n.EndsWith("report-labels.json")))!;
        return JsonSerializer.Deserialize<JsonElement>(s);
    }
    static string Text(JsonElement row, string key) => row.TryGetProperty(key, out var v) ? v.ToString() : "";
    public static byte[] Render(string type, JsonElement settings, IReadOnlyList<JsonElement> rows, bool so,
                                string filters, string? uploads = null)
    {
        var spec = Catalog.GetProperty(type).EnumerateArray().Select(x => x.GetString()!).ToArray();
        var cols = spec.Skip(2).ToArray();
        string Label(string k) => so && Catalog.GetProperty("fields").TryGetProperty(k, out var val)
                                      ? val.GetString()!
                                      : k.Replace('_', ' ');
        string CellValue(JsonElement row,string k)
        {
            var value = Text(row,k);
            if ((k is "selling_price" or "total_amount" or "unit_price" or "line_total") && row.TryGetProperty(k,out var money) && money.TryGetDecimal(out var amount))
                return Text(settings,"currency_symbol") + amount.ToString("N2",System.Globalization.CultureInfo.InvariantCulture);
            if (k=="date" && DateOnly.TryParse(value,out var day)) {
                var format=Text(settings,"date_format") switch {"DD/MM/YYYY"=>"dd/MM/yyyy","MM/DD/YYYY"=>"MM/dd/yyyy",_=>"yyyy-MM-dd"};
                return day.ToString(format,System.Globalization.CultureInfo.InvariantCulture);
            }
            if (so && (k is "status" or "type" or "condition" or "action") && Catalog.GetProperty("values").TryGetProperty(value,out var term)) return term.GetString()!;
            return value;
        }
        var generated = TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTime.UtcNow, Text(settings, "time_zone"))
                            .ToString("yyyy-MM-dd HH:mm");
        return Document
            .Create(
                d => d.Page(pg =>
                            {
                                pg.Size(PageSizes.A4);
                                pg.Margin(35);
                                pg.DefaultTextStyle(x => x.FontSize(9));
                                pg.Header().Column(
                                    c =>
                                    {
                                        var logo = Path.GetFileName(Text(settings, "logo_path"));
                                        if (uploads != null && !string.IsNullOrEmpty(logo) &&
                                            File.Exists(Path.Combine(uploads, logo)))
                                            c.Item().Height(35).Image(Path.Combine(uploads, logo)).FitArea();
                                        c.Item()
                                            .Text(Text(settings, "system_name"))
                                            .FontSize(22)
                                            .Bold()
                                            .FontColor("#205640");
                                        c.Item().Text(string.Join("   ", new[] { "company_name", "company_address",
                                                                                 "company_phone", "company_email" }
                                                                             .Select(k => Text(settings, k))));
                                    });
                                pg.Content().PaddingVertical(18).Column(
                                    c =>
                                    {
                                        c.Item().Text(spec[so ? 1 : 0]).FontSize(17).Bold();
                                        c.Item().PaddingVertical(8).Text(filters);
                                        void Table(string[] keys, IEnumerable<JsonElement> data)
                                        {
                                            c.Item().Table(t =>
                                                           {
                                                               t.ColumnsDefinition(cd =>
                                                                                   {
                                                                                       foreach (var _ in keys)
                                                                                           cd.RelativeColumn();
                                                                                   });
                                                               t.Header(h =>
                                                                        {
                                                                            foreach (var k in keys)
                                                                                h.Cell()
                                                                                    .Background("#E8F0E9")
                                                                                    .Padding(5)
                                                                                    .Text(Label(k))
                                                                                    .Bold();
                                                                        });
                                                               foreach (var row in data)
                                                                   foreach (var k in keys)
                                                                       t.Cell()
                                                                           .BorderBottom(0.5f)
                                                                           .BorderColor("#CED8D1")
                                                                           .Padding(5)
                                                                           .Text(CellValue(row, k));
                                                           });
                                        }
                                        Table(cols, rows);
                                        foreach (var row in rows)
                                            if (row.TryGetProperty("items", out var items))
                                            {
                                                c.Item().PaddingTop(16).Text(so ? "Alaabta" : "Line items").Bold();
                                                string[] lineColumns = type switch {
                                                    "orders" => ["product", "quantity", "unit_price", "line_total"],
                                                    "returns" => ["product", "quantity", "condition"],
                                                    _ => ["product", "quantity"]
                                                };
                                                Table(lineColumns, items.EnumerateArray());
                                            }
                                        if (rows.Count == 0)
                                            c.Item().PaddingVertical(12).Text(so ? "Xog lama helin"
                                                                                 : "No matching records.");
                                    });
                                pg.Footer().Row(r =>
                                                {
                                                    r.RelativeItem().Text(generated + " · " +
                                                                          Text(settings, "time_zone"));
                                                    r.AutoItem().Text(t =>
                                                                      {
                                                                          t.Span(so ? "Bogga " : "Page ");
                                                                          t.CurrentPageNumber();
                                                                          t.Span(" / ");
                                                                          t.TotalPages();
                                                                      });
                                                });
                            }))
            .GeneratePdf();
    }
}
