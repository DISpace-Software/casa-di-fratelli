using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SeatMap.Api.Data;
using SeatMap.Api.Models;
using SeatMap.Api.Services.Reservations;

namespace SeatMap.Api.Services.Preorders;

public sealed record PreorderPlatformPolicy(bool Enabled = false, int CommissionBasisPoints = 0);
public sealed record PreorderConsent(bool OptedIn = false, DateTime? AcceptedAtUtc = null, int? AcceptedByAdminId = null, string? Version = null, int? AcceptedCommissionBasisPoints = null);
public sealed record PreorderPlatformRequest(bool Enabled, [Range(0, 10000)] int CommissionBasisPoints);
public sealed record PreorderConsentRequest(bool OptedIn, bool AcceptFullPrepaymentAndMonthlySettlement,
    int? ExpectedCommissionBasisPoints = null, string? ExpectedTermsVersion = null);

public sealed class PreorderPolicyService(AppDbContext db, TimeProvider time)
{
    public const string CurrentTermsVersion = "preorders-v1";
    private const string PlatformKey = "preorders:platform:v1", ConsentKey = "preorders:consent:v1";
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private async Task<T> ReadAsync<T>(string key, T fallback) =>
        await db.AppSettings.AsNoTracking().Where(x => x.Key == key).Select(x => x.Value).SingleOrDefaultAsync() is { } value
            ? JsonSerializer.Deserialize<T>(value, Json) ?? fallback : fallback;
    public Task<PreorderPlatformPolicy> PlatformAsync() => ReadAsync(PlatformKey, new PreorderPlatformPolicy());
    public Task<PreorderConsent> ConsentAsync() => ReadAsync(ConsentKey, new PreorderConsent());
    public async Task<object> PublicAsync()
    {
        var platform = await PlatformAsync();
        return new { enabled = platform.Enabled, activationMode = "developer", cardPaymentsAvailable = false,
            fullPrepaymentRequired = true, minLeadMinutes = 30, maxServeOffsetMinutes = 120, serveStepMinutes = 15 };
    }
    public async Task<object> AdminAsync()
    {
        var platform = await PlatformAsync(); var restaurant = await ConsentAsync();
        // Legacy consent is retained for history only. The developer's saved policy
        // is the single source of activation; changing fees never renews owner consent.
        return new { platform, restaurant, enabled = platform.Enabled, activationMode = "developer",
            termsVersion = CurrentTermsVersion, consentNeedsRenewal = false,
            cardPaymentsAvailable = false, settlementFrequency = "Monthly", currency = "EUR" };
    }
    public Task SetPlatformAsync(PreorderPlatformRequest request, AdminPrincipal actor) =>
        SaveAsync(PlatformKey, new PreorderPlatformPolicy(request.Enabled, request.CommissionBasisPoints), actor);
    public Task SetConsentAsync(PreorderConsentRequest request, AdminPrincipal actor) =>
        throw new PreorderException(410, "PREORDER_MANAGED_BY_PLATFORM",
            "Preorders and commission are managed by the platform developer. Owner confirmation is no longer required.");
    private async Task SaveAsync<T>(string key, T value, AdminPrincipal actor)
    {
        await using var transaction = await RestaurantWriteTransaction.BeginAsync(db);
        await SaveUnderLockAsync(key, value, actor);
        await transaction.CommitAsync();
    }
    private async Task SaveUnderLockAsync<T>(string key, T value, AdminPrincipal actor)
    {
        var setting = await db.AppSettings.SingleOrDefaultAsync(x => x.Key == key);
        var before = setting?.Value;
        if (setting == null) { setting = new AppSetting { Key = key }; db.AppSettings.Add(setting); }
        setting.Value = JsonSerializer.Serialize(value, Json); setting.UpdatedAtUtc = time.GetUtcNow().UtcDateTime;
        db.AuditLogs.Add(new AuditLog { Action = "preorder-policy", Entity = "PreorderPolicy", EntityId = key,
            AdminUserId = actor.Id, AdminName = actor.Name, BeforeJson = before, AfterJson = setting.Value, CreatedAtUtc = setting.UpdatedAtUtc });
        await db.SaveChangesAsync();
    }
}
public sealed class PreorderException(int status, string code, string message) : Exception(message)
{ public int Status { get; } = status; public string Code { get; } = code; }
