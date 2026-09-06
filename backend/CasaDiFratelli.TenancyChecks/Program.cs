using CasaDiFratelli.Api.Services.Tenancy;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using CasaDiFratelli.Api.Controllers;

// Pure configuration and middleware checks: no application startup, network,
// database connections, migrations, credentials or hosted services are used.
static void Check(bool condition, string scenario)
{
    if (!condition) throw new Exception(scenario);
    Console.WriteLine($"PASS {scenario}");
}

Check(!typeof(ReservationsController).GetMethods()
        .Any(method => method.Name == "OnActionExecutionAsync"),
    "Controller filter implementation is not exposed as an MVC action");

static TenantDefinition Tenant(string id) => new()
{
    Id = id, Slug = id, Domain = $"{id}.example.test",
    FrontendUrl = $"https://{id}.example.test",
    FrontendOrigins = new() { $"https://{id}.example.test" },
    ConnectionStringKey = id, AdminPasswordConfigurationKey = $"{id}_PASSWORD"
};

static TenantResolutionOptions Tenants(bool strict = true)
{
    var first = Tenant("alpha");
    return new() { RequireKnownTenant = strict, DefaultTenant = first, Tenants = new() { first, Tenant("beta") } };
}

static async Task<(int Status, string TenantId)> Request(TenantResolutionOptions options, string host, string? header = null, string? origin = null)
{
    var context = new DefaultHttpContext();
    context.Request.Host = new HostString(host);
    context.Response.Body = new MemoryStream();
    if (header != null) context.Request.Headers["X-Tenant-Id"] = header;
    if (origin != null) context.Request.Headers.Origin = origin;
    var tenant = new CurrentTenant();
    var middleware = new TenantResolutionMiddleware(_ => Task.CompletedTask, Options.Create(options));
    await middleware.InvokeAsync(context, tenant);
    return (context.Response.StatusCode, tenant.TenantId);
}

var options = Tenants();
Check((await Request(options, "alpha.attacker.test")).Status == 404, "Unconfigured host suffix cannot select a tenant");
Check((await Request(options, "alpha.example.test")).TenantId == "alpha", "Exact configured host resolves");
Check((await Request(options, "alpha.example.test", "beta")).Status == 404, "Header cannot override another configured tenant host");
Check((await Request(options, "shared-api.example.test", "beta", "https://alpha.example.test")).Status == 404, "Known frontend origin cannot route to another tenant");
options.Tenants[0].FrontendOrigins.Clear();
Check((await Request(options, "shared-api.example.test", "beta", "https://alpha.example.test")).Status == 404, "Implicit HTTPS domain origin also enforces tenant consistency");
Check((await Request(options, "shared-api.example.test", "beta")).TenantId == "beta", "Shared backend accepts explicit tenant selector");
Check((await Request(Tenants(false), "shared-api.example.test")).TenantId == "alpha", "Existing non-strict default routing is preserved");

var validator = new TenantOptionsValidator();
Check(validator.Validate(null, Tenants()).Succeeded, "Distinct tenant configuration is valid");
options = Tenants();
options.Tenants[1].Domain = options.Tenants[0].Domain;
Check(validator.Validate(null, options).Failed, "Duplicate domains are rejected");
options = Tenants();
options.Tenants[1].Slug = options.Tenants[0].Id;
Check(validator.Validate(null, options).Failed, "Cross-field ID and slug collision is rejected");
options = Tenants();
options.Tenants[1].Domain = "alpha.example.test";
options.Tenants[0].Domain = "other.example.test";
Check(validator.Validate(null, options).Failed, "Domain and another tenant frontend origin collision is rejected");
options = Tenants();
options.Tenants[1].Id = "a/lpha";
Check(validator.Validate(null, options).Failed, "Backup-path lossy tenant IDs are rejected");

var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
{
    ["ConnectionStrings:alpha"] = "Host=localhost;Database=shared;Username=first",
    ["ConnectionStrings:beta"] = "Host=LOCALHOST;Database=shared;Username=second"
}).Build();
var current = new CurrentTenant();
var resolver = new TenantDatabaseConnectionResolver(config, current, Options.Create(Tenants()));
try { resolver.Resolve(); throw new Exception("Unresolved database access was accepted"); }
catch (InvalidOperationException) { Console.WriteLine("PASS Unresolved database access fails closed"); }
try { resolver.ValidateDedicatedDatabaseTargets(); throw new Exception("Duplicate database was accepted"); }
catch (InvalidOperationException) { Console.WriteLine("PASS Different connection keys and users cannot share one database"); }
config["ConnectionStrings:beta"] = "Host=localhost;Database=separate;Username=second";
resolver.ValidateDedicatedDatabaseTargets();
Console.WriteLine("PASS Distinct databases are accepted without connecting");
current.Resolve(Tenant("alpha"));
try { current.Resolve(Tenant("beta")); throw new Exception("Tenant changed inside one scope"); }
catch (InvalidOperationException) { Console.WriteLine("PASS A resolved dependency-injection scope cannot change tenants"); }
