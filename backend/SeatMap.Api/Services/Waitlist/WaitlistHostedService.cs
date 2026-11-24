using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SeatMap.Api.Data;
using SeatMap.Api.Services.Reservations;
using SeatMap.Api.Services.Tenancy;
using System.Net;

namespace SeatMap.Api.Services.Waitlist;

public sealed class WaitlistHostedService(IServiceProvider services, IOptions<TenantResolutionOptions> tenancy,
    ILogger<WaitlistHostedService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
            while (!stoppingToken.IsCancellationRequested)
            {
                foreach (var tenant in tenancy.Value.Tenants.Where(x => x.IsActive))
                {
                    if (stoppingToken.IsCancellationRequested) return;
                    try
                    {
                        using var scope = services.CreateScope();
                        scope.ServiceProvider.GetRequiredService<CurrentTenant>().Resolve(tenant);
                        await scope.ServiceProvider.GetRequiredService<WaitlistService>().TickAsync();
                        await DeliverAsync(scope.ServiceProvider, tenant, stoppingToken);
                    }
                    catch (Exception error) { logger.LogError(error, "Waitlist processing failed. TenantId={TenantId}", tenant.Id); }
                }
                await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
    }
    private async Task DeliverAsync(IServiceProvider scope, TenantDefinition tenant, CancellationToken ct)
    {
        var db = scope.GetRequiredService<AppDbContext>();
        var email = scope.GetRequiredService<WaitlistEmailSender>();
        // Lease delivery separately: no network calls while holding the booking lock.
        var now = DateTime.UtcNow;
        List<WaitlistEntry> pending;
        await using (var tx = await RestaurantWriteTransaction.BeginAsync(db))
        {
            pending = await db.WaitlistEntries.Where(x => x.Status == "offered" && x.ExpiresAtUtc > now && x.EmailSentAtUtc == null &&
                (x.NotificationLeaseUntilUtc == null || x.NotificationLeaseUntilUtc < now) && x.NotificationAttempts < 5).Take(20).ToListAsync(ct);
            foreach (var e in pending) { e.NotificationLeaseUntilUtc = now.AddSeconds(30); e.NotificationAttempts++; }
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        }
        foreach (var e in pending)
        {
            if (ct.IsCancellationRequested) return;
            if (!await db.WaitlistEntries.AsNoTracking().AnyAsync(x => x.Id == e.Id && x.OfferId == e.OfferId && x.Status == "offered" && x.ExpiresAtUtc > DateTime.UtcNow, ct)) continue;
            var platform = scope.GetService<SeatMap.Api.Platform.Data.PlatformDbContext>();
            var guest = platform == null ? null : await platform.GuestProfiles.AsNoTracking().SingleOrDefaultAsync(x => x.Id == e.GuestId, ct);
            if (guest?.EmailVerifiedAtUtc == null || string.IsNullOrWhiteSpace(guest.Email)) continue;
            var en = e.Language == "en"; var ru = e.Language == "ru";
            var title = en ? "A table is available for you" : ru ? "Для вас освободился стол" : "Освободи се маса за вас";
            var instruction = en ? "Open SeatMap → Reservations to confirm before the deadline. This is an offer, not a confirmed booking." : ru ? "Откройте SeatMap → Резервации и подтвердите до истечения срока. Это предложение, а не подтверждённая бронь." : "Отворете SeatMap → Резервации и потвърдете преди крайния срок. Това е предложение, не потвърдена резервация.";
            var brand = await scope.GetRequiredService<TenantBrandingService>().GetAsync();
            var deadline = TimeZoneInfo.ConvertTimeFromUtc(e.ExpiresAtUtc!.Value, TimeZoneInfo.FindSystemTimeZoneById(brand.TimeZoneId));
            var html = $"<h2>{title}</h2><p>{WebUtility.HtmlEncode(tenant.Name)} · {e.Date:dd.MM.yyyy} · {e.OfferTime} · {e.Guests}</p><p>{instruction}</p><p>{(en ? "Confirm by" : ru ? "Подтвердите до" : "Потвърдете до")}: {deadline:HH:mm} ({WebUtility.HtmlEncode(brand.TimeZoneId)})</p>";
            try
            {
                if (await email.SendAsync(guest.Email, $"{title} · {tenant.Name}", html, e.OfferId!.Value, ct))
                    await db.WaitlistEntries.Where(x => x.Id == e.Id && x.OfferId == e.OfferId).ExecuteUpdateAsync(s => s.SetProperty(x => x.EmailSentAtUtc, DateTime.UtcNow), ct);
            }
            catch (Exception error) { logger.LogWarning(error, "Waitlist notification retry scheduled. EntryId={EntryId}", e.Id); }
        }
    }
}
