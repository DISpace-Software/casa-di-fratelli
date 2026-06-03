using CasaDiFratelli.Api.Data;
using CasaDiFratelli.Api.Dtos;
using CasaDiFratelli.Api.Models;
using CasaDiFratelli.Api.Filters;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CasaDiFratelli.Api.Services;
using System.Net;
using System.Security.Cryptography;

namespace CasaDiFratelli.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ReservationsController : ControllerBase
{
    private const int PublicDailyContactReservationLimit = 2;
    private const int PublicMaxReservationDaysAhead = 10;
    private const string ReservationStatusAwaitingEmailConfirmation = "AwaitingEmailConfirmation";
    private const string ReservationStatusPending = "Pending";
    private const string ReservationStatusApproved = "Approved";
    private const string ReservationStatusCancelled = "Cancelled";
    private const string ReservationStatusReleased = "Released";
    private readonly AppDbContext _db;
    private readonly EmailService _emailService;
    private readonly IConfiguration _configuration;
    private readonly ReservationConflictService _reservationConflictService;
    private readonly AdminAuthService _adminAuth;
    private readonly AuditService _audit;

    public ReservationsController(
        AppDbContext db,
        EmailService emailService,
        IConfiguration configuration,
        ReservationConflictService reservationConflictService,
        AdminAuthService adminAuth,
        AuditService audit)
    {
        _db = db;
        _emailService = emailService;
        _configuration = configuration;
        _reservationConflictService = reservationConflictService;
        _adminAuth = adminAuth;
        _audit = audit;
    }

