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
        await policy.SetPlatformAsync(new(true,1250),developer);
        await Reject(()=>service.QuoteAsync(booking.Id,key,request),403,"PREORDERS_DISABLED");
        await Reject(()=>policy.SetConsentAsync(new(true,false),owner),400,"PREORDER_TERMS_REQUIRED");
        var displayedTerms=JsonSerializer.SerializeToElement(await policy.AdminAsync());
        var initialConsent=new PreorderConsentRequest(true,true,
            displayedTerms.GetProperty("platform").GetProperty("CommissionBasisPoints").GetInt32(),
            displayedTerms.GetProperty("termsVersion").GetString());
        await Reject(()=>policy.SetConsentAsync(new(true,true),owner),409,"PREORDER_TERMS_CHANGED");
        await Reject(()=>policy.SetConsentAsync(initialConsent with { ExpectedTermsVersion="preorders-v0" },owner),409,"PREORDER_TERMS_CHANGED");
        await policy.SetConsentAsync(initialConsent,owner);
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
        var bad=new PreorderDraftRequest {Items=[new(1,1),new(1,2)]};await Reject(()=>service.QuoteAsync(booking.Id,key,bad),400,"PREORDER_ITEMS_INVALID");
        bad.Items=[new(1,0)];await Reject(()=>service.QuoteAsync(booking.Id,key,bad),400,"PREORDER_ITEMS_INVALID");
        bad.Items=[new(999,1)];await Reject(()=>service.QuoteAsync(booking.Id,key,bad),409,"PREORDER_MENU_CHANGED");
        request.ServeOffsetMinutes=17;await Reject(()=>service.QuoteAsync(booking.Id,key,request),400,"PREORDER_TIME_INVALID");request.ServeOffsetMinutes=30;
        await zones.SetClosedAsync("room",true);await Reject(()=>service.QuoteAsync(booking.Id,key,request),409,"PREORDER_RESTAURANT_CLOSED");await zones.SetClosedAsync("room",false);
        var menu=await db.MenuItems.FindAsync(1);menu!.IsActive=false;await db.SaveChangesAsync();await Reject(()=>service.QuoteAsync(booking.Id,key,request),409,"PREORDER_MENU_CHANGED");menu.IsActive=true;await db.SaveChangesAsync();
        booking.Status="AwaitingEmailConfirmation";await db.SaveChangesAsync();
        Check(!(await service.QuoteAsync(booking.Id,key,request)).BookingConfirmed,"Pending booking may preview but cannot submit a preorder");
        request.IdempotencyKey=Guid.NewGuid();await Reject(()=>service.CreateDraftAsync(booking.Id,key,request),409,"PREORDER_BOOKING_UNCONFIRMED");booking.Status="Approved";await db.SaveChangesAsync();
        await policy.SetPlatformAsync(new(true,1500),developer);await Reject(()=>service.QuoteAsync(booking.Id,key,request),403,"PREORDERS_DISABLED");
        Check((await policy.ConsentAsync()).AcceptedCommissionBasisPoints==1250,"Developer fee changes must not silently change owner consent");
        var auditCountBeforeStaleAcceptance=await db.AuditLogs.CountAsync(x=>x.Action=="preorder-policy");
        await Reject(()=>policy.SetConsentAsync(initialConsent,owner),409,"PREORDER_TERMS_CHANGED");
        Check((await policy.ConsentAsync()).AcceptedCommissionBasisPoints==1250 &&
            await db.AuditLogs.CountAsync(x=>x.Action=="preorder-policy")==auditCountBeforeStaleAcceptance,
            "Accepting an outdated screen must not alter consent or append a successful consent audit");
        await Reject(()=>service.QuoteAsync(booking.Id,key,request),403,"PREORDERS_DISABLED");
        var currentConsent=initialConsent with { ExpectedCommissionBasisPoints=1500 };
        await policy.SetConsentAsync(currentConsent,owner);Check((await service.QuoteAsync(booking.Id,key,request)).TotalMinor==2718,"Owner may explicitly accept new commission");
        var consentSetting=await db.AppSettings.SingleAsync(x=>x.Key=="preorders:consent:v1");
        var acceptedConsent=await policy.ConsentAsync();
        foreach (var staleVersion in new string?[] { "preorders-v0", null })
        {
            consentSetting.Value=JsonSerializer.Serialize(acceptedConsent with { Version=staleVersion },new JsonSerializerOptions(JsonSerializerDefaults.Web));
            await db.SaveChangesAsync();
            Check(!JsonSerializer.SerializeToElement(await policy.PublicAsync()).GetProperty("enabled").GetBoolean() &&
                JsonSerializer.SerializeToElement(await policy.AdminAsync()).GetProperty("consentNeedsRenewal").GetBoolean(),
                "Outdated or missing stored terms must disable public ordering and request renewed owner consent");
            await Reject(()=>service.QuoteAsync(booking.Id,key,request),403,"PREORDERS_DISABLED");
        }
        await policy.SetConsentAsync(currentConsent,owner);
        await policy.SetConsentAsync(new(false,false),owner);
        Check(!(await policy.ConsentAsync()).OptedIn,"Owner must be able to withdraw consent without accepting the current terms");
        await policy.SetConsentAsync(currentConsent,owner);
        Check((await db.ReservationPreorders.SingleAsync()).CommissionBasisPoints==1250,"Saved financial snapshots must not change retroactively");
        var guests=new GuestReservationService(db,brand,clock);Check((await guests.CancelAsync(booking.Id,key)).Kind==ReservationBookingResultKind.Success,"Unpaid drafts must not block timely booking cancellation");
        await Reject(()=>service.QuoteAsync(booking.Id,key,request),409,"PREORDER_BOOKING_INACTIVE");
        await using var otherConnection=new SqliteConnection("Data Source=:memory:");await otherConnection.OpenAsync();
        await using var other=new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(otherConnection).Options);await other.Database.EnsureCreatedAsync();
        var otherPolicy=new PreorderPolicyService(other,clock);Check(!(await otherPolicy.PlatformAsync()).Enabled && !(await otherPolicy.ConsentAsync()).OptedIn,"Restaurant policy must stay isolated in each database");
        Check(await db.AuditLogs.CountAsync(x=>x.Action=="preorder-policy")>=4,"Policy and consent changes must be audited");
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
        Check(await Authorize("Consent","owner-check")==200 && await Authorize("Consent","developer-check")==403,"Developer must not impersonate owner consent");
        Check(await Authorize("Settings","")==401 && await Authorize("Settlements","")==401,"Policy and financial reports require authenticated restaurant staff");
        Console.WriteLine($"PASS: {count} preorder checks: opt-in, commission re-consent, server prices, capabilities, idempotency, closures, timing, tenant isolation and no unpaid fulfillment.");
    }
}
