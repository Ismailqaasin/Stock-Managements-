using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using StockMS.Domain;
using Testcontainers.PostgreSql;
using Xunit;
namespace StockMS.IntegrationTests;

public sealed class WarehouseApiTests : IAsyncLifetime
{
    readonly PostgreSqlContainer postgres = new PostgreSqlBuilder().WithImage("postgres:16-alpine").Build();
    readonly string firstPass = Convert.ToHexString(RandomNumberGenerator.GetBytes(24));
    WebApplicationFactory<Program> factory = null!;
    public async Task InitializeAsync()
    {
        await postgres.StartAsync();
        // Host settings are supplied before Program reads startup secrets.
        Environment.SetEnvironmentVariable("ConnectionStrings__Stock", postgres.GetConnectionString());
        Environment.SetEnvironmentVariable("JWT_SECRET", Convert.ToHexString(RandomNumberGenerator.GetBytes(32)));
        Environment.SetEnvironmentVariable("ADMIN_PASSWORD", firstPass);
        factory = new WebApplicationFactory<Program>();
    }
    public async Task DisposeAsync()
    {
        await factory.DisposeAsync();
        await postgres.DisposeAsync();
    }
    static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }
    [Fact]
    public async Task LoginReceiptReservationSaleAndReturnUseSameLedger()
    {
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/products")).StatusCode);
        async Task Login(string pass)
        {
            var login = await Json(
                await client.PostAsJsonAsync("/api/auth/login", new { username = "admin", password = pass }));
            client.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", login.GetProperty("token").GetString());
        }
        await Login(firstPass);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/products")).StatusCode);
        var pass = Convert.ToHexString(RandomNumberGenerator.GetBytes(24));
        (await client.PostAsJsonAsync("/api/auth/change-password",
                                      new { currentPassword = firstPass, newPassword = pass }))
            .EnsureSuccessStatusCode();
        await Login(pass);
        var product = await Json(await client.PostAsJsonAsync(
            "/api/products", new { name = "Test box", sku = "TEST-1", selling_price = 3.15m }));
        int pid = product.GetProperty("id").GetInt32();
        await Json(await client.PostAsJsonAsync("/api/stock-ins",
                                                new { items = new[] { new { product_id = pid, quantity = 6 } } }));
        var sale = new { customer_type = "Cash", confirm = true,
                         items = new[] { new { product_id = pid, quantity = 5 } } };
        var responses = await Task.WhenAll(client.PostAsJsonAsync("/api/orders", sale),
                                           client.PostAsJsonAsync("/api/orders", sale));
        var win = await Json(Assert.Single(responses.Where(r => r.IsSuccessStatusCode)));
        Assert.Equal(HttpStatusCode.UnprocessableEntity,
                     Assert.Single(responses.Where(r => !r.IsSuccessStatusCode)).StatusCode);
        int id = win.GetProperty("id").GetInt32();
        var order = await Json(await client.GetAsync($"/api/orders/{id}"));
        var line = order.GetProperty("items") [0].GetProperty("id").GetInt32();
        var ret = await Json(await client.PostAsJsonAsync(
            "/api/returns",
            new { order_id = id, reason = "Unused",
                  items = new[] { new { order_item_id = line, quantity = 2, condition = "Good" } } }));
        await Json(await client.PostAsJsonAsync($"/api/returns/{ret.GetProperty("id")}/approve", new {}));
        Assert.Equal(
            3,
            (await Json(await client.GetAsync($"/api/products/{pid}"))).GetProperty("current_stock").GetInt32());
        Assert.True(
            (await Json(await client.GetAsync("/api/settings/integrity-check"))).GetProperty("ok").GetBoolean());
        foreach (var key in ReportCatalog.Types.Keys)
            (await client.GetAsync("/api/reports/" + key)).EnsureSuccessStatusCode();
        var pdf = await client.GetAsync("/api/reports/stock/pdf");
        pdf.EnsureSuccessStatusCode();
        Assert.Equal("application/pdf", pdf.Content.Headers.ContentType?.MediaType);
        (await client.PostAsJsonAsync("/api/auth/logout", new {})).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/products")).StatusCode);
    }
}