    private static DateTime GetRestaurantNow()
    {
        try
        {
            var timezone = TimeZoneInfo.FindSystemTimeZoneById("Europe/Sofia");
            return TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, timezone);
        }
        catch
        {
            return DateTime.Now;
        }
    }

    private static bool IsPastReservationTime(DateOnly reservedDate, string reservedTime)
    {
        if (!TimeOnly.TryParse(reservedTime, out var time))
            return false;

        var now = GetRestaurantNow();
        var today = DateOnly.FromDateTime(now);

        if (reservedDate < today) return true;
        if (reservedDate > today) return false;

        var selectedDateTime = reservedDate.ToDateTime(time);
        if (time.Hour <= 3 && now.Hour >= 10)
            selectedDateTime = selectedDateTime.AddDays(1);

        return selectedDateTime <= now;
    }

    private static string CreateOrderAccessToken()
    {
        return Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant();
    }

    private static string CreateEmailConfirmationToken()
    {
        return Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
    }

    private static string HashToken(string token)
    {
        var bytes = System.Text.Encoding.UTF8.GetBytes(token);
        return Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    }

    private static string NormalizePhoneForLimit(string phone)
    {
        return new string((phone ?? string.Empty).Where(char.IsDigit).ToArray());
    }

    private static bool IsActiveReservationForDailyLimit(Reservation reservation)
    {
        return reservation.Status != ReservationStatusAwaitingEmailConfirmation &&
            !(reservation.Status == ReservationStatusPending && reservation.EmailConfirmedAtUtc == null) &&
            reservation.Status != ReservationStatusCancelled &&
            reservation.Status != ReservationStatusReleased &&
            !reservation.IsNoShow;
    }

    private string GetFrontendUrl()
    {
        var configuredFrontendUrl = _configuration["FRONTEND_URL"];

        return string.IsNullOrWhiteSpace(configuredFrontendUrl)
            ? "https://casadifratelli.bg"
            : configuredFrontendUrl.TrimEnd('/');
    }

    private string GetReviewUrl()
    {
        return (_configuration["REVIEW_URL"] ??
            "https://www.google.com/maps/search/?api=1&query=Casa%20di%20Fratelli%20Vechernitsa%209%20Plovdiv").Trim();
    }

    private async Task SendReservationConfirmationEmailAsync(Reservation reservation, string token)
    {
        if (string.IsNullOrWhiteSpace(reservation.Email))
            return;

        var guestName = WebUtility.HtmlEncode(reservation.GuestName);
        var confirmUrl = WebUtility.HtmlEncode($"{GetFrontendUrl()}/reservation-confirm?token={Uri.EscapeDataString(token)}");

        await _emailService.SendAsync(
            reservation.Email,
            "Потвърдете резервацията си · Casa di Fratelli",
            $"""
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937;background:#f8f3ea;padding:28px">
              <div style="max-width:620px;margin:0 auto;background:#fffaf2;border:1px solid #ead8bd;border-radius:22px;padding:28px">
                <p style="letter-spacing:0.22em;text-transform:uppercase;color:#9a682d;font-size:12px;font-weight:700;margin:0 0 12px">Casa di Fratelli</p>
                <h2 style="margin:0 0 14px;color:#2b1d15;font-size:28px">Потвърдете Вашата резервация</h2>
                <p>Здравейте, {guestName},</p>
                <p>Получихме заявката Ви за резервация. За да пазим масите коректно за всички гости, моля потвърдете резервацията от бутона по-долу.</p>
                <div style="background:#fff3df;border:1px solid #ead8bd;border-radius:16px;padding:16px;margin:20px 0">
                  <p style="margin:0"><strong>Дата:</strong> {reservation.ReservedDate}</p>
                  <p style="margin:6px 0 0"><strong>Час:</strong> {reservation.ReservedTime}</p>
                  <p style="margin:6px 0 0"><strong>Маси:</strong> {string.Join(", ", reservation.Tables.Select(t => t.TableCode))}</p>
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

    private async Task SendThankYouEmailAsync(Reservation reservation)
    {
        if (string.IsNullOrWhiteSpace(reservation.Email))
            return;

        var customer = await _db.CustomerProfiles.FirstOrDefaultAsync(x =>
            (!string.IsNullOrWhiteSpace(reservation.Email) && x.Email == reservation.Email)
            ||
            (!string.IsNullOrWhiteSpace(reservation.Phone) && x.Phone == reservation.Phone)
        );
        var isFirstReservation = customer == null || customer.ReservationCount <= 1;
        var guestName = WebUtility.HtmlEncode(reservation.GuestName);

        if (isFirstReservation)
        {
            var reviewUrl = WebUtility.HtmlEncode(GetReviewUrl());

            await _emailService.SendAsync(
                reservation.Email,
                "Благодарим Ви за посещението · Casa di Fratelli",
                $"""
                <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
                  <h2>Благодарим Ви, че бяхте наши гости</h2>
                  <p>Здравейте, {guestName},</p>
                  <p>За нас беше удоволствие да Ви посрещнем в <strong>Casa di Fratelli</strong>.</p>
                  <p>Ако храната, обслужването и атмосферата са Ви харесали, ще сме благодарни да ни оставите отзив. Това помага на повече гости да открият нашия ресторант.</p>
                  <p>
                    <a href="{reviewUrl}" style="display:inline-block;background:#c9a56a;color:#111827;padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:700">
                      Оставете отзив
                    </a>
                  </p>
                  <p style="color:#6b7280">Очакваме Ви отново с удоволствие.</p>
                </div>
                """
            );

            return;
        }

        await _emailService.SendAsync(
            reservation.Email,
            "Благодарим Ви отново · Casa di Fratelli",
            $"""
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
              <h2>Благодарим Ви отново</h2>
              <p>Здравейте, {guestName},</p>
              <p>Благодарим Ви, че отново избрахте <strong>Casa di Fratelli</strong>.</p>
              <p>За нас е чест да Ви посрещаме и ще се радваме скоро пак да бъдете наши гости.</p>
            </div>
            """
        );
    }

    private async Task UpsertCustomerProfileForConfirmedReservationAsync(Reservation reservation)
    {
        var email = reservation.Email ?? string.Empty;
        var phone = reservation.Phone ?? string.Empty;

        var customer = await _db.CustomerProfiles.FirstOrDefaultAsync(x =>
            (!string.IsNullOrWhiteSpace(email) && x.Email == email)
            ||
            (!string.IsNullOrWhiteSpace(phone) && x.Phone == phone)
        );

        if (customer == null)
        {
            customer = new CustomerProfile
            {
                GuestName = reservation.GuestName,
                Email = email,
                Phone = phone,
                BirthDate = reservation.BirthDate,
                MarketingConsent = reservation.MarketingConsent,
                ReservationCount = 1,
                FirstReservationAtUtc = DateTime.UtcNow,
                LastReservationAtUtc = DateTime.UtcNow
            };

            _db.CustomerProfiles.Add(customer);
            return;
        }

        customer.GuestName = string.IsNullOrWhiteSpace(customer.GuestName)
            ? reservation.GuestName
            : customer.GuestName;
        customer.Email = string.IsNullOrWhiteSpace(customer.Email) ? email : customer.Email;
        customer.Phone = string.IsNullOrWhiteSpace(customer.Phone) ? phone : customer.Phone;
        customer.BirthDate ??= reservation.BirthDate;
        customer.MarketingConsent = customer.MarketingConsent || reservation.MarketingConsent;
        customer.ReservationCount += 1;
        customer.LastReservationAtUtc = DateTime.UtcNow;

        if (customer.ReservationCount >= 5)
        {
            customer.IsRegularCustomer = true;
            reservation.IsRegularCustomer = true;
        }
    }

    private async Task MarkReservationBlacklistFlagAsync(Reservation reservation)
    {
        reservation.IsBlacklisted = await _db.BlacklistEntries.AnyAsync(x =>
            (!string.IsNullOrWhiteSpace(x.Email) && x.Email == reservation.Email)
            ||
            (!string.IsNullOrWhiteSpace(x.Phone) && x.Phone == reservation.Phone)
        );
    }

    private async Task SendAdminReservationEmailAsync(Reservation reservation)
    {
        var adminEmail = _configuration["ADMIN_EMAIL"];
        if (string.IsNullOrWhiteSpace(adminEmail))
            return;

        var adminUrl = $"{GetFrontendUrl()}/admin";

        await _emailService.SendAsync(
            adminEmail,
            $"Нова потвърдена резервация: {reservation.GuestName} · {reservation.ReservedDate} {reservation.ReservedTime}",
            $"""
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
              <h2>Нова потвърдена резервация в Casa di Fratelli</h2>
              <p><strong>Гост:</strong> {reservation.GuestName}</p>
              <p><strong>Телефон:</strong> {reservation.Phone}</p>
              <p><strong>Email:</strong> {reservation.Email}</p>
              <p><strong>Дата:</strong> {reservation.ReservedDate}</p>
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

    [HttpGet]
    [AdminAuthorize]
    public async Task<IActionResult> GetAll()
    {
        var reservations = await _db.Reservations
            .Include(x => x.Tables)
            .Where(x =>
                x.Status != ReservationStatusAwaitingEmailConfirmation &&
                !(x.Status == ReservationStatusPending && x.EmailConfirmedAtUtc == null))
            .OrderByDescending(x => x.CreatedAtUtc)
            .Select(x => new
            {
                x.Id,
                x.GuestName,
                x.Phone,
                x.Email,
                x.GuestCount,
                x.Area,
                x.ReservedDate,
                x.ReservedTime,
                x.BirthDate,
                x.MarketingConsent,
                x.PrivacyConsent,
                x.Notes,
                x.CreatedByAdmin,
                x.CreatedByAdminUserId,
                x.CreatedByAdminName,
                x.IsWalkIn,
                x.InternalNote,
                x.IsArrived,
                x.IsNoShow,
                x.IsBlacklisted,
                x.IsRegularCustomer,
                x.Status,
                x.CreatedAtUtc,
                TableIds = x.Tables.Select(t => t.TableCode).ToList()
            })
            .ToListAsync();

        return Ok(reservations);
    }

    [HttpGet("blocked-slots")]
    public async Task<IActionResult> GetBlockedSlots()
    {
        var blocked = await _db.Reservations
            .Include(x => x.Tables)
            .Where(x => x.Status == ReservationStatusApproved)
            .Select(x => new
            {
                x.ReservedDate,
                x.ReservedTime,
                TableIds = x.Tables.Select(t => t.TableCode).ToList()
            })
            .ToListAsync();

        return Ok(blocked);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateReservationRequest request)
    {
        if (request.CreatedByAdmin && !await _adminAuth.IsAuthorizedAsync(Request))
            return Unauthorized(new { message = "Admin password is required." });

        if (string.IsNullOrWhiteSpace(request.GuestName))
            return BadRequest("Guest name is required.");

        if (string.IsNullOrWhiteSpace(request.Phone))
            return BadRequest("Phone is required.");

        if (!request.CreatedByAdmin && string.IsNullOrWhiteSpace(request.Email))
            return BadRequest("Email is required.");

        if (request.GuestCount <= 0)
            return BadRequest("Invalid guests.");

        if (request.TableIds is null || request.TableIds.Count == 0)
            return BadRequest("At least one table must be selected.");

        if (!request.CreatedByAdmin && !request.PrivacyConsent)
            return BadRequest("Privacy policy consent is required.");

        if (IsPastReservationTime(request.ReservedDate, request.ReservedTime))
            return BadRequest("Reservation date or time has already passed.");

        var today = DateOnly.FromDateTime(GetRestaurantNow());
        if (!request.CreatedByAdmin && request.ReservedDate > today.AddDays(PublicMaxReservationDaysAhead))
            return BadRequest("Online reservations are available up to 10 days ahead. For a later date, please call 088 821 8318.");

        var guestName = request.GuestName.Trim();
        var phone = request.Phone.Trim();
        var email = string.IsNullOrWhiteSpace(request.Email) ? string.Empty : request.Email.Trim();
        var normalizedEmail = email.ToLowerInvariant();
        var normalizedPhone = NormalizePhoneForLimit(phone);

        var tableIds = ReservationConflictService.NormalizeTableIds(request.TableIds);

        if (tableIds.Count == 0)
            return BadRequest("At least one valid table must be selected.");

        if (!TableCapacityService.HasEnoughSeats(tableIds, request.GuestCount))
            return BadRequest("Selected tables do not have enough seats.");

        if (!request.CreatedByAdmin)
        {
            var sameDayContactReservations = await _db.Reservations
                .Where(x => x.ReservedDate == request.ReservedDate)
                .Select(x => new Reservation
                {
                    Email = x.Email,
                    Phone = x.Phone,
                    Status = x.Status,
                    EmailConfirmedAtUtc = x.EmailConfirmedAtUtc,
                    IsNoShow = x.IsNoShow
                })
                .ToListAsync();

            var matchingContactReservationCount = sameDayContactReservations.Count(x =>
                IsActiveReservationForDailyLimit(x) &&
                ((!string.IsNullOrWhiteSpace(normalizedEmail) && (x.Email ?? string.Empty).ToLowerInvariant() == normalizedEmail) ||
                (!string.IsNullOrWhiteSpace(normalizedPhone) && NormalizePhoneForLimit(x.Phone) == normalizedPhone)));

            if (matchingContactReservationCount >= PublicDailyContactReservationLimit)
            {
                return StatusCode(StatusCodes.Status429TooManyRequests, new
                {
                    message = "You can make up to 2 reservations per day with the same email or phone."
                });
            }
        }

        var conflict = await _reservationConflictService.FindTableConflictAsync(request.ReservedDate, request.ReservedTime, tableIds);

        if (conflict != null)
        {
            return Conflict(ReservationConflictService.ToConflictResponse(conflict));
        }

        var hasConfirmedReservationWithEmail = !string.IsNullOrWhiteSpace(normalizedEmail) &&
            await _db.Reservations.AnyAsync(x =>
                (x.Email ?? string.Empty).ToLower() == normalizedEmail &&
                (x.Status == ReservationStatusApproved ||
                    x.Status == ReservationStatusReleased ||
                    x.IsArrived ||
                    x.EmailConfirmedAtUtc != null));
        var requiresEmailConfirmation = !request.CreatedByAdmin && !hasConfirmedReservationWithEmail;
        var confirmationToken = requiresEmailConfirmation ? CreateEmailConfirmationToken() : null;

        var reservation = new Reservation
        {
            GuestName = guestName,
            Phone = phone,
            Email = email,
            GuestCount = request.GuestCount,
            Area = string.IsNullOrWhiteSpace(request.Area) ? "indoor" : request.Area.Trim(),
            ReservedDate = request.ReservedDate,
            ReservedTime = request.ReservedTime,
            BirthDate = request.BirthDate,
            MarketingConsent = request.MarketingConsent,
            PrivacyConsent = request.CreatedByAdmin || request.PrivacyConsent,
            Notes = request.Notes,
            Status = requiresEmailConfirmation ? ReservationStatusAwaitingEmailConfirmation : ReservationStatusApproved,
            CreatedAtUtc = DateTime.UtcNow,
            CreatedByAdmin = request.CreatedByAdmin,
            CreatedByAdminUserId = request.CreatedByAdmin ? AdminAuthService.Current(HttpContext)?.Id : null,
            CreatedByAdminName = request.CreatedByAdmin ? AdminAuthService.Current(HttpContext)?.Name : null,
            InternalNote = request.InternalNote,
            EmailConfirmationTokenHash = confirmationToken == null ? null : HashToken(confirmationToken),
            EmailConfirmationExpiresAtUtc = confirmationToken == null ? null : DateTime.UtcNow.AddDays(2),
            EmailConfirmedAtUtc = requiresEmailConfirmation ? null : DateTime.UtcNow,
            Tables = tableIds.Select(id => new ReservationTable
            {
                TableCode = id
            }).ToList()
        };

        _db.Reservations.Add(reservation);
        await _db.SaveChangesAsync();

        if (!requiresEmailConfirmation)
        {
            await UpsertCustomerProfileForConfirmedReservationAsync(reservation);
            await MarkReservationBlacklistFlagAsync(reservation);
            await _db.SaveChangesAsync();
            _ = SendAdminReservationEmailAsync(reservation);
        }

        if (requiresEmailConfirmation && confirmationToken != null)
        {
            _ = SendReservationConfirmationEmailAsync(reservation, confirmationToken);
        }

        return Ok(new
        {
            reservation.Id,
            reservation.GuestName,
            reservation.Phone,
            reservation.Email,
            reservation.GuestCount,
            reservation.Area,
            reservation.ReservedDate,
            reservation.ReservedTime,
            reservation.BirthDate,
            reservation.MarketingConsent,
            reservation.PrivacyConsent,
            reservation.Notes,
            reservation.Status,
            RequiresEmailConfirmation = requiresEmailConfirmation,
            IsReturningCustomer = !requiresEmailConfirmation && !request.CreatedByAdmin && hasConfirmedReservationWithEmail,
            Message = requiresEmailConfirmation
                ? "Please confirm your reservation from the email we sent."
                : !request.CreatedByAdmin && hasConfirmedReservationWithEmail
                    ? $"Добре дошли отново, {reservation.GuestName}! Вашата резервация е автоматично потвърдена, защото вече сте клиент на нашия ресторант."
                    : "Reservation confirmed.",
            reservation.CreatedAtUtc,
            TableIds = reservation.Tables.Select(t => t.TableCode).ToList()
        });
    }

    [HttpPost("walk-in")]
    [AdminAuthorize]
    public async Task<IActionResult> CreateWalkIn([FromBody] CreateWalkInReservationRequest request)
    {
        var admin = AdminAuthService.Current(HttpContext);
        if (admin == null)
            return Unauthorized(new { message = "Admin session is required." });

        var tableIds = ReservationConflictService.NormalizeTableIds(request.TableIds);
        if (tableIds.Count == 0)
            return BadRequest(new { message = "At least one table must be selected." });

        var guestCount = Math.Clamp(request.GuestCount <= 0 ? 2 : request.GuestCount, 1, 40);
        if (!TableCapacityService.HasEnoughSeats(tableIds, guestCount))
            return BadRequest(new { message = "Selected tables do not have enough seats." });

        var now = GetRestaurantNow();
        var openingTime = new TimeOnly(10, 0);
        var latestWalkInTime = new TimeOnly(23, 30);
        var currentTime = TimeOnly.FromDateTime(now);

        if (currentTime < openingTime || currentTime > latestWalkInTime)
        {
            return BadRequest(new
            {
                message = "Walk-in seating is available only during restaurant working hours: 10:00-23:30."
            });
        }

        var reservedDate = DateOnly.FromDateTime(now);
        var reservedTime = $"{now.Hour:00}:{now.Minute:00}";
        var conflict = await _reservationConflictService.FindTableConflictAsync(reservedDate, reservedTime, tableIds);

        if (conflict != null)
            return Conflict(ReservationConflictService.ToConflictResponse(conflict));

        var nextReservation = await _db.Reservations
            .Include(x => x.Tables)
            .Where(x =>
                x.ReservedDate == reservedDate &&
                x.Status != ReservationStatusCancelled &&
                x.Status != ReservationStatusReleased &&
                !x.IsNoShow &&
                !x.IsArrived &&
                x.Tables.Any(t => tableIds.Contains(t.TableCode)))
            .ToListAsync();

        var tooSoonReservation = nextReservation
            .Select(x => new
            {
                Reservation = x,
                Time = TimeOnly.TryParse(x.ReservedTime, out var parsedTime) ? parsedTime : (TimeOnly?)null
            })
            .Where(x => x.Time.HasValue)
            .Select(x => new
            {
                x.Reservation,
                Minutes = (x.Reservation.ReservedDate.ToDateTime(x.Time!.Value) - now).TotalMinutes
            })
            .Where(x => x.Minutes > 0 && x.Minutes <= 90)
            .OrderBy(x => x.Minutes)
            .FirstOrDefault();

        if (tooSoonReservation != null)
        {
            return Conflict(new
            {
                message = $"Walk-in seating is blocked because the next reservation starts in {Math.Ceiling(tooSoonReservation.Minutes)} minutes."
            });
        }

        var reservation = new Reservation
        {
            GuestName = "Walk-in",
            Phone = string.Empty,
            Email = string.Empty,
            GuestCount = guestCount,
            Area = string.IsNullOrWhiteSpace(request.Area) ? "indoor" : request.Area.Trim(),
            ReservedDate = reservedDate,
            ReservedTime = reservedTime,
            Status = ReservationStatusApproved,
            CreatedAtUtc = DateTime.UtcNow,
            CreatedByAdmin = true,
            CreatedByAdminUserId = admin.Id,
            CreatedByAdminName = admin.Name,
            IsWalkIn = true,
            IsArrived = true,
            PrivacyConsent = true,
            InternalNote = string.IsNullOrWhiteSpace(request.InternalNote)
                ? "Walk-in guest seated without customer details."
                : request.InternalNote.Trim(),
            OrderAccessToken = CreateOrderAccessToken(),
            EmailConfirmedAtUtc = DateTime.UtcNow,
            Tables = tableIds.Select(id => new ReservationTable { TableCode = id }).ToList()
        };

        _db.Reservations.Add(reservation);
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "walk-in", "Reservation", reservation.Id.ToString(), after: new
        {
            reservation.Id,
            reservation.Area,
            reservation.GuestCount,
            TableIds = tableIds,
            CreatedBy = admin.Name
        });

        return Ok(new
        {
            reservation.Id,
            reservation.GuestName,
            reservation.GuestCount,
            reservation.Area,
            reservation.ReservedDate,
            reservation.ReservedTime,
            reservation.Status,
            reservation.IsWalkIn,
            reservation.IsArrived,
            TableIds = reservation.Tables.Select(t => t.TableCode).ToList()
        });
    }

    [HttpGet("confirm")]
    public async Task<IActionResult> ConfirmByEmail([FromQuery] string token)
    {
        if (string.IsNullOrWhiteSpace(token))
            return BadRequest(new { message = "Confirmation token is required." });

        var tokenHash = HashToken(token.Trim());
        var reservation = await _db.Reservations
            .Include(x => x.Tables)
            .FirstOrDefaultAsync(x => x.EmailConfirmationTokenHash == tokenHash);

        if (reservation == null)
            return NotFound(new { message = "Confirmation link is invalid." });

        if (reservation.Status == ReservationStatusCancelled)
            return BadRequest(new { message = "This reservation was cancelled." });

        if (reservation.EmailConfirmationExpiresAtUtc.HasValue &&
            reservation.EmailConfirmationExpiresAtUtc.Value < DateTime.UtcNow &&
            reservation.EmailConfirmedAtUtc == null)
        {
            return BadRequest(new { message = "Confirmation link has expired. Please make a new reservation or call us." });
        }

        if (reservation.Status != ReservationStatusApproved)
        {
            var tableIds = reservation.Tables.Select(t => t.TableCode).ToList();
            var conflict = await _reservationConflictService.FindTableConflictAsync(
                reservation.ReservedDate,
                reservation.ReservedTime,
                tableIds,
                reservation.Id);

            if (conflict != null)
            {
                return Conflict(ReservationConflictService.ToConflictResponse(conflict));
            }

            reservation.Status = ReservationStatusApproved;
        }

        reservation.IsNoShow = false;
        reservation.EmailConfirmedAtUtc ??= DateTime.UtcNow;
        reservation.EmailConfirmationTokenHash = null;
        reservation.EmailConfirmationExpiresAtUtc = null;
        await UpsertCustomerProfileForConfirmedReservationAsync(reservation);
        await MarkReservationBlacklistFlagAsync(reservation);
        await _db.SaveChangesAsync();
        _ = SendAdminReservationEmailAsync(reservation);

        return Ok(new
        {
            message = "Reservation confirmed.",
            reservation.Id,
            reservation.GuestName,
            reservation.ReservedDate,
            reservation.ReservedTime,
            TableIds = reservation.Tables.Select(t => t.TableCode).ToList()
        });
    }

    [HttpPatch("{id}/approve")]
    [AdminAuthorize]
    public async Task<IActionResult> Approve(int id)
    {
        var reservation = await _db.Reservations
            .Include(x => x.Tables)
            .FirstOrDefaultAsync(x => x.Id == id);

        if (reservation == null)
            return NotFound();

        var tableIds = reservation.Tables.Select(t => t.TableCode).ToList();

        var conflict = await _reservationConflictService.FindTableConflictAsync(
            reservation.ReservedDate,
            reservation.ReservedTime,
            tableIds,
            id);

        if (conflict != null)
        {
            return Conflict(ReservationConflictService.ToConflictResponse(conflict));
        }

        reservation.Status = "Approved";
        reservation.IsNoShow = false;
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "approve", "Reservation", reservation.Id.ToString(), after: new { reservation.Id, reservation.Status });

        if (!string.IsNullOrWhiteSpace(reservation.Email))
{
    await _emailService.SendAsync(
        reservation.Email,
        "Вашата резервация е потвърдена · Casa di Fratelli",
        $"""
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
          <h2>Вашата резервация е потвърдена</h2>
          <p>Здравейте, {reservation.GuestName},</p>
          <p>С радост потвърждаваме Вашата резервация в <strong>Casa di Fratelli</strong>.</p>
          <p><strong>Дата:</strong> {reservation.ReservedDate}</p>
          <p><strong>Час:</strong> {reservation.ReservedTime}</p>
          <p><strong>Маси:</strong> {string.Join(", ", reservation.Tables.Select(t => t.TableCode))}</p>
          <p>Очакваме Ви!</p>
          <p style="color:#6b7280">Ако закъснеете с повече от 15 минути, резервацията може да бъде освободена.</p>
        </div>
        """
    );
}

        return Ok(new
        {
            reservation.Id,
            reservation.Status
        });
    }

    [HttpPatch("{id}/arrive")]
    [AdminAuthorize]
    public async Task<IActionResult> MarkArrived(int id)
    {
        var reservation = await _db.Reservations
            .Include(x => x.Tables)
            .FirstOrDefaultAsync(x => x.Id == id);

        if (reservation == null)
            return NotFound();

        if (reservation.Status == "Cancelled")
            return BadRequest("Cancelled reservations cannot be marked as arrived.");

        reservation.Status = "Approved";
        reservation.IsArrived = true;
        reservation.IsNoShow = false;
        reservation.OrderAccessToken ??= CreateOrderAccessToken();
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "arrive", "Reservation", reservation.Id.ToString(), after: new { reservation.Id, reservation.Status, reservation.IsArrived });

        if (!string.IsNullOrWhiteSpace(reservation.Email))
        {
            var menuUrl = $"{GetFrontendUrl()}/menu?reservation={reservation.Id}&token={Uri.EscapeDataString(reservation.OrderAccessToken)}";

            await _emailService.SendAsync(
                reservation.Email,
                "Можете да поръчате от дигиталното меню · Casa di Fratelli",
                $"""
                <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
                  <h2>Добре дошли в Casa di Fratelli</h2>
                  <p>Здравейте, {reservation.GuestName},</p>
                  <p>Можете да разгледате дигиталното ни меню и да изпратите поръчка директно от телефона си, без да чакате сервитьор.</p>
                  <p><strong>Маса:</strong> {string.Join(", ", reservation.Tables.Select(t => t.TableCode))}</p>
                  <p>
                    <a href="{menuUrl}" style="display:inline-block;background:#c9a56a;color:#111827;padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:700">
                      Отвори дигиталното меню
                    </a>
                  </p>
                  <p style="color:#6b7280">Ако имате въпроси или специални желания, нашият екип е на разположение.</p>
                </div>
                """
            );
        }

        return Ok(new
        {
            reservation.Id,
            reservation.Status,
            reservation.IsArrived,
            reservation.IsNoShow
        });
    }

    [HttpPatch("{id}/no-show")]
    [AdminAuthorize]
    public async Task<IActionResult> MarkNoShow(int id)
    {
        var reservation = await _db.Reservations.FindAsync(id);

        if (reservation == null)
            return NotFound();

        reservation.Status = "Cancelled";
        reservation.IsArrived = false;
        reservation.IsNoShow = true;
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "no-show", "Reservation", reservation.Id.ToString(), after: new { reservation.Id, reservation.Status, reservation.IsNoShow });

        return Ok(new
        {
            reservation.Id,
            reservation.Status,
            reservation.IsArrived,
            reservation.IsNoShow
        });
    }

    [HttpPatch("{id}/tables")]
    [AdminAuthorize]
    public async Task<IActionResult> UpdateTables(int id, [FromBody] UpdateReservationTablesRequest request)
    {
        var reservation = await _db.Reservations
            .Include(x => x.Tables)
            .FirstOrDefaultAsync(x => x.Id == id);

        if (reservation == null)
            return NotFound();

        if (reservation.Status == "Cancelled")
            return BadRequest("Cancelled reservations cannot be moved.");

        var tableIds = ReservationConflictService.NormalizeTableIds(request.TableIds);

        if (tableIds.Count == 0)
            return BadRequest("At least one valid table must be selected.");

        var nextGuestCount = request.GuestCount ?? reservation.GuestCount;
        if (nextGuestCount <= 0)
            return BadRequest("Invalid guests.");

        var nextReservedDate = request.ReservedDate ?? reservation.ReservedDate;
        var nextReservedTime = string.IsNullOrWhiteSpace(request.ReservedTime)
            ? reservation.ReservedTime
            : request.ReservedTime.Trim();

        var changesReservationTime = request.ReservedDate.HasValue || !string.IsNullOrWhiteSpace(request.ReservedTime);
        if (changesReservationTime && IsPastReservationTime(nextReservedDate, nextReservedTime))
            return BadRequest("Reservation date or time has already passed.");

        if (!TableCapacityService.HasEnoughSeats(tableIds, nextGuestCount))
            return BadRequest("Selected tables do not have enough seats.");

        var conflict = await _reservationConflictService.FindTableConflictAsync(
            nextReservedDate,
            nextReservedTime,
            tableIds,
            id);

        if (conflict != null)
            return Conflict(ReservationConflictService.ToConflictResponse(conflict));

        var beforeTables = new
        {
            reservation.Area,
            reservation.GuestCount,
            reservation.ReservedDate,
            reservation.ReservedTime,
            TableIds = reservation.Tables.Select(t => t.TableCode).ToList()
        };

        _db.ReservationTables.RemoveRange(reservation.Tables);
        reservation.Tables = tableIds.Select(tableId => new ReservationTable
        {
            TableCode = tableId,
            ReservationId = reservation.Id
        }).ToList();

        if (!string.IsNullOrWhiteSpace(request.Area))
            reservation.Area = request.Area.Trim();

        if (request.GuestCount.HasValue)
            reservation.GuestCount = request.GuestCount.Value;

        reservation.ReservedDate = nextReservedDate;
        reservation.ReservedTime = nextReservedTime;

        await _db.SaveChangesAsync();
        var nextTableLabel = string.Join(", ", reservation.Tables.Select(t => t.TableCode));
        await _db.DiningOrders
            .Where(order => order.ReservationId == reservation.Id)
            .ExecuteUpdateAsync(setters => setters.SetProperty(order => order.TableLabel, nextTableLabel));
        await _audit.RecordAsync(HttpContext, "move-tables", "Reservation", reservation.Id.ToString(), beforeTables, new
        {
            reservation.Area,
            reservation.GuestCount,
            reservation.ReservedDate,
            reservation.ReservedTime,
            TableIds = reservation.Tables.Select(t => t.TableCode).ToList()
        });

        return Ok(new
        {
            reservation.Id,
            reservation.Area,
            reservation.GuestCount,
            reservation.ReservedDate,
            reservation.ReservedTime,
            TableIds = reservation.Tables.Select(t => t.TableCode).ToList()
        });
    }

    [HttpPatch("{id}/note")]
    [AdminAuthorize]
    public async Task<IActionResult> UpdateNote(int id, [FromBody] UpdateReservationNoteRequest request)
    {
        var reservation = await _db.Reservations.FindAsync(id);

        if (reservation == null)
            return NotFound();

        var beforeNote = reservation.InternalNote;
        reservation.InternalNote = string.IsNullOrWhiteSpace(request.InternalNote)
            ? null
            : request.InternalNote.Trim();

        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "update-note", "Reservation", reservation.Id.ToString(), new { InternalNote = beforeNote }, new { reservation.InternalNote });

        return Ok(new
        {
            reservation.Id,
            reservation.InternalNote
        });
    }

    [HttpPost("block")]
    [AdminAuthorize]
    public async Task<IActionResult> BlockTables([FromBody] CreateHallBlockRequest request)
    {
        var tableIds = ReservationConflictService.NormalizeTableIds(request.TableIds);
        var times = ReservationConflictService.NormalizeTimes(request.Times);

        if (tableIds.Count == 0)
            return BadRequest("At least one table must be selected.");

        if (times.Count == 0)
            return BadRequest("At least one time must be selected.");

        foreach (var time in times)
        {
            var conflict = await _reservationConflictService.FindTableConflictAsync(request.ReservedDate, time, tableIds);
            if (conflict != null)
                return Conflict(ReservationConflictService.ToConflictResponse(conflict));
        }

        var note = string.IsNullOrWhiteSpace(request.Note)
            ? "Admin block"
            : request.Note.Trim();

        var blockTime = times.Count == 1
            ? times[0]
            : $"{times.First()} - {times.Last()}";

        var block = new Reservation
        {
            GuestName = "Admin block",
            Phone = "admin",
            Email = string.Empty,
            GuestCount = 0,
            Area = string.IsNullOrWhiteSpace(request.Area) ? "all" : request.Area.Trim(),
            ReservedDate = request.ReservedDate,
            ReservedTime = blockTime,
            Notes = note,
            InternalNote = "Hall/table block created from admin panel.",
            Status = "Approved",
            CreatedAtUtc = DateTime.UtcNow,
            CreatedByAdmin = true,
            Tables = tableIds.Select(tableId => new ReservationTable
            {
                TableCode = tableId
            }).ToList()
        };

        _db.Reservations.Add(block);
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "block-hall", "Reservation", block.Id.ToString(), after: new { block.ReservedDate, block.ReservedTime, TableIds = tableIds });

        return Ok(new
        {
            Created = 1,
            request.ReservedDate,
            Times = times,
            TableIds = tableIds
        });
    }

    [HttpPatch("{id}/release")]
    [AdminAuthorize]
    public async Task<IActionResult> Release(int id)
    {
        var reservation = await _db.Reservations
            .Include(x => x.Tables)
            .FirstOrDefaultAsync(x => x.Id == id);

        if (reservation == null)
            return NotFound();

        reservation.Status = "Released";
        reservation.IsArrived = false;
        reservation.IsNoShow = false;
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "release", "Reservation", reservation.Id.ToString(), after: new { reservation.Id, reservation.Status });
        await SendThankYouEmailAsync(reservation);

        return Ok(new
        {
            reservation.Id,
            reservation.Status,
            reservation.IsArrived,
            reservation.IsNoShow
        });
    }

    [HttpPatch("{id}/cancel")]
    [AdminAuthorize]
    public async Task<IActionResult> Cancel(int id)
    {
        var reservation = await _db.Reservations
        .Include(x => x.Tables)
        .FirstOrDefaultAsync(x => x.Id == id);

        if (reservation == null)
            return NotFound();

        reservation.Status = "Cancelled";
        reservation.IsArrived = false;
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "cancel", "Reservation", reservation.Id.ToString(), after: new { reservation.Id, reservation.Status });

        if (!string.IsNullOrWhiteSpace(reservation.Email))
{
    await _emailService.SendAsync(
        reservation.Email,
        "Вашата резервация е отменена · Casa di Fratelli",
        $"""
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
          <h2>Вашата резервация е отменена</h2>
          <p>Здравейте, {reservation.GuestName},</p>
          <p>Информираме Ви, че резервацията Ви в <strong>Casa di Fratelli</strong> беше отменена.</p>
          <p><strong>Дата:</strong> {reservation.ReservedDate}</p>
          <p><strong>Час:</strong> {reservation.ReservedTime}</p>
          <p>Ако желаете, можете да направите нова резервация през сайта.</p>
        </div>
        """
    );
}

        return Ok(new
        {
            reservation.Id,
            reservation.Status
        });
    }
}
