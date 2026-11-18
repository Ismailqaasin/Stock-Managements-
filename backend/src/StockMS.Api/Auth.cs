using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using StockMS.Application;
using StockMS.Domain;
using StockMS.Infrastructure;
namespace StockMS.Api;
public sealed class Auth(StockDb db,StockService store,IConfiguration config,IWebHostEnvironment env) {
    readonly PasswordHasher<AdminUser> hasher=new();
    public static string Secret()=>Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
    static string Hash(string value)=>Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
    static object Safe(AdminUser a)=>new {id=a.Id,username=a.Username,full_name=a.FullName,must_change_password=a.MustChangePassword};
    public bool Valid(AdminUser a,string value)=>hasher.VerifyHashedPassword(a,a.PasswordHash,value)!=PasswordVerificationResult.Failed;
    public async Task Seed(){if(await db.Admins.AnyAsync())return; var password=config["ADMIN_PASSWORD"];
        if(password is null || password.Length<12)throw new InvalidOperationException("Set a unique ADMIN_PASSWORD of at least 12 characters for first boot.");
        var a=new AdminUser{Id=1,Username=config["ADMIN_USERNAME"]??"admin",FullName="Administrator",PasswordHash="",MustChangePassword=true,CreatedAt=DateTime.UtcNow,UpdatedAt=DateTime.UtcNow,PasswordChangedAt=DateTime.UtcNow};a.PasswordHash=hasher.HashPassword(a,password);db.Add(a);await db.SaveChangesAsync();await store.Audit("Setup","Workspace initialized");}
    async Task<AdminUser> Lock()=>await db.Admins.FromSqlRaw("SELECT * FROM admin_users WHERE id=1 FOR UPDATE").SingleAsync();
    async Task<IResult> Issue(HttpContext h,AdminUser a,Guid sid,DateTime expires,RefreshToken? old=null,string? recovery=null){
        var value=Secret();var now=DateTime.UtcNow;var row=new RefreshToken{AdminId=1,SessionId=sid,ExpiresAt=expires,TokenHash=Hash(value),LastSeen=now,CreatedAt=now,CreatedIp=h.Connection.RemoteIpAddress?.ToString()};db.Add(row);await db.SaveChangesAsync();
        if(old!=null){old.RevokedAt=now;old.ReplacedById=row.Id;await db.SaveChangesAsync();}
        h.Response.Cookies.Append("stockroom_refresh",value,new CookieOptions{HttpOnly=true,Secure=!env.IsDevelopment()||h.Request.IsHttps,SameSite=SameSiteMode.Strict,Path="/api/auth",Expires=expires});
        var jwt=new JwtSecurityToken("stockroom","stockroom-web",[new Claim("sub","1"),new Claim("sid",sid.ToString())],now,now.AddMinutes(15),new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config["JWT_SECRET"]!)),SecurityAlgorithms.HmacSha256));
        return Results.Ok(new{token=new JwtSecurityTokenHandler().WriteToken(jwt),admin=Safe(a),recovery_key=recovery});
    }
    public async Task<IResult> Login(HttpContext h,LoginRequest input){
        (await new LoginValidator().ValidateAsync(input)).ThrowIfInvalid();await using var tx=await db.Database.BeginTransactionAsync();var a=await Lock();var now=DateTime.UtcNow;
        if(a.LockedUntil>now)return Results.Problem(statusCode:429,title:"Account temporarily locked. Try again in 15 minutes.");
        if(a.LockedUntil!=null){a.FailedLoginCount=0;a.LockedUntil=null;}
        if(!Valid(a,input.Password)||a.Username!=input.Username){if(++a.FailedLoginCount>=5)a.LockedUntil=now.AddMinutes(15);await db.SaveChangesAsync();await store.Audit("LoginFailed","Sign-in attempt rejected",h.Connection.RemoteIpAddress?.ToString());await tx.CommitAsync();return Denied();}
        a.LastLoginAt=now;a.FailedLoginCount=0;a.LockedUntil=null;string? key=null;if(a.RecoveryKeyHash==null){key=Secret();a.RecoveryKeyHash=hasher.HashPassword(a,key);}await store.Audit("Login","Administrator signed in",h.Connection.RemoteIpAddress?.ToString());var result=await Issue(h,a,Guid.NewGuid(),now.AddHours(12),recovery:key);await tx.CommitAsync();return result;
    }
    public static IResult Denied()=>Results.Problem(statusCode:401,title:"Invalid credentials or expired session.");
    public async Task<IResult> Refresh(HttpContext h){var raw=h.Request.Cookies["stockroom_refresh"];if(raw==null)return Denied();await using var tx=await db.Database.BeginTransactionAsync();var a=await Lock();var hash=Hash(raw);var row=await db.Tokens.SingleOrDefaultAsync(t=>t.TokenHash==hash);if(row==null)return Denied();
        var idle=(await store.Settings()).GetProperty("session_timeout_minutes").GetInt32();if(row.RevokedAt!=null||row.ExpiresAt<=DateTime.UtcNow||row.LastSeen<DateTime.UtcNow.AddMinutes(-idle)){await Revoke(row.SessionId);await tx.CommitAsync();return Denied();}
        var result=await Issue(h,a,row.SessionId,row.ExpiresAt,row);await tx.CommitAsync();return result;}
    Task Revoke(Guid? session=null)=>db.Tokens.Where(t=>t.RevokedAt==null&&(session==null||t.SessionId==session)).ExecuteUpdateAsync(u=>u.SetProperty(t=>t.RevokedAt,DateTime.UtcNow));
    public async Task<IResult> Logout(HttpContext h){await Revoke(Guid.Parse(h.User.FindFirstValue("sid")!));h.Response.Cookies.Delete("stockroom_refresh",new CookieOptions{Path="/api/auth"});await store.Audit("Logout","Administrator signed out");return Results.NoContent();}
    public async Task<IResult> Me()=>Results.Ok(Safe(await db.Admins.SingleAsync()));
    public async Task<IResult> Change(PasswordRequest r,bool recovery){(await new PasswordValidator().ValidateAsync(r)).ThrowIfInvalid();await using var tx=await db.Database.BeginTransactionAsync();var a=await Lock();
        if(recovery?(a.RecoveryKeyHash==null||hasher.VerifyHashedPassword(a,a.RecoveryKeyHash,r.RecoveryKey??"")==PasswordVerificationResult.Failed):!Valid(a,r.CurrentPassword??""))return Denied();
        if(Valid(a,r.NewPassword))return Results.Problem(statusCode:400,title:"Choose a different password.");a.PasswordHash=hasher.HashPassword(a,r.NewPassword);a.PasswordChangedAt=DateTime.UtcNow;a.MustChangePassword=false;a.LockedUntil=null;a.FailedLoginCount=0;if(recovery)a.RecoveryKeyHash=null;await Revoke();await db.SaveChangesAsync();await store.Audit("PasswordChanged","Administrator password changed; sessions revoked");await tx.CommitAsync();return Results.NoContent();}
    public async Task CliReset(string password){var a=await db.Admins.SingleAsync();a.PasswordHash=hasher.HashPassword(a,password);a.MustChangePassword=true;a.RecoveryKeyHash=null;a.LockedUntil=null;a.FailedLoginCount=0;a.PasswordChangedAt=DateTime.UtcNow;await using var tx=await db.Database.BeginTransactionAsync();await Revoke();await db.SaveChangesAsync();await store.Audit("Recovery","Server administrator reset credentials");await tx.CommitAsync();}
}
static class ValidationExtensions { public static void ThrowIfInvalid(this FluentValidation.Results.ValidationResult r){if(!r.IsValid)throw new FluentValidation.ValidationException(r.Errors);} }
