using System.Globalization;
using System.Text.Json;
using FluentValidation;
namespace StockMS.Application;
public record DocumentCommand(string Resource, string Operation, JsonElement Body);
/// <summary>Field-level HTTP validation; PostgreSQL also enforces cross-document rules atomically.</summary>
public class CommandValidator : AbstractValidator<DocumentCommand>
{
    public CommandValidator()
    {
        RuleFor(x => x).Custom(
            (cmd, ctx) =>
            {
                var b = cmd.Body;
                if (b.ValueKind != JsonValueKind.Object)
                {
                    ctx.AddFailure("body", "Supply a JSON object.");
                    return;
                }
                string ? Get(JsonElement o, string k) =>
                             o.ValueKind == JsonValueKind.Object && o.TryGetProperty(k, out var v) ? v.ToString()
                                                                                                   : null;
                void Required(string k)
                {
                    if (string.IsNullOrWhiteSpace(Get(b, k)))
                        ctx.AddFailure(k, "This field is required.");
                }
                void Integer(JsonElement o, string k, int min, string prefix = "")
                {
                    if (!int.TryParse(Get(o, k), out var n) || n < min)
                        ctx.AddFailure(prefix + k, $"Enter a whole number of at least {min}.");
                }
                void Money(JsonElement o, string k, string prefix = "")
                {
                    if (!decimal.TryParse(Get(o, k), NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture,
                                          out var n) ||
                        n < 0 || decimal.Round(n, 2) != n)
                        ctx.AddFailure(prefix + k, "Enter a nonnegative price with at most two decimal places.");
                }
                if (cmd.Operation is "reverse" or "reject" or "cancel")
                    Required("reason");
                if (cmd.Operation is not("create" or "update"))
                    return;
                if (cmd.Operation == "update")
                    Required("version");
    if(Get(b,"date") is {Length:>0} day&&!DateOnly.TryParseExact(day,"yyyy-MM-dd",CultureInfo.InvariantCulture,DateTimeStyles.None,out _))
        ctx.AddFailure("date", "Use YYYY-MM-DD.");
    switch (cmd.Resource)
    {
    case "products":
        Required("name");
        Required("sku");
        Money(b, "selling_price");
        break;
    case "categories":
        Required("name");
        break;
    case "customers":
        Required("full_name");
        break;
    case "stock-outs":
        Required("type");
        Required("recipient_name");
        Required("reason");
        Integer(b, "product_id", 1);
        Integer(b, "quantity", 1);
        break;
    case "stock-adjustments":
        Required("reason");
        Integer(b, "product_id", 1);
        Integer(b, "new_quantity", 0);
        break;
    case "orders":
        Required("customer_type");
        if (Get(b, "customer_type") == "Registered")
            Integer(b, "customer_id", 1);
        break;
    case "returns":
        Integer(b, "order_id", 1);
        Required("reason");
        break;
    case "settings":
        Required("company_name");
        Required("system_name");
        Required("time_zone");
        Integer(b, "low_stock_threshold", 0);
        Integer(b, "session_timeout_minutes", 5);
        break;
    }
    if (cmd.Resource is "stock-ins" or "orders" or "returns")
    {
        if (!b.TryGetProperty("items", out var items) || items.ValueKind != JsonValueKind.Array ||
            items.GetArrayLength() is < 1 or > 100)
        {
            ctx.AddFailure("items", "Add between 1 and 100 items.");
            return;
        }
        int index = 0;
        foreach (var i in items.EnumerateArray())
        {
            var prefix = $"items[{index++}].";
            Integer(i, cmd.Resource == "returns" ? "order_item_id" : "product_id", 1, prefix);
            Integer(i, "quantity", 1, prefix);if(cmd.Resource=="orders"&&Get(i,"unit_price") is {Length:>0})
                Money(i, "unit_price", prefix);
            if (cmd.Resource == "returns" && Get(i, "condition") is not("Good" or "Damaged"))
                ctx.AddFailure(prefix + "condition", "Choose Good or Damaged.");
        }
    }
            });
    }
}
