using System.Text.Json;
using CasaDiFratelli.Api.Data;
using CasaDiFratelli.Api.Models;
using Microsoft.EntityFrameworkCore;
using WebPush;

namespace CasaDiFratelli.Api.Services;

public class PushNotificationService
{
    private const string VapidPublicKeySetting = "VapidPublicKey";
    private const string VapidPrivateKeySetting = "VapidPrivateKey";
    private readonly AppDbContext _db;
    private readonly IConfiguration _configuration;
    private readonly ILogger<PushNotificationService> _logger;

    public PushNotificationService(AppDbContext db, IConfiguration configuration, ILogger<PushNotificationService> logger)
    {
        _db = db;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<string> GetPublicKeyAsync()
    {
        var keys = await GetOrCreateVapidKeysAsync();
        return keys.PublicKey;
    }

    public async Task NotifyNewReservationAsync(Reservation reservation)
    {
        var tableLabel = string.Join(", ", reservation.Tables.Select(table => table.TableCode));
        var payload = JsonSerializer.Serialize(new
        {
            title = "Нова резервация · Casa di Fratelli",
            body = $"{reservation.GuestName} · {reservation.ReservedDate:dd.MM.yyyy} {reservation.ReservedTime} · {reservation.GuestCount} гости",
            url = "/admin",
            tag = $"reservation-{reservation.Id}",
            reservationId = reservation.Id,
            tableLabel
        });

        await SendToAdminRolesAsync(payload);
    }

    private async Task SendToAdminRolesAsync(string payload)
    {
        var keys = await GetOrCreateVapidKeysAsync();
        var subject = GetVapidSubject();
        var vapidDetails = new VapidDetails(subject, keys.PublicKey, keys.PrivateKey);
        var client = new WebPushClient();

        var subscriptions = await _db.AdminPushSubscriptions
            .Include(subscription => subscription.AdminUser)
            .Where(subscription =>
                subscription.IsActive &&
                subscription.AdminUser != null &&
                subscription.AdminUser.IsActive)
            .ToListAsync();

        foreach (var storedSubscription in subscriptions)
        {
            var role = AdminRoleAccess.Normalize(storedSubscription.AdminUser?.Role);
            if (role is not (AdminRoleAccess.Owner or AdminRoleAccess.Administrator or AdminRoleAccess.Developer))
                continue;

            try
            {
                var subscription = new PushSubscription(
                    storedSubscription.Endpoint,
                    storedSubscription.P256Dh,
                    storedSubscription.Auth);

                await client.SendNotificationAsync(subscription, payload, vapidDetails);
                storedSubscription.LastUsedAtUtc = DateTime.UtcNow;
            }
            catch (WebPushException error) when ((int)error.StatusCode == 404 || (int)error.StatusCode == 410)
            {
                storedSubscription.IsActive = false;
                _logger.LogInformation("Disabled expired push subscription {Id}", storedSubscription.Id);
            }
            catch (Exception error)
            {
                _logger.LogWarning(error, "Failed to send push notification to subscription {Id}", storedSubscription.Id);
            }
        }

        await _db.SaveChangesAsync();
    }

    private string GetVapidSubject()
    {
        var configuredSubject = _configuration["VAPID_SUBJECT"];
        if (!string.IsNullOrWhiteSpace(configuredSubject))
            return configuredSubject;

        var adminEmail = _configuration["ADMIN_EMAIL"];
        return string.IsNullOrWhiteSpace(adminEmail)
            ? "mailto:admin@casadifratelli.bg"
            : $"mailto:{adminEmail}";
    }

    private async Task<(string PublicKey, string PrivateKey)> GetOrCreateVapidKeysAsync()
    {
        var configuredPublicKey = _configuration["VAPID_PUBLIC_KEY"];
        var configuredPrivateKey = _configuration["VAPID_PRIVATE_KEY"];
        if (!string.IsNullOrWhiteSpace(configuredPublicKey) && !string.IsNullOrWhiteSpace(configuredPrivateKey))
            return (configuredPublicKey.Trim(), configuredPrivateKey.Trim());

        var settings = await _db.AppSettings
            .Where(setting => setting.Key == VapidPublicKeySetting || setting.Key == VapidPrivateKeySetting)
            .ToListAsync();

        var publicKey = settings.FirstOrDefault(setting => setting.Key == VapidPublicKeySetting);
        var privateKey = settings.FirstOrDefault(setting => setting.Key == VapidPrivateKeySetting);

        if (publicKey != null && privateKey != null &&
            !string.IsNullOrWhiteSpace(publicKey.Value) &&
            !string.IsNullOrWhiteSpace(privateKey.Value))
        {
            return (publicKey.Value, privateKey.Value);
        }

        var generated = VapidHelper.GenerateVapidKeys();
        publicKey ??= new AppSetting { Key = VapidPublicKeySetting };
        privateKey ??= new AppSetting { Key = VapidPrivateKeySetting };
        publicKey.Value = generated.PublicKey;
        privateKey.Value = generated.PrivateKey;
        publicKey.UpdatedAtUtc = DateTime.UtcNow;
        privateKey.UpdatedAtUtc = DateTime.UtcNow;

        if (publicKey.Id == 0)
            _db.AppSettings.Add(publicKey);
        if (privateKey.Id == 0)
            _db.AppSettings.Add(privateKey);

        await _db.SaveChangesAsync();
        return (generated.PublicKey, generated.PrivateKey);
    }
}
