using System.Text;
using System.Text.Json;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Npgsql;
using QuestPDF.Infrastructure;
using Serilog;
using StockMS.Api;
using StockMS.Application;
using StockMS.Domain;
using StockMS.Infrastructure;

var b=WebApplication.CreateBuilder(args);
var connection=b.Configuration.GetConnectionString("Stock")??throw new InvalidOperationException("Set ConnectionStrings__Stock.");
var secret=b.Configuration["JWT_SECRET"];if(secret==null||Encoding.UTF8.GetByteCount(secret)<32)throw new InvalidOperationException("Set a random JWT_SECRET of at least 32 bytes.");
var files=Path.GetFullPath(b.Configuration["STORAGE_DIR"]??".local/storage");var uploads=Path.Combine(files,"uploads");Directory.CreateDirectory(uploads);
b.Host.UseSerilog((ctx,log)=>log.WriteTo.Console()); b.Services.AddDbContext<StockDb>(o=>o.UseNpgsql(connection));b.Services.AddScoped<StockService>();b.Services.AddScoped<IStockService>(s=>s.GetRequiredService<StockService>());b.Services.AddScoped<Auth>();
b.Services.AddScoped(s=>new BackupService(s.GetRequiredService<StockDb>(),s.GetRequiredService<StockService>(),Path.Combine(files,"backups"),connection));
b.Services.AddEndpointsApiExplorer();b.Services.AddSwaggerGen();b.Services.AddProblemDetails();
b.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o=>{
    o.MapInboundClaims=false;o.TokenValidationParameters=new(){ValidateIssuer=true,ValidIssuer="stockroom",ValidateAudience=true,ValidAudience="stockroom-web",ValidateLifetime=true,ValidateIssuerSigningKey=true,IssuerSigningKey=new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret)),ClockSkew=TimeSpan.FromSeconds(15),ValidAlgorithms=[SecurityAlgorithms.HmacSha256]};
    o.Events=new(){OnTokenValidated=async ctx=>{var db=ctx.HttpContext.RequestServices.GetRequiredService<StockDb>();if(!Guid.TryParse(ctx.Principal?.FindFirst("sid")?.Value,out var sid)||await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE refresh_tokens SET last_seen=now() WHERE session_id={sid} AND revoked_at IS NULL AND expires_at>now() AND last_seen>now()-(SELECT session_timeout_minutes FROM system_settings)*interval '1 minute'")==0)ctx.Fail("Expired session");}};
});b.Services.AddAuthorization();b.Services.AddRateLimiter(o=>{o.RejectionStatusCode=429;o.AddPolicy("sign-in",h=>RateLimitPartition.GetFixedWindowLimiter(h.Connection.RemoteIpAddress?.ToString()??"local",_=>new(){PermitLimit=20,Window=TimeSpan.FromMinutes(5),QueueLimit=0}));});
QuestPDF.Settings.License=LicenseType.Community;
var app=b.Build();
using(var scope=app.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<StockDb>();await db.Database.MigrateAsync();var auth=scope.ServiceProvider.GetRequiredService<Auth>();await auth.Seed();if(args.Contains("reset-admin")){Console.Error.WriteLine("Supply the new password via stdin (at least 12 characters):");var pwd=Console.ReadLine();if(pwd==null||pwd.Length<12)throw new ArgumentException("Password too short");await auth.CliReset(pwd);Console.WriteLine("Password reset. Existing sessions revoked.");return;}}
app.Use(async(h,next)=>{
    h.Response.Headers.CacheControl="no-store";h.Response.Headers["X-Content-Type-Options"]="nosniff";
    try{await next();}catch(Exception ex) when(!h.Response.HasStarted){
        var (code,title)=ex switch{PostgresException{SqlState:"P0002"}=>(404,"Record not found."),PostgresException{SqlState:"23505"}=>(409,"A record with these details already exists."),PostgresException{SqlState:"40001"}=>(409,"Record changed. Reload and try again."),PostgresException{SqlState:"P0001"} pg=>(422,pg.MessageText),PostgresException pg when pg.SqlState.StartsWith("22")||pg.SqlState.StartsWith("23")=>(422,"Check the required fields, quantities and prices."),FluentValidation.ValidationException=>(422,"Check the form fields."),BadHttpRequestException e=>(e.StatusCode,"Invalid request."),InvalidOperationException=>(409,"Operation could not be completed. Check the record and server logs."),_=>(500,"Unexpected server error.")};
        if(code>=500||ex is InvalidOperationException)Log.Error(ex,"Operation failed at {Path}",h.Request.Path);if(h.Request.Headers.AcceptLanguage.ToString().StartsWith("so"))title=code switch{404=>"Xogta lama helin.",409=>"Xogtu way is beddeshay ama way jirtaa.",422=>"Hubi xogta iyo tirada aad gelisay.",_=>"Hawshu ma dhammaan."};
        if(ex is FluentValidation.ValidationException val)await Results.ValidationProblem(val.Errors.GroupBy(x=>x.PropertyName).ToDictionary(x=>x.Key,x=>x.Select(y=>y.ErrorMessage).ToArray()),statusCode:code,title:title).ExecuteAsync(h);else await Results.Problem(statusCode:code,title:title).ExecuteAsync(h);
    }});
// One API instance / one admin: a maintenance barrier prevents writes during snapshot restoration.
var gate=new SemaphoreSlim(1,1);app.Use(async(h,next)=>{await gate.WaitAsync(h.RequestAborted);try{await next();}finally{gate.Release();}});
app.UseRateLimiter();app.UseAuthentication();app.UseAuthorization();
if(app.Environment.IsDevelopment()){app.UseSwagger();app.UseSwaggerUI();}
app.MapGet("/api/auth/config",()=>new{preview=false,auto_start=false});
var authRoutes=app.MapGroup("/api/auth");authRoutes.MapPost("/login",(Auth a,HttpContext h,LoginRequest r)=>a.Login(h,r)).RequireRateLimiting("sign-in");authRoutes.MapPost("/refresh",(Auth a,HttpContext h)=>a.Refresh(h));authRoutes.MapPost("/reset-password",(Auth a,PasswordRequest p)=>a.Change(p,true)).RequireRateLimiting("sign-in");authRoutes.MapGet("/me",(Auth a)=>a.Me()).RequireAuthorization();authRoutes.MapPost("/logout",(Auth a,HttpContext h)=>a.Logout(h)).RequireAuthorization();authRoutes.MapPost("/change-password",(Auth a,PasswordRequest p)=>a.Change(p,false)).RequireAuthorization();
var api=app.MapGroup("/api").RequireAuthorization();api.AddEndpointFilter(async(ctx,next)=>await ctx.HttpContext.RequestServices.GetRequiredService<StockDb>().Admins.AnyAsync(a=>a.MustChangePassword)?Results.Problem(statusCode:403,title:"Change the initial password before continuing."):await next(ctx));
api.MapGet("/dashboard/summary",(StockService s,CancellationToken ct)=>s.Dashboard(ct));
api.MapGet("/dashboard/recent-activities",(StockService s,CancellationToken ct)=>s.List("audit-logs",new Dictionary<string,string>{{"pageSize","5"}},ct));
api.MapGet("/dashboard/recent-movements",(StockService s,CancellationToken ct)=>s.List("stock-movements",new Dictionary<string,string>{{"pageSize","5"}},ct));
api.MapGet("/settings",(StockService s,CancellationToken ct)=>s.Settings(ct));api.MapGet("/settings/integrity-check",(StockService s,CancellationToken ct)=>s.Integrity(ct));
static Dictionary<string,string> Filters(HttpContext h)=>h.Request.Query.ToDictionary(x=>x.Key,x=>x.Value.ToString());
static Task<JsonElement> Cmd(StockService s,HttpContext h,string res,string op,int? id,JsonElement body)=>s.Command(res,op,id,body,h.Connection.RemoteIpAddress?.ToString(),h.Request.Headers.UserAgent,h.RequestAborted);
string[] resources=["products","categories","customers","stock-ins","stock-outs","orders","returns","stock-adjustments","stock-movements","dispatches","audit-logs","backups"];
foreach(var res in resources){api.MapGet("/"+res,(StockService s,HttpContext h)=>s.List(res,Filters(h),h.RequestAborted)).WithName("List_"+res);api.MapGet("/"+res+"/{id:int}",(StockService s,int id,CancellationToken ct)=>s.Detail(res,id,ct));
    if(res is not ("stock-movements" or "dispatches" or "audit-logs" or "backups"))api.MapPost("/"+res,(StockService s,HttpContext h,JsonElement body)=>Cmd(s,h,res,"create",null,body));
    if(res is "products" or "categories" or "customers" or "orders")api.MapPut("/"+res+"/{id:int}",(StockService s,HttpContext h,int id,JsonElement body)=>Cmd(s,h,res,"update",id,body));
    if(res is "products" or "categories" or "customers")api.MapPatch("/"+res+"/{id:int}/status",(StockService s,HttpContext h,int id,JsonElement body)=>Cmd(s,h,res,"status",id,body));
    string[] actions=res switch{"stock-ins" or "stock-outs"=>["reverse"],"orders"=>["confirm","deliver","cancel"],"returns"=>["approve","reject"],_=>[]};foreach(var action in actions)api.MapPost("/"+res+"/{id:int}/"+action,(StockService s,HttpContext h,int id,JsonElement body)=>Cmd(s,h,res,action,id,body));
}
api.MapGet("/products/{id:int}/movements",(StockService s,HttpContext h,int id)=>{var f=Filters(h);f["product_id"]=id.ToString();return s.List("stock-movements",f,h.RequestAborted);});
api.MapGet("/customers/{id:int}/history",async(StockService s,HttpContext h,int id)=>{var f=Filters(h);f["customer_id"]=id.ToString();return new{orders=await s.List("orders",f,h.RequestAborted),returns=await s.List("returns",f,h.RequestAborted),dispatches=await s.List("dispatches",f,h.RequestAborted)};});
api.MapPut("/settings",(StockService s,HttpContext h,JsonElement body)=>Cmd(s,h,"settings","update",1,body));
api.MapGet("/reports/{type}",(StockService s,HttpContext h,string type)=>ReportCatalog.Types.TryGetValue(type,out var res)?s.List(res,Filters(h),h.RequestAborted):throw new BadHttpRequestException("Unknown report",404));
async Task<IResult> Pdf(StockService s,HttpContext h,string res,int? id){var f=Filters(h);var rows=new List<JsonElement>();if(id.HasValue)rows.Add(await s.Detail(res,id.Value,h.RequestAborted));else{f["pageSize"]="100";for(int page=1;;page++){f["page"]=page.ToString();var r=await s.List(res,f,h.RequestAborted);rows.AddRange(r.GetProperty("items").EnumerateArray());if(page>=r.GetProperty("totalPages").GetInt32())break;}}var bytes=ReportPdf.Render(res,await s.Settings(),rows,h.Request.Headers.AcceptLanguage.ToString().StartsWith("so"),string.Join(" · ",f.Where(x=>x.Key is not("page" or "pageSize")).Select(x=>$"{x.Key}: {x.Value}")),uploads);return Results.File(bytes,"application/pdf");}
api.MapGet("/reports/{type}/pdf",(StockService s,HttpContext h,string type)=>Pdf(s,h,ReportCatalog.Types.GetValueOrDefault(type)??throw new BadHttpRequestException("Unknown report",404),null));
api.MapGet("/audit-logs/pdf",(StockService s,HttpContext h)=>Pdf(s,h,"audit-logs",null));api.MapGet("/{resource}/{id:int}/pdf",(StockService s,HttpContext h,string resource,int id)=>resources.Contains(resource)?Pdf(s,h,resource,id):throw new BadHttpRequestException("Unknown document",404));
async Task<IResult> Upload(HttpContext h,StockService s,int? id){if(!h.Request.HasFormContentType||h.Request.ContentLength>2_200_000)return Results.Problem(statusCode:413,title:"Image must be under 2 MB.");var form=await h.Request.ReadFormAsync();var f=form.Files.GetFile("file");if(f==null||f.Length<12||f.Length>2*1024*1024)return Results.BadRequest();using var mem=new MemoryStream();await f.CopyToAsync(mem);var bytes=mem.ToArray();string? ext=ImageFormat.Extension(bytes);if(ext==null)return Results.Problem(statusCode:415,title:"Choose a PNG, JPEG or WebP image.");var name=Guid.NewGuid().ToString("N")+ext;var path=Path.Combine(uploads,name);await File.WriteAllBytesAsync(path,bytes);try{return Results.Ok(await Cmd(s,h,id.HasValue?"products":"settings",id.HasValue?"image":"logo",id??1,JsonSerializer.SerializeToElement(new{path="/api/files/"+name})));}catch{File.Delete(path);throw;}}
api.MapPost("/products/{id:int}/image",(HttpContext h,StockService s,int id)=>Upload(h,s,id));api.MapPost("/settings/logo",(HttpContext h,StockService s)=>Upload(h,s,null));
api.MapGet("/files/{name}",(string name)=>{if(!System.Text.RegularExpressions.Regex.IsMatch(name,@"^[a-f0-9]{32}\.(png|jpg|webp)$"))return Results.NotFound();var p=Path.Combine(uploads,name);return File.Exists(p)?Results.File(p,"image/"+(name.EndsWith("jpg")?"jpeg":Path.GetExtension(name)[1..])):Results.NotFound();});
api.MapPost("/backups",(BackupService bs,CancellationToken ct)=>bs.Create(ct));api.MapPost("/backups/{id:int}/verify",async(BackupService bs,int id,CancellationToken ct)=>{await bs.Verify(id,ct);return new{ok=true};});api.MapGet("/backups/{id:int}/download",async(BackupService bs,int id,CancellationToken ct)=>{var p=await bs.Verify(id,ct);return Results.File(p,"application/octet-stream",Path.GetFileName(p));});
api.MapPost("/backups/{id:int}/restore",async(BackupService bs,StockDb db,Auth a,int id,RestoreRequest r,CancellationToken ct)=>{if(r.Confirmation!="RESTORE"||!a.Valid(await db.Admins.SingleAsync(),r.Password))return Results.Problem(title:"Password and typed RESTORE confirmation required.",statusCode:403);await bs.Restore(id,ct);return Results.Ok(new{ok=true});});
app.Run();
public partial class Program { }
