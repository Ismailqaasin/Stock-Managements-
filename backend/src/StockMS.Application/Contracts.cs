using System.Text.Json;
using FluentValidation;
namespace StockMS.Application;
public record LoginRequest(string Username, string Password);
public record PasswordRequest(string? CurrentPassword, string NewPassword, string? RecoveryKey);
public record RestoreRequest(string Password, string Confirmation);
public sealed class LoginValidator : AbstractValidator<LoginRequest>
{
    public LoginValidator()
    {
        RuleFor(x => x.Username).NotEmpty().MaximumLength(50);
        RuleFor(x => x.Password).NotEmpty().MaximumLength(256);
    }
}
public sealed class PasswordValidator : AbstractValidator<PasswordRequest>
{
    public PasswordValidator()
    {
        RuleFor(x => x.NewPassword).NotEmpty().MinimumLength(12).MaximumLength(256);
    }
}
public interface IStockService
{
    Task<JsonElement> Command(string resource, string operation, int? id, JsonElement body, string? ip,
                              string? agent, CancellationToken ct);
    Task<JsonElement> List(string resource, IReadOnlyDictionary<string, string> filters, CancellationToken ct);
    Task<JsonElement> Detail(string resource, int id, CancellationToken ct);
}
