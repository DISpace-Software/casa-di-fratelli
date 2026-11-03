using System.Data;
using System.Security.Cryptography;
using System.Text.Json;
using SeatMap.Api.Data;
using SeatMap.Api.Dtos;
using SeatMap.Api.Models;
using SeatMap.Api.Services.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace SeatMap.Api.Services.Reservations;

// Shared booking use cases. Tenant routing and caller authentication happen
// before invoking this service; no Controller, HttpContext or MVC result is used.
public sealed class ReservationBookingService(
    AppDbContext db,
    ReservationConflictService conflicts,
    RestaurantClosureService closures,
    SeasonalZoneService seasonalZones,
    TenantBrandingService branding,
    IReservationBookingNotifications notifications,
    TimeProvider time,
    ILogger<ReservationBookingService> logger)
{
    private const int PublicDailyContactReservationLimit = 2;
    private const string ReservationStatusAwaitingEmailConfirmation = "AwaitingEmailConfirmation";
    private const string ReservationStatusPending = "Pending";
    private const string ReservationStatusApproved = "Approved";
    private const string ReservationStatusCancelled = "Cancelled";
    private const string ReservationStatusReleased = "Released";
    private readonly AppDbContext _db = db;
    private readonly ReservationConflictService _reservationConflictService = conflicts;
    private readonly RestaurantClosureService _closures = closures;
    private readonly SeasonalZoneService _seasonalZones = seasonalZones;
    private readonly IReservationBookingNotifications _notifications = notifications;
    private readonly TimeProvider _time = time;
    private sealed record TableLayoutCapacityItem(string? Id, int Seats, bool IsActive);

    public async Task<ReservationBookingResult> CreateAsync(CreateReservationRequest request, AdminPrincipal? administrator = null)
    {
        var brand = await branding.GetAsync();
        var now = ReservationTimeRules.GetRestaurantNow(brand, _time);
        if (request.CreatedByAdmin && administrator == null)
            return ReservationBookingResult.Unauthorized(new { message = "Admin password is required." });

        if (string.IsNullOrWhiteSpace(request.GuestName))
            return ReservationBookingResult.Invalid("Guest name is required.");

        if (string.IsNullOrWhiteSpace(request.Phone))
            return ReservationBookingResult.Invalid("Phone is required.");

        if (!request.CreatedByAdmin && string.IsNullOrWhiteSpace(request.Email))
            return ReservationBookingResult.Invalid("Email is required.");

        if (request.GuestCount <= 0)
            return ReservationBookingResult.Invalid("Invalid guests.");

        if (request.TableIds is null || request.TableIds.Count == 0)
            return ReservationBookingResult.Invalid("At least one table must be selected.");

        if (!request.CreatedByAdmin && !request.PrivacyConsent)
            return ReservationBookingResult.Invalid("Privacy policy consent is required.");

        if (ReservationTimeRules.IsPast(request.ReservedDate, request.ReservedTime, now))
            return ReservationBookingResult.Invalid("Reservation date or time has already passed.");

        if (!request.CreatedByAdmin)
        {
            var closure = await _closures.GetAsync();
            if (RestaurantClosureService.Contains(closure, request.ReservedDate))
            {
                return ReservationBookingResult.Conflict(new
                {
                    message = $"Ресторантът е затворен до {closure.EndDate:dd.MM.yyyy}. Резервации се приемат от {closure.ReopenDate:dd.MM.yyyy}.",
                    code = "RESTAURANT_CLOSED",
                    closure.ReopenDate
                });
            }
        }

        if (!ReservationTimeRules.IsAllowed(request.ReservedTime, request.CreatedByAdmin, brand))
            return ReservationBookingResult.Invalid(request.CreatedByAdmin
                ? $"Admin reservations are available until {brand.AdminLatestReservationTime}."
                : $"Online reservations are available until {brand.PublicLatestReservationTime}. For a later time, please call {brand.Phone}.");

        if (!request.CreatedByAdmin && ReservationTimeRules.IsTooSoon(request.ReservedDate, request.ReservedTime, now, brand.PublicLeadMinutes))
            return ReservationBookingResult.Invalid($"Online reservations must be made at least {brand.PublicLeadMinutes} minutes before the selected time.");

        var today = DateOnly.FromDateTime(now);
        if (!request.CreatedByAdmin && request.ReservedDate > today.AddDays(brand.PublicMaxReservationDaysAhead))
            return ReservationBookingResult.Invalid($"Online reservations are available up to {brand.PublicMaxReservationDaysAhead} days ahead. For a later date, please call {brand.Phone}.");

        var guestName = request.GuestName.Trim();
        var phone = request.Phone.Trim();
        var email = string.IsNullOrWhiteSpace(request.Email) ? string.Empty : request.Email.Trim();
        var normalizedEmail = email.ToLowerInvariant();
        var normalizedPhone = NormalizePhoneForLimit(phone);

        var tableIds = ReservationConflictService.NormalizeTableIds(request.TableIds);
        if (await _seasonalZones.IsSelectionClosedAsync(request.Area, tableIds))
            return ReservationBookingResult.Conflict(new { message = "Тази зона е затворена за сезона. Моля, изберете друга зона.", code = "ZONE_SEASONALLY_CLOSED" });


        if (tableIds.Count == 0)
            return ReservationBookingResult.Invalid("At least one valid table must be selected.");

        if (!request.CreatedByAdmin && request.GuestCount >= 9)
            return ReservationBookingResult.Invalid($"For 9 or more guests, please call {brand.Phone} so the host can arrange the best table.");

        if (!request.CreatedByAdmin && tableIds.Count != 1)
            return ReservationBookingResult.Invalid($"Online reservations can use one table only. For larger groups, please call {brand.Phone}.");

        if (!request.CreatedByAdmin && await GetTableCapacityAsync(tableIds) < request.GuestCount)
            return ReservationBookingResult.Invalid($"For this number of guests, please call {brand.Phone} so the host can arrange the best table.");

        if (!request.CreatedByAdmin)
        {
            var holdsForDate = await _db.PublicTableHolds
                .AsNoTracking()
                .Where(x => x.ReservedDate == request.ReservedDate)
                .Select(x => x.TableIdsJson)
                .ToListAsync();
            var heldTableIds = holdsForDate
                .SelectMany(PublicTableHoldSelection.DeserializeTableIds)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            if (tableIds.Any(heldTableIds.Contains))
                return ReservationBookingResult.Conflict(new { message = "The selected table is reserved for restaurant use on this date. Please choose another table." });
        }

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
                return ReservationBookingResult.RateLimited(new
                {
                    message = "You can make up to 2 reservations per day with the same email or phone."
                });
            }
        }

        var conflict = await _reservationConflictService.FindTableConflictAsync(request.ReservedDate, request.ReservedTime, tableIds, includeHallBlocks: !request.CreatedByAdmin);

        if (conflict != null)
        {
            return ReservationBookingResult.Conflict(ReservationConflictService.ToConflictResponse(conflict));
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
            CreatedAtUtc = _time.GetUtcNow().UtcDateTime,
            CreatedByAdmin = request.CreatedByAdmin,
            CreatedByAdminUserId = request.CreatedByAdmin ? administrator?.Id : null,
            CreatedByAdminName = request.CreatedByAdmin ? administrator?.Name : null,
            InternalNote = request.CreatedByAdmin ? request.InternalNote : null,
            EmailConfirmationTokenHash = confirmationToken == null ? null : HashToken(confirmationToken),
            EmailConfirmationExpiresAtUtc = confirmationToken == null ? null : _time.GetUtcNow().UtcDateTime.AddDays(2),
            EmailConfirmedAtUtc = requiresEmailConfirmation ? null : _time.GetUtcNow().UtcDateTime,
            Tables = tableIds.Select(id => new ReservationTable
            {
                TableCode = id
            }).ToList()
        };

        _db.Reservations.Add(reservation);
        if (!requiresEmailConfirmation)
        {
            await UpsertCustomerProfileForConfirmedReservationAsync(reservation);
            await MarkReservationBlacklistFlagAsync(reservation);
        }

        // One SaveChanges commits the booking, table links and CRM changes atomically.
        await _db.SaveChangesAsync();
        if (!requiresEmailConfirmation && !request.CreatedByAdmin)
            await TryNotifyAsync(() => _notifications.NotifyConfirmedAsync(reservation), reservation.Id);
        if (requiresEmailConfirmation && confirmationToken != null)
            await TryNotifyAsync(() => _notifications.SendConfirmationAsync(reservation, confirmationToken), reservation.Id);

        return ReservationBookingResult.Success(new
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

    public async Task<ReservationBookingResult> ConfirmByEmailAsync(string token)
    {
        if (string.IsNullOrWhiteSpace(token))
            return ReservationBookingResult.Invalid(new { message = "Confirmation token is required." });

        var tokenHash = HashToken(token.Trim());
        var reservation = await _db.Reservations
            .Include(x => x.Tables)
            .FirstOrDefaultAsync(x => x.EmailConfirmationTokenHash == tokenHash);

        if (reservation == null)
            return ReservationBookingResult.NotFound(new { message = "Confirmation link is invalid." });

        if (reservation.Status == ReservationStatusCancelled)
            return ReservationBookingResult.Invalid(new { message = "This reservation was cancelled." });

        if (reservation.EmailConfirmationExpiresAtUtc.HasValue &&
            reservation.EmailConfirmationExpiresAtUtc.Value < _time.GetUtcNow().UtcDateTime &&
            reservation.EmailConfirmedAtUtc == null)
        {
            return ReservationBookingResult.Invalid(new { message = "Confirmation link has expired. Please make a new reservation or call us." });
        }

        if (reservation.Status != ReservationStatusApproved)
        {
            var tableIds = reservation.Tables.Select(t => t.TableCode).ToList();
            var conflict = await _reservationConflictService.FindTableConflictAsync(
                reservation.ReservedDate,
                reservation.ReservedTime,
                tableIds,
                reservation.Id, includeHallBlocks: false);

            if (conflict != null)
            {
                return ReservationBookingResult.Conflict(ReservationConflictService.ToConflictResponse(conflict));
            }

            reservation.Status = ReservationStatusApproved;
        }

        reservation.IsNoShow = false;
        reservation.EmailConfirmedAtUtc ??= _time.GetUtcNow().UtcDateTime;
        reservation.EmailConfirmationTokenHash = null;
        reservation.EmailConfirmationExpiresAtUtc = null;
        await UpsertCustomerProfileForConfirmedReservationAsync(reservation);
        await MarkReservationBlacklistFlagAsync(reservation);
        await _db.SaveChangesAsync();
        await TryNotifyAsync(() => _notifications.NotifyConfirmedAsync(reservation), reservation.Id);

        return ReservationBookingResult.Success(new
        {
            message = "Reservation confirmed.",
            reservation.Id,
            reservation.GuestName,
            reservation.ReservedDate,
            reservation.ReservedTime,
            TableIds = reservation.Tables.Select(t => t.TableCode).ToList()
        });
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

    private async Task<int> GetTableCapacityAsync(List<string> tableIds)
    {
        if (tableIds.Count == 0) return 0;

        try
        {
            var connection = _db.Database.GetDbConnection();
            if (connection.State != ConnectionState.Open)
            {
                await connection.OpenAsync();
            }

            await using var command = connection.CreateCommand();
            command.CommandText = """SELECT "LayoutJson" FROM "TableLayouts" WHERE "Id" = 1;""";
            var rawJson = await command.ExecuteScalarAsync() as string;

            if (!string.IsNullOrWhiteSpace(rawJson))
            {
                var layout = JsonSerializer.Deserialize<List<TableLayoutCapacityItem>>(rawJson, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

                if (layout?.Count > 0)
                {
                    var capacityById = layout
                        .Where(item =>
                            item.IsActive &&
                            !string.IsNullOrWhiteSpace(item.Id) &&
                            !TableCapacityService.IsRetired(item.Id))
                        .GroupBy(item => item.Id!.Trim(), StringComparer.OrdinalIgnoreCase)
                        .ToDictionary(group => group.Key, group => group.First().Seats, StringComparer.OrdinalIgnoreCase);

                    return tableIds.Sum(tableId =>
                        capacityById.TryGetValue(tableId, out var capacity)
                            ? capacity
                            : TableCapacityService.GetCapacity(new[] { tableId }));
                }
            }
        }
        catch
        {
            // Table layout storage is optional; old static capacities keep reservations working.
        }

        return TableCapacityService.GetCapacity(tableIds);
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
                FirstReservationAtUtc = _time.GetUtcNow().UtcDateTime,
                LastReservationAtUtc = _time.GetUtcNow().UtcDateTime
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
        customer.LastReservationAtUtc = _time.GetUtcNow().UtcDateTime;

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

    private async Task TryNotifyAsync(Func<Task> notify, int reservationId)
    {
        try { await notify(); }
        catch (Exception error)
        {
            // Persistence has succeeded. A transport failure must not turn the
            // booking into an HTTP failure and encourage a duplicate submission.
            logger.LogError(error, "Booking notification failed. ReservationId={ReservationId}", reservationId);
        }
    }
}
