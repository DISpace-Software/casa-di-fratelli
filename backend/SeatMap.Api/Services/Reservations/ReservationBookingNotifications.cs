using System.Net;
using SeatMap.Api.Models;
using SeatMap.Api.Services.Tenancy;

namespace SeatMap.Api.Services.Reservations;

public interface IReservationBookingNotifications
{
    Task SendConfirmationAsync(Reservation reservation, string token);
    Task NotifyConfirmedAsync(Reservation reservation);
}

public sealed class ReservationBookingNotifications(
    EmailService email,
    PushNotificationService push,
    TenantBrandingService branding,
    ICurrentTenant tenant,
    IConfiguration configuration) : IReservationBookingNotifications
{
    private readonly EmailService _emailService = email;
    private readonly TenantBrandingService _branding = branding;
    private string GetFrontendUrl() => RestaurantPublicLinks.GetFrontendUrl(tenant, configuration);

    public async Task NotifyConfirmedAsync(Reservation reservation)
    {
        await SendAdminReservationEmailAsync(reservation);
        await push.NotifyNewReservationAsync(reservation);
    }

    public async Task SendConfirmationAsync(Reservation reservation, string token)
    {
        var brand = await _branding.GetAsync();
        var htmlRestaurantName = WebUtility.HtmlEncode(brand.Name);
        if (string.IsNullOrWhiteSpace(reservation.Email))
            return;

        var guestName = WebUtility.HtmlEncode(reservation.GuestName);
        var confirmUrl = WebUtility.HtmlEncode($"{GetFrontendUrl()}/reservation-confirm?token={Uri.EscapeDataString(token)}");

        await _emailService.SendAsync(
            reservation.Email,
            $"Потвърдете резервацията си · {brand.Name}",
            $"""
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937;background:#f8f3ea;padding:28px">
              <div style="max-width:620px;margin:0 auto;background:#fffaf2;border:1px solid #ead8bd;border-radius:22px;padding:28px">
                <p style="letter-spacing:0.22em;text-transform:uppercase;color:#9a682d;font-size:12px;font-weight:700;margin:0 0 12px">{htmlRestaurantName}</p>
                <h2 style="margin:0 0 14px;color:#2b1d15;font-size:28px">Потвърдете Вашата резервация</h2>
                <p>Здравейте, {guestName},</p>
                <p>Получихме заявката Ви за резервация. За да пазим масите коректно за всички гости, моля потвърдете резервацията от бутона по-долу.</p>
                <div style="background:#fff3df;border:1px solid #ead8bd;border-radius:16px;padding:16px;margin:20px 0">
                  <p style="margin:0"><strong>Дата:</strong> {reservation.ReservedDate:dd.MM.yyyy} г.</p>
                  <p style="margin:6px 0 0"><strong>Час:</strong> {reservation.ReservedTime}</p>
                  <p style="margin:6px 0 0"><strong>Гости:</strong> {reservation.GuestCount}</p>
                </div>
                <p>
                  <a href="{confirmUrl}" style="display:inline-block;background:#c9a56a;color:#111827;padding:14px 22px;border-radius:14px;text-decoration:none;font-weight:800">
                    Потвърждавам резервацията
                  </a>
                </p>
                <p style="color:#6b7280;font-size:14px">Ако не сте направили тази резервация, просто игнорирайте това писмо.</p>
              </div>
            </div>
            """
        );
    }


    private async Task SendAdminReservationEmailAsync(Reservation reservation)
    {
        var brand = await _branding.GetAsync();
        var htmlRestaurantName = WebUtility.HtmlEncode(brand.Name);
        var adminEmail = _branding.GetEmailConfiguration("ADMIN_EMAIL");
        if (string.IsNullOrWhiteSpace(adminEmail))
            return;

        var adminUrl = $"{GetFrontendUrl()}/admin";

        await _emailService.SendAsync(
            adminEmail,
            $"Нова потвърдена резервация: {reservation.GuestName} · {reservation.ReservedDate:dd.MM.yyyy} г. {reservation.ReservedTime}",
            $"""
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
              <h2>Нова потвърдена резервация в {htmlRestaurantName}</h2>
              <p><strong>Гост:</strong> {reservation.GuestName}</p>
              <p><strong>Телефон:</strong> {reservation.Phone}</p>
              <p><strong>Email:</strong> {reservation.Email}</p>
              <p><strong>Дата:</strong> {reservation.ReservedDate:dd.MM.yyyy} г.</p>
              <p><strong>Час:</strong> {reservation.ReservedTime}</p>
              <p><strong>Маси:</strong> {string.Join(", ", reservation.Tables.Select(t => t.TableCode))}</p>
              <p><strong>Гости:</strong> {reservation.GuestCount}</p>
              <p><strong>Специални изисквания:</strong> {reservation.Notes}</p>
              <p>
                <a href="{adminUrl}" style="display:inline-block;background:#c9a56a;color:#111827;padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:700">
                  Отвори админ панела
                </a>
              </p>
            </div>
            """
        );
    }

}
