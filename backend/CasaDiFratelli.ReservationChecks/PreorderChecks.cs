using System.Text.Json;
using System.Reflection;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using SeatMap.Api.Controllers;
using SeatMap.Api.Filters;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using SeatMap.Api.Data;
using SeatMap.Api.Models;
using SeatMap.Api.Services;
using SeatMap.Api.Services.FloorPlans;
using SeatMap.Api.Services.Preorders;
using SeatMap.Api.Services.Reservations;
using SeatMap.Api.Services.Tenancy;

internal static class PreorderChecks
{
    private sealed class Clock : TimeProvider {
        public DateTimeOffset Now = new(2026,11,19,9,0,0,TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => Now;
    }
    public static async Task RunAsync()
    {
        int count=0;
        void Check(bool ok,string message) { count++; if (!ok) throw new Exception(message); }
        async Task Reject(Func<Task> action,int status,string code) {
            try { await action(); throw new Exception("Expected rejection: "+code); }
            catch (PreorderException error) { Check(error.Status==status && error.Code==code, "Wrong rejection: "+error.Code); }
        }
        await using var connection = new SqliteConnection("Data Source=:memory:"); await connection.OpenAsync();
        var postgres = Environment.GetEnvironmentVariable("PREORDER_CHECKS_POSTGRES");
        var optionsBuilder = new DbContextOptionsBuilder<AppDbContext>();
        if (postgres == null) optionsBuilder.UseSqlite(connection); else optionsBuilder.UseNpgsql(postgres);
        await using var db = new AppDbContext(optionsBuilder.Options);
        await db.Database.EnsureCreatedAsync();
        var tenant = new CurrentTenant(); tenant.Resolve(new TenantDefinition { Id="cofein", Slug="cofein",Name="Cofein", NotificationsEnabled=false });
        var clock = new Clock();
        var brand = new TenantBrandingService(db,tenant,new ConfigurationBuilder().Build(),NullLogger<TenantBrandingService>.Instance);
        var plans = new FloorPlanService(db,tenant);
        await plans.SaveAsync(new FloorPlan {Revision=(await plans.GetAsync()).Revision,Zones=[new("room","Room")],Tables=[new("1","room",50,50,4,false,false,true)]});
        var zones = new SeasonalZoneService(db,plans);
        var policy = new PreorderPolicyService(db,clock);
        var service = new GuestPreorderService(db,policy,brand,clock,new RestaurantClosureService(db,tenant),zones);
        var key=GuestReservationService.CreateToken();
        var booking=new Reservation {GuestName="Preorder check",Phone="+3595550199",Email="preorder@example.test",GuestCount=2,Area="room",ReservedDate=new(2026,11,20),ReservedTime="19:00",Status="Approved",GuestManagementTokenHash=GuestReservationService.HashToken(key)};
        db.Reservations.Add(booking);
        db.MenuItems.AddRange(new MenuItem {Id=1,NameBg="Салата",NameEn="Salad",NameRu="Салат",Price=12.34m,IsActive=true},new MenuItem {Id=2,NameBg="Кафе",NameEn="Coffee",Price=2.50m,Department="Bar",IsActive=true});
        await db.SaveChangesAsync();
        var request=new PreorderDraftRequest {IdempotencyKey=Guid.NewGuid(),Language="en",Items=[new(1,2),new(2,1)],ServeOffsetMinutes=30};
        await Reject(()=>service.QuoteAsync(booking.Id,null,request),404,"RESERVATION_NOT_FOUND");
        await Reject(()=>service.QuoteAsync(booking.Id,key,request),403,"PREORDERS_DISABLED");
        var developer=new AdminPrincipal(1,"Developer","dev@example.test",AdminRoleAccess.Developer);
        var owner=new AdminPrincipal(2,"Owner","owner@example.test",AdminRoleAccess.Owner);
        Check(!JsonSerializer.SerializeToElement(await policy.PublicAsync()).GetProperty("enabled").GetBoolean(),
            "Preorders must remain off until the developer enables the restaurant");
        await policy.SetPlatformAsync(new(true,1250),developer);
        var publicSettings=JsonSerializer.SerializeToElement(await policy.PublicAsync());
        var adminSettings=JsonSerializer.SerializeToElement(await policy.AdminAsync());
        Check(publicSettings.GetProperty("enabled").GetBoolean() && publicSettings.GetProperty("activationMode").GetString()=="developer" &&
            adminSettings.GetProperty("enabled").GetBoolean() && adminSettings.GetProperty("activationMode").GetString()=="developer" &&
            !adminSettings.GetProperty("consentNeedsRenewal").GetBoolean(),
            "Developer activation must immediately enable public and admin settings without owner confirmation");
        Check(!await db.AppSettings.AnyAsync(x=>x.Key=="preorders:consent:v1"),
            "Developer activation must not fabricate a legacy owner consent record");
        var auditCountBeforeLegacyWrite=await db.AuditLogs.CountAsync(x=>x.Action=="preorder-policy");
        foreach (var obsoleteRequest in new[] { new PreorderConsentRequest(true,false), new(true,true,1250,PreorderPolicyService.CurrentTermsVersion), new(false,false) })
            await Reject(()=>policy.SetConsentAsync(obsoleteRequest,owner),410,"PREORDER_MANAGED_BY_PLATFORM");
        Check(!await db.AppSettings.AnyAsync(x=>x.Key=="preorders:consent:v1") &&
            await db.AuditLogs.CountAsync(x=>x.Action=="preorder-policy")==auditCountBeforeLegacyWrite,
            "Obsolete owner requests must neither create consent nor append successful policy audits");
        var quote=await service.QuoteAsync(booking.Id,key,request);
        Check(quote.TotalMinor==2718 && quote.Currency=="EUR" && quote.Items[0].UnitMinor==1234,"Server prices must determine the entire EUR amount");
        Check(quote.Items[1].Kind=="Drink" && quote.ServeAtUtc==new DateTime(2026,11,20,17,30,0,DateTimeKind.Utc),"Menu department and restaurant timezone must determine serving details");
        var draft=await service.CreateDraftAsync(booking.Id,key,request);
        var retry=await service.CreateDraftAsync(booking.Id,key,request);
        Check(draft.Id==retry.Id && await db.ReservationPreorders.CountAsync()==1,"Retried draft requests must not duplicate carts");
        var stored=await db.ReservationPreorders.SingleAsync();
        Check(stored.CommissionMinor==340 && stored.RestaurantNetMinor==2378 && stored.CommissionBasisPoints==1250,"Commission must round in minor units and preserve the net amount");
        Check(draft.Status=="Draft" && !draft.CardPaymentsAvailable && !await db.DiningOrders.AnyAsync() && !await db.PreorderPayments.AnyAsync(),"Unpaid carts must not become orders or money");
        await Reject(()=>service.CheckoutAsync(booking.Id,draft.Id,key),503,"CARD_PAYMENTS_NOT_CONNECTED");
        Check(!await db.PreorderPayments.AnyAsync() && !await db.DiningOrders.AnyAsync(),"Unconfigured checkout must have no financial or kitchen side effects");
        request.Notes="changed"; await Reject(()=>service.CreateDraftAsync(booking.Id,key,request),409,"PREORDER_REQUEST_CONFLICT");request.Notes="";
        var edit = new PreorderDraftRequest { IdempotencyKey=Guid.NewGuid(), ExpectedRevision=draft.Revision, Language="en", Items=[new(1,1),new(2,2)], Notes="Salad: no bacon", ServeOffsetMinutes=45 };
        await Reject(()=>service.UpdateDraftAsync(booking.Id,draft.Id,null,edit),404,"RESERVATION_NOT_FOUND");
        await Reject(()=>service.UpdateDraftAsync(booking.Id,Guid.NewGuid(),key,edit),404,"RESERVATION_NOT_FOUND");
        var edited = await service.UpdateDraftAsync(booking.Id,draft.Id,key,edit);
        Check(edited.Id==draft.Id && edited.TotalMinor==1734 && edited.Notes=="Salad: no bacon" && await db.ReservationPreorders.CountAsync()==1,"Editing must update the same cart with server prices and notes");
        Check((await service.UpdateDraftAsync(booking.Id,draft.Id,key,edit)).Revision==edited.Revision,"Edit retries must be idempotent");
        edit.IdempotencyKey=Guid.NewGuid(); edit.Notes="stale";
        await Reject(()=>service.UpdateDraftAsync(booking.Id,draft.Id,key,edit),409,"PREORDER_CHANGED");
        edit.ExpectedRevision=edited.Revision;
        stored.Status="Paid"; await db.SaveChangesAsync();
        await Reject(()=>service.UpdateDraftAsync(booking.Id,draft.Id,key,edit),409,"PREORDER_NOT_EDITABLE");
        stored.Status="Draft"; await db.SaveChangesAsync();
        var bad=new PreorderDraftRequest {Items=[new(1,1),new(1,2)]};await Reject(()=>service.QuoteAsync(booking.Id,key,bad),400,"PREORDER_ITEMS_INVALID");
        bad.Items=[new(1,0)];await Reject(()=>service.QuoteAsync(booking.Id,key,bad),400,"PREORDER_ITEMS_INVALID");
        bad.Items=[new(999,1)];await Reject(()=>service.QuoteAsync(booking.Id,key,bad),409,"PREORDER_MENU_CHANGED");
        request.ServeOffsetMinutes=17;await Reject(()=>service.QuoteAsync(booking.Id,key,request),400,"PREORDER_TIME_INVALID");request.ServeOffsetMinutes=30;
        await zones.SetClosedAsync("room",true);await Reject(()=>service.QuoteAsync(booking.Id,key,request),409,"PREORDER_RESTAURANT_CLOSED");await zones.SetClosedAsync("room",false);
        var menu=await db.MenuItems.FindAsync(1);menu!.IsActive=false;await db.SaveChangesAsync();await Reject(()=>service.QuoteAsync(booking.Id,key,request),409,"PREORDER_MENU_CHANGED");menu.IsActive=true;await db.SaveChangesAsync();
        booking.Status="AwaitingEmailConfirmation";await db.SaveChangesAsync();
        Check(!(await service.QuoteAsync(booking.Id,key,request)).BookingConfirmed,"Pending booking may preview but cannot submit a preorder");
        request.IdempotencyKey=Guid.NewGuid();await Reject(()=>service.CreateDraftAsync(booking.Id,key,request),409,"PREORDER_BOOKING_UNCONFIRMED");booking.Status="Approved";await db.SaveChangesAsync();
        // Historical records can exist after upgrading. They are retained exactly,
        // but are no longer an activation gate or an editable owner setting.
        var historicalConsent=new PreorderConsent(true,clock.Now.UtcDateTime,owner.Id,PreorderPolicyService.CurrentTermsVersion,1250);
        var consentSetting=new AppSetting { Key="preorders:consent:v1", Value=JsonSerializer.Serialize(historicalConsent,new JsonSerializerOptions(JsonSerializerDefaults.Web)) };
        db.AppSettings.Add(consentSetting);await db.SaveChangesAsync();
        var historicalJson=consentSetting.Value;
        await policy.SetPlatformAsync(new(true,1500),developer);
        Check((await service.QuoteAsync(booking.Id,key,request)).TotalMinor==2718 &&
            JsonSerializer.SerializeToElement(await policy.PublicAsync()).GetProperty("enabled").GetBoolean() &&
            !JsonSerializer.SerializeToElement(await policy.AdminAsync()).GetProperty("consentNeedsRenewal").GetBoolean(),
            "Changing the platform fee must keep preorders enabled without renewed owner acceptance");
        Check((await policy.ConsentAsync())==historicalConsent && consentSetting.Value==historicalJson,
            "Developer fee changes must preserve historical owner consent exactly");
        var newDraft=await service.CreateDraftAsync(booking.Id,key,request);
        var newStored=await db.ReservationPreorders.SingleAsync(x=>x.Id==newDraft.Id);
        Check(newStored.CommissionBasisPoints==1500 && newStored.CommissionMinor==408 && newStored.RestaurantNetMinor==2310 &&
            (await db.ReservationPreorders.SingleAsync(x=>x.Id==draft.Id)).CommissionBasisPoints==1250,
            "New drafts must use the current fee while previous drafts keep their financial snapshot");
        foreach (var legacyConsent in new[] { historicalConsent with { Version="preorders-v0" }, historicalConsent with { Version=null }, new PreorderConsent() })
        {
            consentSetting.Value=JsonSerializer.Serialize(legacyConsent,new JsonSerializerOptions(JsonSerializerDefaults.Web));
            await db.SaveChangesAsync();
            Check(JsonSerializer.SerializeToElement(await policy.PublicAsync()).GetProperty("enabled").GetBoolean() &&
                !JsonSerializer.SerializeToElement(await policy.AdminAsync()).GetProperty("consentNeedsRenewal").GetBoolean() &&
                (await service.QuoteAsync(booking.Id,key,request)).TotalMinor==2718,
                "Outdated, missing or withdrawn legacy consent must not override developer activation");
        }
        consentSetting.Value=historicalJson;await db.SaveChangesAsync();
        var auditCountBeforeObsoleteUpdate=await db.AuditLogs.CountAsync(x=>x.Action=="preorder-policy");
        await Reject(()=>policy.SetConsentAsync(new(false,false),owner),410,"PREORDER_MANAGED_BY_PLATFORM");
        Check((await policy.ConsentAsync())==historicalConsent &&
            await db.AuditLogs.CountAsync(x=>x.Action=="preorder-policy")==auditCountBeforeObsoleteUpdate,
            "An obsolete withdrawal must not alter historical consent or audit a successful change");
        await policy.SetPlatformAsync(new(false,1250),developer);
        Check(!JsonSerializer.SerializeToElement(await policy.PublicAsync()).GetProperty("enabled").GetBoolean() &&
            !JsonSerializer.SerializeToElement(await policy.AdminAsync()).GetProperty("enabled").GetBoolean(),
            "Developer disabling must take effect even when historical consent matches the fee and terms");
        await Reject(()=>service.QuoteAsync(booking.Id,key,request),403,"PREORDERS_DISABLED");
        request.IdempotencyKey=Guid.NewGuid();await Reject(()=>service.CreateDraftAsync(booking.Id,key,request),403,"PREORDERS_DISABLED");
        await Reject(()=>service.CheckoutAsync(booking.Id,draft.Id,key),403,"PREORDERS_DISABLED");
        Check(await db.ReservationPreorders.CountAsync()==2 && !await db.PreorderPayments.AnyAsync() && !await db.DiningOrders.AnyAsync(),
            "Disabling preorders must prevent new drafts and preserve existing unpaid carts without fulfillment");
        await policy.SetPlatformAsync(new(true,1500),developer);
        var guests=new GuestReservationService(db,brand,clock);Check((await guests.CancelAsync(booking.Id,key)).Kind==ReservationBookingResultKind.Success,"Unpaid drafts must not block timely booking cancellation");
        await Reject(()=>service.QuoteAsync(booking.Id,key,request),409,"PREORDER_BOOKING_INACTIVE");
        await using var otherConnection=new SqliteConnection("Data Source=:memory:");await otherConnection.OpenAsync();
        await using var other=new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(otherConnection).Options);await other.Database.EnsureCreatedAsync();
        var otherPolicy=new PreorderPolicyService(other,clock);Check(!(await otherPolicy.PlatformAsync()).Enabled &&
            !JsonSerializer.SerializeToElement(await otherPolicy.PublicAsync()).GetProperty("enabled").GetBoolean() && !(await otherPolicy.ConsentAsync()).OptedIn,
            "Restaurant policy must stay isolated in each database");
        var policyAudits=await db.AuditLogs.Where(x=>x.Action=="preorder-policy").ToListAsync();
        Check(policyAudits.Count==4 && policyAudits.All(x=>x.EntityId=="preorders:platform:v1" && x.AdminUserId==developer.Id),
            "Every platform change must be audited under the developer, with no fabricated owner acceptance");
        db.AdminUsers.AddRange(new AdminUser { Id=1,Name="Developer",Email="dev@checks.test",Role=AdminRoleAccess.Developer },new AdminUser { Id=2,Name="Owner",Email="owner@checks.test",Role=AdminRoleAccess.Owner });
        db.AdminSessions.AddRange(new AdminSession {AdminUserId=1,TokenHash=AdminAuthService.HashToken("developer-check"),ExpiresAtUtc=DateTime.UtcNow.AddHours(1)},new AdminSession {AdminUserId=2,TokenHash=AdminAuthService.HashToken("owner-check"),ExpiresAtUtc=DateTime.UtcNow.AddHours(1)});
        await db.SaveChangesAsync();
        var options=Options.Create(new TenantResolutionOptions {DefaultTenant=new TenantDefinition {Id="cofein",Slug="cofein",Name="Cofein"}});
        var auth=new AdminAuthService(db,new ConfigurationBuilder().Build(),tenant,options);
        using var services=new ServiceCollection().AddSingleton(auth).BuildServiceProvider();
        async Task<int> Authorize(string method,string token) {
            var http=new DefaultHttpContext {RequestServices=services}; http.Request.Headers["X-Admin-Token"]=token;
            var action=new ActionContext(http,new RouteData(),new ActionDescriptor());
            var executing=new ActionExecutingContext(action,[],new Dictionary<string,object?>(),new object());
            var invoked=false;
            await typeof(PreorderAdministrationController).GetMethod(method)!.GetCustomAttribute<AdminAuthorizeAttribute>()!.OnActionExecutionAsync(executing,()=>{invoked=true;return Task.FromResult(new ActionExecutedContext(action,[],new object()));});
            return invoked ? 200 : executing.Result is StatusCodeResult code ? code.StatusCode : (executing.Result as ObjectResult)?.StatusCode ?? 500;
        }
        Check(await Authorize("Platform","developer-check")==200 && await Authorize("Platform","owner-check")==403,"Only the developer can activate the platform feature or change fees");
        Check(await Authorize("Consent","owner-check")==200 && await Authorize("Consent","developer-check")==403,"Legacy owner route must retain its existing authentication boundary");
        var controller=new PreorderAdministrationController(policy,db,brand) { ControllerContext=new ControllerContext { HttpContext=new DefaultHttpContext() } };
        controller.HttpContext.Items["AdminUser"]=owner;
        try { await controller.Consent(new(false,false)); throw new Exception("Legacy consent endpoint must reject writes"); }
        catch (PreorderException error) {
            var exceptionContext=new ExceptionContext(new ActionContext(controller.HttpContext,new RouteData(),new ActionDescriptor()),[]) { Exception=error };
            new PreorderErrorsAttribute().OnException(exceptionContext);
            Check(exceptionContext.ExceptionHandled && exceptionContext.Result is ObjectResult { StatusCode:410 } result &&
                JsonSerializer.SerializeToElement(result.Value).GetProperty("code").GetString()=="PREORDER_MANAGED_BY_PLATFORM",
                "Legacy owner endpoint must return an explicit 410 migration error");
        }
        Check(await Authorize("Settings","owner-check")==200 && await Authorize("Settlements","owner-check")==200 &&
            await Authorize("Settings","developer-check")==200 && await Authorize("Settlements","developer-check")==200,
            "Owner and Developer must retain read-only settings and settlement access");
        Check(await Authorize("Settings","")==401 && await Authorize("Settlements","")==401,"Policy and financial reports require authenticated restaurant staff");
        Console.WriteLine($"PASS: {count} preorder checks: developer activation, historical consent preservation, commission snapshots, server prices, capabilities, idempotency, closures, timing, tenant isolation and no unpaid fulfillment.");
    }
}
