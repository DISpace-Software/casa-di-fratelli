using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SeatMap.Api.Data;
using SeatMap.Api.Models;
using SeatMap.Api.Services.Reservations;

namespace SeatMap.Api.Services.Preorders;

public sealed record PreorderPlatformPolicy(bool Enabled = false, int CommissionBasisPoints = 0);
public sealed record PreorderConsent(bool OptedIn = false, DateTime? AcceptedAtUtc = null, int? AcceptedByAdminId = null, string Version = "preorders-v1", int? AcceptedCommissionBasisPoints = null);
public sealed record PreorderPlatformRequest(bool Enabled, [Range(0, 10000)] int CommissionBasisPoints);
public sealed record PreorderConsentRequest(bool OptedIn, bool AcceptFullPrepaymentAndMonthlySettlement);

public sealed class PreorderPolicyService(AppDbContext db, TimeProvider time)
{
    private const string PlatformKey = "preorders:platform:v1", ConsentKey = "preorders:consent:v1";
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private async Task<T> ReadAsync<T>(string key, T fallback) =>
        await db.AppSettings.AsNoTracking().Where(x => x.Key == key).Select(x => x.Value).SingleOrDefaultAsync() is { } value
            ? JsonSerializer.Deserialize<T>(value, Json) ?? fallback : fallback;
    public Task<PreorderPlatformPolicy> PlatformAsync() => ReadAsync(PlatformKey, new PreorderPlatformPolicy());
    public Task<PreorderConsent> ConsentAsync() => ReadAsync(ConsentKey, new PreorderConsent());
    public async Task<object> PublicAsync()
    {
        var platform = await PlatformAsync(); var consent = await ConsentAsync();
        return new { enabled = platform.Enabled && consent.OptedIn && consent.AcceptedCommissionBasisPoints == platform.CommissionBasisPoints, cardPaymentsAvailable = false,
            fullPrepaymentRequired = true, minLeadMinutes = 30, maxServeOffsetMinutes = 120, serveStepMinutes = 15 };
    }
    public async Task<object> AdminAsync()
    {
        var platform = await PlatformAsync(); var restaurant = await ConsentAsync();
        return new { platform, restaurant, consentNeedsRenewal = restaurant.OptedIn && restaurant.AcceptedCommissionBasisPoints != platform.CommissionBasisPoints,
            cardPaymentsAvailable = false, settlementFrequency = "Monthly", currency = "EUR" };
    }
    public Task SetPlatformAsync(PreorderPlatformRequest request, AdminPrincipal actor) =>
        SaveAsync(PlatformKey, new PreorderPlatformPolicy(request.Enabled, request.CommissionBasisPoints), actor);
    public async Task SetConsentAsync(PreorderConsentRequest request, AdminPrincipal actor)
    {
        if (request.OptedIn && !request.AcceptFullPrepaymentAndMonthlySettlement)
            throw new PreorderException(400, "PREORDER_TERMS_REQUIRED", "The owner must accept full prepayment and monthly settlement.");
        var policy = await PlatformAsync();
        await SaveAsync(ConsentKey, new PreorderConsent(request.OptedIn,
            request.OptedIn ? time.GetUtcNow().UtcDateTime : null, request.OptedIn ? actor.Id : null,
            AcceptedCommissionBasisPoints: request.OptedIn ? policy.CommissionBasisPoints : null), actor);
    }
    private async Task SaveAsync<T>(string key, T value, AdminPrincipal actor)
    {
        await using var transaction = await RestaurantWriteTransaction.BeginAsync(db);
        var setting = await db.AppSettings.SingleOrDefaultAsync(x => x.Key == key);
        var before = setting?.Value;
        if (setting == null) { setting = new AppSetting { Key = key }; db.AppSettings.Add(setting); }
        setting.Value = JsonSerializer.Serialize(value, Json); setting.UpdatedAtUtc = time.GetUtcNow().UtcDateTime;
        db.AuditLogs.Add(new AuditLog { Action = "preorder-policy", Entity = "PreorderPolicy", EntityId = key,
            AdminUserId = actor.Id, AdminName = actor.Name, BeforeJson = before, AfterJson = setting.Value, CreatedAtUtc = setting.UpdatedAtUtc });
        await db.SaveChangesAsync(); await transaction.CommitAsync();
    }
}
public sealed class PreorderException(int status, string code, string message) : Exception(message)
{ public int Status { get; } = status; public string Code { get; } = code; }
