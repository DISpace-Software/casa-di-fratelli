using System.Net;
using System.Security.Cryptography;
using System.Text;
using CasaDiFratelli.Api.Data;
using CasaDiFratelli.Api.Models;
using CasaDiFratelli.Api.Services.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace CasaDiFratelli.Api.Services;

public sealed class VisitFeedbackEmailService(AppDbContext db, EmailService email, TenantBrandingService branding)
{
    public async Task<VisitFeedbackEmail?> QueueAsync(Reservation reservation, string frontendUrl)
    {
        if (string.IsNullOrWhiteSpace(reservation.Email)) return null;
        var recipient = reservation.Email.Trim().ToLowerInvariant();
        if (!new System.ComponentModel.DataAnnotations.EmailAddressAttribute().IsValid(recipient)) return null;
        var existing = await db.VisitFeedbackEmails.SingleOrDefaultAsync(x => x.ReservationId == reservation.Id);
        if (existing != null) return existing;
        var phone = NormalizePhone(reservation.Phone);
        var completed = await db.Reservations.IgnoreQueryFilters().AsNoTracking()
            .Where(x => x.Id != reservation.Id && x.HasCompletedVisit && !x.IsNoShow && x.GuestCount > 0)
            .Select(x => new { x.Email, x.Phone }).ToListAsync();
        var visitedBefore = completed.Any(x => (x.Email ?? "").Trim().ToLowerInvariant() == recipient
            || (phone.Length > 0 && NormalizePhone(x.Phone) == phone));
        var hasFeedback = await db.CustomerFeedbacks.AnyAsync(x => x.Email.Trim().ToLower() == recipient);
        var firstKey = "first-visit:" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(recipient))).ToLowerInvariant();
        var firstInvitation = !visitedBefore && !hasFeedback && !await db.VisitFeedbackEmails.AnyAsync(x => x.DeduplicationKey == firstKey);
        var brand = await branding.GetAsync();
        var html = BuildHtml(reservation, frontendUrl, brand, firstInvitation);
        var delivery = new VisitFeedbackEmail
        {
            ReservationId = reservation.Id,
            DeduplicationKey = firstInvitation ? firstKey : $"visit:{reservation.Id}",
            Email = recipient, GuestName = reservation.GuestName, IsFirstVisitInvitation = firstInvitation,
            Subject = firstInvitation ? $"Благодарим Ви за посещението · {brand.Name}" : $"Благодарим Ви отново · {brand.Name}",
            Html = html
        };
        db.VisitFeedbackEmails.Add(delivery);
        // The caller commits the queue and table release in one transaction, before talking to Resend.
        await db.SaveChangesAsync();
        return delivery;
    }

    public async Task<string> DispatchForReservationAsync(int reservationId)
    {
        var item = await db.VisitFeedbackEmails.AsNoTracking().SingleOrDefaultAsync(x => x.ReservationId == reservationId);
        if (item == null) return "not-queued";
        if (item.SentAtUtc.HasValue) return "sent";
        var now = DateTime.UtcNow;
        var claimed = await db.VisitFeedbackEmails.Where(x => x.Id == item.Id && x.SentAtUtc == null && x.NextAttemptAtUtc <= now)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(x => x.NextAttemptAtUtc, now.AddMinutes(2))
                .SetProperty(x => x.Attempts, x => x.Attempts + 1));
        if (claimed == 0) return "queued";
        var key = "visit-feedback-" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(branding.TenantId + ":" + item.DeduplicationKey))).ToLowerInvariant();
        var accepted = await email.TrySendTransactionalAsync(item.Email, item.Subject, item.Html, key);
        var retryAt = now.AddMinutes(Math.Min(60, Math.Pow(2, Math.Min(item.Attempts + 1, 6))));
        await db.VisitFeedbackEmails.Where(x => x.Id == item.Id).ExecuteUpdateAsync(setters => setters
            .SetProperty(x => x.SentAtUtc, accepted ? (DateTime?)DateTime.UtcNow : null)
            .SetProperty(x => x.LastError, accepted ? null : "Resend did not accept this email. Automatic retry scheduled.")
            .SetProperty(x => x.NextAttemptAtUtc, retryAt));
        return accepted ? "sent" : "queued";
    }

    public async Task RetryPendingAsync()
    {
        var now = DateTime.UtcNow;
        var pending = await db.VisitFeedbackEmails.AsNoTracking()
            .Where(x => x.SentAtUtc == null && x.NextAttemptAtUtc <= now)
            .OrderBy(x => x.NextAttemptAtUtc).Take(50).Select(x => x.ReservationId).ToListAsync();
        foreach (var reservationId in pending) await DispatchForReservationAsync(reservationId);
    }

    public async Task<bool> SendTestAsync(string recipient, string frontendUrl)
    {
        var brand = await branding.GetAsync();
        recipient = recipient.Trim().ToLowerInvariant();
        var reservation = new Reservation { GuestName = "Тест Casa di Fratelli", Email = recipient };
        var html = BuildHtml(reservation, frontendUrl, brand, firstInvitation: true);
        var key = "feedback-test-" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{branding.TenantId}:{recipient}:{DateTime.UtcNow:yyyy-MM-dd}"))).ToLowerInvariant();
        return await email.TrySendTransactionalAsync(recipient, $"[ТЕСТ] Благодарим Ви за посещението · {brand.Name}", html, key);
    }

    private static string BuildHtml(Reservation reservation, string frontendUrl, TenantBrandingSettings brand, bool firstInvitation)
    {
        var recipient = reservation.Email!.Trim().ToLowerInvariant();
        var htmlRestaurantName = WebUtility.HtmlEncode(brand.Name);
        var guestName = WebUtility.HtmlEncode(reservation.GuestName);
        var reservationQuery = reservation.Id > 0 ? $"reservationId={reservation.Id}&" : "";
        var feedbackUrl = WebUtility.HtmlEncode($"{frontendUrl.TrimEnd('/')}/feedback?{reservationQuery}email={Uri.EscapeDataString(recipient)}&name={Uri.EscapeDataString(reservation.GuestName)}");
        var reviewUrl = WebUtility.HtmlEncode(brand.GoogleReviewUrl);
        return firstInvitation ?
$"""
                <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937;background:#f8f3ea;padding:28px">
                  <div style="max-width:640px;margin:0 auto;background:#fffaf2;border:1px solid #ead8bd;border-radius:22px;padding:28px">
                  <p style="letter-spacing:0.22em;text-transform:uppercase;color:#9a682d;font-size:12px;font-weight:700;margin:0 0 12px">{htmlRestaurantName}</p>
                  <h2 style="margin:0 0 14px;color:#2b1d15">Благодарим Ви, че бяхте наши гости</h2>
                  <p>Здравейте, {guestName},</p>
                  <p>За нас беше удоволствие да Ви посрещнем в <strong>{htmlRestaurantName}</strong>.</p>
                  <p>Ще ни помогнете много, ако отделите минута за кратка обратна връзка за атмосферата, храната, обслужването и онлайн резервацията. Като благодарност ще получите <strong>5% за следващото посещение</strong>.</p>
                  <p>
                    <a href="{feedbackUrl}" style="display:inline-block;background:#c9a56a;color:#111827;padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:700;margin-right:8px">
                      Попълнете обратна връзка
                    </a>
                    <a href="{reviewUrl}" style="display:inline-block;border:1px solid #c9a56a;color:#7a4a17;padding:11px 18px;border-radius:12px;text-decoration:none;font-weight:700">
                      Оставете Google отзив
                    </a>
                  </p>
                  <p style="color:#6b7280">Очакваме Ви отново с удоволствие.</p>
                  </div>
                </div>
                """
            :
$"""
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937;background:#f8f3ea;padding:28px">
              <div style="max-width:640px;margin:0 auto;background:#fffaf2;border:1px solid #ead8bd;border-radius:22px;padding:28px">
              <p style="letter-spacing:0.22em;text-transform:uppercase;color:#9a682d;font-size:12px;font-weight:700;margin:0 0 12px">{htmlRestaurantName}</p>
              <h2 style="margin:0 0 14px;color:#2b1d15">Благодарим Ви отново</h2>
              <p>Здравейте, {guestName},</p>
              <p>Благодарим Ви, че отново избрахте <strong>{htmlRestaurantName}</strong>.</p>
              <p>За нас е чест да Ви посрещаме отново. Надяваме се вечерта Ви да е била спокойна, вкусна и запомняща се.</p>
              <p>
                <a href="{reviewUrl}" style="display:inline-block;border:1px solid #c9a56a;color:#7a4a17;padding:11px 18px;border-radius:12px;text-decoration:none;font-weight:700">
                  Оставете Google отзив
                </a>
              </p>
              <p style="color:#6b7280">За нас е чест да Ви посрещаме и ще се радваме скоро пак да бъдете наши гости.</p>
              </div>
            </div>
            """;
    }

    private static string NormalizePhone(string? phone)
    {
        var digits = new string((phone ?? "").Where(char.IsDigit).ToArray());
        if (digits.StartsWith("00")) digits = digits[2..];
        if (digits.StartsWith("359")) digits = "0" + digits[3..];
        return digits;
    }
}
