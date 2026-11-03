using SeatMap.Api.Services.FloorPlans;
using Microsoft.AspNetCore.Mvc.Filters;
using SeatMap.Api.Data;
using SeatMap.Api.Dtos;
using SeatMap.Api.Models;
using SeatMap.Api.Filters;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SeatMap.Api.Services;
using System.Net;
using System.Security.Cryptography;
using SeatMap.Api.Services.Tenancy;
using SeatMap.Api.Services.Reservations;

namespace SeatMap.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ReservationsController : ControllerBase, IAsyncActionFilter
{
    private int PublicMaxReservationDaysAhead => _brand.PublicMaxReservationDaysAhead;
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
    private readonly ProductTierService _tiers;
    private readonly SeasonalZoneService _seasonalZones;
    private readonly VisitFeedbackEmailService _visitFeedback;
    private readonly ICurrentTenant _currentTenant;
    private readonly TenantBrandingService _branding;
    private readonly ReservationBookingService _booking;
    private TenantBrandingSettings _brand = new();
    private string HtmlRestaurantName => WebUtility.HtmlEncode(_brand.Name);

    async Task IAsyncActionFilter.OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        _brand = await _branding.GetAsync();
        await next();
    }


    public ReservationsController(
        AppDbContext db,
        EmailService emailService,
        IConfiguration configuration,
        ReservationConflictService reservationConflictService,
        AdminAuthService adminAuth,
        AuditService audit,
        ProductTierService tiers,
        ICurrentTenant currentTenant,
        TenantBrandingService branding,
        ReservationBookingService booking,
        VisitFeedbackEmailService? visitFeedback = null)
    {
        _db = db;
        _seasonalZones = new SeasonalZoneService(db, new FloorPlanService(db, currentTenant));
        _emailService = emailService;
        _configuration = configuration;
        _reservationConflictService = reservationConflictService;
        _adminAuth = adminAuth;
        _audit = audit;
        _tiers = tiers;
        _booking = booking;
        _currentTenant = currentTenant;
        _branding = branding;
        _visitFeedback = visitFeedback ?? new VisitFeedbackEmailService(db, emailService, branding);
    }

    private DateTime GetRestaurantNow() => ReservationTimeRules.GetRestaurantNow(_brand, TimeProvider.System);

    private bool IsPastReservationTime(DateOnly reservedDate, string reservedTime) =>
        ReservationTimeRules.IsPast(reservedDate, reservedTime, GetRestaurantNow());

    private bool IsReservationTimeAllowed(string reservedTime, bool createdByAdmin) =>
        ReservationTimeRules.IsAllowed(reservedTime, createdByAdmin, _brand);

    private static string CreateOrderAccessToken()
    {
        return Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant();
    }

    private string GetFrontendUrl() => RestaurantPublicLinks.GetFrontendUrl(_currentTenant, _configuration);

    [HttpGet]
    [AdminAuthorize]
    public async Task<IActionResult> GetAll()
    {
        var admin = AdminAuthService.Current(HttpContext);
        var role = AdminRoleAccess.Normalize(admin?.Role);

        var query = _db.Reservations
            .Include(x => x.Tables)
            .Where(x =>
                x.Status != ReservationStatusAwaitingEmailConfirmation &&
                !(x.Status == ReservationStatusPending && x.EmailConfirmedAtUtc == null));

        if (role == AdminRoleAccess.Waiter && admin != null)
        {
            query = query.Where(reservation =>
                !_db.DiningOrders.Any(order =>
                    order.ReservationId == reservation.Id &&
                    order.Status != "Cancelled" &&
                    order.AssignedWaiterId.HasValue &&
                    order.AssignedWaiterId.Value != admin.Id));
        }

        var reservations = await query
            .OrderBy(x => x.ReservedDate)
            .ThenBy(x => x.ReservedTime)
            .ThenBy(x => x.CreatedAtUtc)
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
    [HttpGet("~/api/v1/restaurants/{restaurantId}/reservations/blocked-slots")]
    public async Task<IActionResult> GetBlockedSlots()
    {
        var today = DateOnly.FromDateTime(GetRestaurantNow());
        var lastPublicReservationDate = today.AddDays(PublicMaxReservationDaysAhead);
        var reservations = await _db.Reservations
            .AsNoTracking()
            .Where(x =>
                x.Status == ReservationStatusApproved &&
                x.ReservedDate >= today &&
                x.ReservedDate <= lastPublicReservationDate)
            .Select(x => new
            {
                x.ReservedDate,
                x.ReservedTime,
                IsHallBlock = x.CreatedByAdmin && x.Phone == "admin" && x.GuestName == "Admin block",
                TableIds = x.Tables.Select(t => t.TableCode).ToList()
            })
            .ToListAsync();

        var holds = await _db.PublicTableHolds
            .AsNoTracking()
            .Where(x => x.ReservedDate >= today && x.ReservedDate <= lastPublicReservationDate)
            .ToListAsync();

        var blocked = reservations.Cast<object>().Concat(holds.Select(hold => (object)new
        {
            hold.ReservedDate,
            ReservedTime = "00:00 - 23:59",
            TableIds = PublicTableHoldsController.DeserializeTableIds(hold.TableIdsJson),
            IsPublicHold = true
        }));

        return Ok(blocked);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateReservationRequest request)
    {
        AdminPrincipal? administrator = null;
        if (request.CreatedByAdmin)
        {
            if (!await _adminAuth.IsAuthorizedAsync(Request))
                return Unauthorized(new { message = "Admin password is required." });
            administrator = AdminAuthService.Current(HttpContext);
        }
        return (await _booking.CreateAsync(request, administrator)).ToActionResult();
    }

    [HttpPost("walk-in")]
    [AdminAuthorize]
    public async Task<IActionResult> CreateWalkIn([FromBody] CreateWalkInReservationRequest request)
    {
        await using var transaction = await RestaurantWriteTransaction.BeginAsync(_db);
        var admin = AdminAuthService.Current(HttpContext);
        if (admin == null)
            return Unauthorized(new { message = "Admin session is required." });

        var tableIds = ReservationConflictService.NormalizeTableIds(request.TableIds);
        if (await _seasonalZones.IsSelectionClosedAsync(request.Area, tableIds))
            return Conflict(new { message = "Тази зона е затворена за сезона. Моля, изберете друга зона.", code = "ZONE_SEASONALLY_CLOSED" });

        if (tableIds.Count == 0)
            return BadRequest(new { message = "At least one table must be selected." });

        var guestCount = request.GuestCount;
        var selection = await _seasonalZones.Plans.SelectAsync(tableIds, request.Area, guestCount);
        if (selection.Error != null) return BadRequest(new { message = selection.Error });
        tableIds = selection.TableIds;

        var canonicalIds = tableIds.Select(id => id.ToUpperInvariant()).ToList();
        var now = GetRestaurantNow();
        var openingTime = TimeOnly.Parse(_brand.WalkInOpeningTime);
        var latestWalkInTime = TimeOnly.Parse(_brand.WalkInLatestTime);
        var currentTime = TimeOnly.FromDateTime(now);

        if (currentTime < openingTime || currentTime > latestWalkInTime)
        {
            return BadRequest(new
            {
                message = $"Walk-in seating is available only during restaurant working hours: {_brand.WalkInOpeningTime}-{_brand.WalkInLatestTime}."
            });
        }

        var reservedDate = DateOnly.FromDateTime(now);
        var reservedTime = $"{now.Hour:00}:{now.Minute:00}";
        var occupiedReservation = await _db.Reservations
            .Include(x => x.Tables)
            .FirstOrDefaultAsync(x =>
                x.ReservedDate == reservedDate &&
                x.Status == ReservationStatusApproved &&
                x.IsArrived &&
                !x.IsNoShow &&
                x.Tables.Any(t => canonicalIds.Contains(t.TableCode.ToUpper())));

        if (occupiedReservation != null)
        {
            return Conflict(new
            {
                message = "One or more selected tables are currently occupied.",
                occupiedReservation.Id,
                occupiedReservation.ReservedTime,
                TableIds = occupiedReservation.Tables.Select(t => t.TableCode).ToList()
            });
        }

        var nextReservation = await _db.Reservations
            .Include(x => x.Tables)
            .Where(x =>
                x.ReservedDate == reservedDate &&
                x.Status != ReservationStatusCancelled &&
                x.Status != ReservationStatusReleased &&
                !(x.CreatedByAdmin && x.Phone == "admin" && x.GuestName == "Admin block") &&
                !x.IsNoShow &&
                !x.IsArrived &&
                x.Tables.Any(t => canonicalIds.Contains(t.TableCode.ToUpper())))
            .ToListAsync();

        var upcomingReservation = nextReservation
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
            .Where(x => x.Minutes > 0)
            .OrderBy(x => x.Minutes)
            .FirstOrDefault();

        if (upcomingReservation is { Minutes: <= 60 })
        {
            return Conflict(new
            {
                message = $"Walk-in seating closes one hour before the next reservation. The next reservation starts in {Math.Ceiling(upcomingReservation.Minutes)} minutes.",
                upcomingReservation.Reservation.Id,
                upcomingReservation.Reservation.ReservedTime,
                TableIds = upcomingReservation.Reservation.Tables.Select(t => t.TableCode).ToList()
            });
        }

        var reservation = new Reservation
        {
            GuestName = "Walk-in",
            Phone = string.Empty,
            Email = string.Empty,
            GuestCount = guestCount,
            Area = selection.Area,
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
                ? upcomingReservation == null
                    ? "Walk-in guest seated without customer details."
                    : $"Walk-in guest seated until the next reservation at {upcomingReservation.Reservation.ReservedTime}."
                : request.InternalNote.Trim(),
            OrderAccessToken = CreateOrderAccessToken(),
            EmailConfirmedAtUtc = DateTime.UtcNow,
            Tables = tableIds.Select(id => new ReservationTable { TableCode = id }).ToList()
        };

        _db.Reservations.Add(reservation);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
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
            AutoReleaseAt = upcomingReservation?.Reservation.ReservedTime,
            TableIds = reservation.Tables.Select(t => t.TableCode).ToList()
        });
    }

    [HttpGet("confirm")]
    public async Task<IActionResult> ConfirmByEmail([FromQuery] string token) =>
        (await _booking.ConfirmByEmailAsync(token)).ToActionResult();

    [HttpPatch("{id}/approve")]
    [AdminAuthorize]
    public async Task<IActionResult> Approve(int id)
    {
        await using var transaction = await RestaurantWriteTransaction.BeginAsync(_db);
        var reservation = await _db.Reservations
            .Include(x => x.Tables)
            .FirstOrDefaultAsync(x => x.Id == id);

        if (reservation == null)
            return NotFound();

        var tableIds = reservation.Tables.Select(t => t.TableCode).ToList();
        var selection = await _seasonalZones.Plans.SelectAsync(tableIds, reservation.Area, reservation.GuestCount);
        if (selection.Error != null) return BadRequest(new { message = selection.Error });

        var conflict = await _reservationConflictService.FindTableConflictAsync(
            reservation.ReservedDate,
            reservation.ReservedTime,
            tableIds,
            id, includeHallBlocks: false);

        if (conflict != null)
        {
            return Conflict(ReservationConflictService.ToConflictResponse(conflict));
        }

        reservation.Status = "Approved";
        reservation.IsNoShow = false;
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        await _audit.RecordAsync(HttpContext, "approve", "Reservation", reservation.Id.ToString(), after: new { reservation.Id, reservation.Status });

        if (!string.IsNullOrWhiteSpace(reservation.Email))
{
    await _emailService.SendAsync(
        reservation.Email,
        $"Вашата резервация е потвърдена · {_brand.Name}",
        $"""
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
          <h2>Вашата резервация е потвърдена</h2>
          <p>Здравейте, {reservation.GuestName},</p>
          <p>С радост потвърждаваме Вашата резервация в <strong>{HtmlRestaurantName}</strong>.</p>
          <p><strong>Дата:</strong> {reservation.ReservedDate:dd.MM.yyyy} г.</p>
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
        await using var transaction = await RestaurantWriteTransaction.BeginAsync(_db);
        var reservation = await _db.Reservations
            .Include(x => x.Tables)
            .FirstOrDefaultAsync(x => x.Id == id);

        if (reservation == null)
            return NotFound();

        if (reservation.Status == "Cancelled")
            return BadRequest("Cancelled reservations cannot be marked as arrived.");

        var selection = await _seasonalZones.Plans.SelectAsync(reservation.Tables.Select(t => t.TableCode), reservation.Area, reservation.GuestCount);
        if (selection.Error != null) return BadRequest(new { message = selection.Error });
        var conflict = await _reservationConflictService.FindTableConflictAsync(reservation.ReservedDate, reservation.ReservedTime, selection.TableIds, id, includeHallBlocks: false);
        if (conflict != null) return Conflict(ReservationConflictService.ToConflictResponse(conflict));
        reservation.Status = "Approved";
        reservation.IsArrived = true;
        reservation.IsNoShow = false;
        var isPro = await _tiers.IsProAsync();
        if (isPro)
        {
            reservation.OrderAccessToken ??= CreateOrderAccessToken();
        }
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        await _audit.RecordAsync(HttpContext, "arrive", "Reservation", reservation.Id.ToString(), after: new { reservation.Id, reservation.Status, reservation.IsArrived });

        if (isPro && !string.IsNullOrWhiteSpace(reservation.Email))
        {
            var orderAccessToken = reservation.OrderAccessToken ?? string.Empty;
            var menuUrl = $"{GetFrontendUrl()}/menu?reservation={reservation.Id}&token={Uri.EscapeDataString(orderAccessToken)}";

            await _emailService.SendAsync(
                reservation.Email,
                $"Можете да поръчате от дигиталното меню · {_brand.Name}",
                $"""
                <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
                  <h2>Добре дошли в {HtmlRestaurantName}</h2>
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
        var cancelledBy = AdminAuthService.Current(HttpContext);
        reservation.DeletedAtUtc = DateTime.UtcNow;
        reservation.DeletedByAdminUserId = cancelledBy?.Id;
        reservation.DeletedByAdminName = cancelledBy?.Name;
        reservation.DeleteReason = "Marked as no-show by admin";
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
        await using var transaction = await RestaurantWriteTransaction.BeginAsync(_db);
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

        var selection = await _seasonalZones.Plans.SelectAsync(tableIds, request.Area, nextGuestCount);
        if (selection.Error != null) return BadRequest(new { message = selection.Error });
        tableIds = selection.TableIds;

        var nextReservedDate = request.ReservedDate ?? reservation.ReservedDate;
        var nextReservedTime = string.IsNullOrWhiteSpace(request.ReservedTime)
            ? reservation.ReservedTime
            : request.ReservedTime.Trim();

        var changesReservationTime = request.ReservedDate.HasValue || !string.IsNullOrWhiteSpace(request.ReservedTime);
        if (changesReservationTime && IsPastReservationTime(nextReservedDate, nextReservedTime))
            return BadRequest("Reservation date or time has already passed.");

        if (!IsReservationTimeAllowed(nextReservedTime, createdByAdmin: true))
            return BadRequest("Admin reservations are available until 23:00.");

        var conflict = await _reservationConflictService.FindTableConflictAsync(
            nextReservedDate,
            nextReservedTime,
            tableIds,
            id, includeHallBlocks: false);

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

        reservation.Area = selection.Area;

        if (request.GuestCount.HasValue)
            reservation.GuestCount = request.GuestCount.Value;

        reservation.ReservedDate = nextReservedDate;
        reservation.ReservedTime = nextReservedTime;

        await _db.SaveChangesAsync();
        var nextTableLabel = string.Join(", ", reservation.Tables.Select(t => t.TableCode));
        await _db.DiningOrders
            .Where(order => order.ReservationId == reservation.Id)
            .ExecuteUpdateAsync(setters => setters.SetProperty(order => order.TableLabel, nextTableLabel));
        await transaction.CommitAsync();
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

    [HttpPatch("{id}")]
    [AdminAuthorize(AdminRoleAccess.Administrator, AdminRoleAccess.Owner, AdminRoleAccess.Developer)]
    public async Task<IActionResult> UpdateReservation(int id, [FromBody] UpdateReservationRequest request)
    {
        await using var transaction = await RestaurantWriteTransaction.BeginAsync(_db);
        var reservation = await _db.Reservations
            .Include(x => x.Tables)
            .FirstOrDefaultAsync(x => x.Id == id);

        if (reservation == null)
            return NotFound();

        if (reservation.Status == ReservationStatusCancelled)
            return BadRequest("Cancelled reservations cannot be edited.");

        var guestName = request.GuestName.Trim();
        var phone = request.Phone.Trim();
        var email = request.Email.Trim();
        var area = request.Area.Trim();
        var requestedTime = request.ReservedTime.Trim();
        var tableIds = ReservationConflictService.NormalizeTableIds(request.TableIds)
            .Select(tableId => tableId.ToUpperInvariant())
            .ToList();

        if (guestName.Length is < 2 or > 120)
            return BadRequest("Guest name must be between 2 and 120 characters.");
        if (phone.Length > 50 || email.Length > 120 || area.Length is < 1 or > 50)
            return BadRequest("One or more reservation fields are too long.");
        if (!string.IsNullOrWhiteSpace(email) && !new System.ComponentModel.DataAnnotations.EmailAddressAttribute().IsValid(email))
            return BadRequest("Invalid email address.");
        if (request.GuestCount <= 0)
            return BadRequest("Invalid guests.");
        if (tableIds.Count == 0)
            return BadRequest("At least one valid table must be selected.");
        if (!TimeOnly.TryParse(requestedTime, out var parsedTime))
            return BadRequest("Invalid reservation time.");
        var reservedTime = parsedTime.ToString("HH:mm");
        if (!IsReservationTimeAllowed(reservedTime, createdByAdmin: true))
            return BadRequest("Admin reservations are available until 23:00.");
        var selection = await _seasonalZones.Plans.SelectAsync(tableIds, area, request.GuestCount);
        if (selection.Error != null) return BadRequest(new { message = selection.Error });
        tableIds = selection.TableIds;
        area = selection.Area;
        if ((request.Notes?.Length ?? 0) > 2000 || (request.InternalNote?.Length ?? 0) > 2000)
            return BadRequest("Reservation notes are too long.");

        var slotChanged = request.ReservedDate != reservation.ReservedDate ||
            !string.Equals(reservedTime, reservation.ReservedTime, StringComparison.Ordinal) ||
            !tableIds.OrderBy(x => x).SequenceEqual(reservation.Tables.Select(x => x.TableCode).OrderBy(x => x));
        if (slotChanged && IsPastReservationTime(request.ReservedDate, reservedTime))
            return BadRequest("Reservation date or time has already passed.");

        var conflict = await _reservationConflictService.FindTableConflictAsync(
            request.ReservedDate, reservedTime, tableIds, reservation.Id, includeHallBlocks: false);
        if (conflict != null)
            return Conflict(ReservationConflictService.ToConflictResponse(conflict));

        var before = new
        {
            reservation.GuestName, reservation.Phone, reservation.Email, reservation.GuestCount,
            reservation.Area, reservation.ReservedDate, reservation.ReservedTime,
            reservation.Notes, reservation.InternalNote,
            TableIds = reservation.Tables.Select(x => x.TableCode).ToList()
        };
        var emailChanged = !string.Equals(reservation.Email?.Trim(), email, StringComparison.OrdinalIgnoreCase);

        _db.ReservationTables.RemoveRange(reservation.Tables);
        reservation.Tables = tableIds.Select(tableId => new ReservationTable
        {
            ReservationId = reservation.Id,
            TableCode = tableId
        }).ToList();
        reservation.GuestName = guestName;
        reservation.Phone = phone;
        reservation.Email = string.IsNullOrWhiteSpace(email) ? null : email;
        reservation.GuestCount = request.GuestCount;
        reservation.Area = area;
        reservation.ReservedDate = request.ReservedDate;
        reservation.ReservedTime = reservedTime;
        reservation.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        reservation.InternalNote = string.IsNullOrWhiteSpace(request.InternalNote) ? null : request.InternalNote.Trim();
        if (emailChanged)
        {
            reservation.EmailConfirmedAtUtc = null;
            reservation.EmailConfirmationTokenHash = null;
            reservation.EmailConfirmationExpiresAtUtc = null;
            if (reservation.Status == ReservationStatusAwaitingEmailConfirmation)
            {
                reservation.Status = ReservationStatusApproved;
                reservation.EmailConfirmedAtUtc = DateTime.UtcNow;
            }
        }

        await _db.SaveChangesAsync();
        var tableLabel = string.Join(", ", tableIds);
        await _db.DiningOrders
            .Where(order => order.ReservationId == reservation.Id)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(order => order.TableLabel, tableLabel)
                .SetProperty(order => order.GuestName, guestName));
        await transaction.CommitAsync();
        await _audit.RecordAsync(HttpContext, "update", "Reservation", reservation.Id.ToString(), before, new
        {
            reservation.GuestName, reservation.Phone, reservation.Email, reservation.GuestCount,
            reservation.Area, reservation.ReservedDate, reservation.ReservedTime,
            reservation.Notes, reservation.InternalNote, TableIds = tableIds
        });

        return Ok(new
        {
            reservation.Id, reservation.GuestName, reservation.Phone, reservation.Email,
            reservation.GuestCount, reservation.Area, reservation.ReservedDate,
            reservation.ReservedTime, reservation.Notes, reservation.InternalNote,
            TableIds = tableIds
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
        await using var transaction = await RestaurantWriteTransaction.BeginAsync(_db);
        var tableIds = ReservationConflictService.NormalizeTableIds(request.TableIds);
        var times = ReservationConflictService.NormalizeTimes(request.Times);
        var selection = await _seasonalZones.Plans.SelectAsync(tableIds, request.Area, 0, block: true);
        if (selection.Error != null) return BadRequest(new { message = selection.Error });
        tableIds = selection.TableIds;

        if (tableIds.Count == 0)
            return BadRequest("At least one table must be selected.");

        if (times.Count == 0)
            return BadRequest("At least one time must be selected.");

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
            Area = selection.Area,
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
        await transaction.CommitAsync();
        await _audit.RecordAsync(HttpContext, "block-hall", "Reservation", block.Id.ToString(), after: new { block.ReservedDate, block.ReservedTime, TableIds = tableIds });

        return Ok(new
        {
            Created = 1,
            request.ReservedDate,
            Times = times,
            TableIds = tableIds
        });
    }

    [HttpPatch("blocks/{id:int}/unblock")]
    [AdminAuthorize]
    public async Task<IActionResult> UnblockHall(int id)
    {
        var block = await _db.Reservations.FirstOrDefaultAsync(x => x.Id == id);
        if (block == null) return NotFound();
        if (!block.CreatedByAdmin || block.Phone != "admin" || block.GuestName != "Admin block")
            return BadRequest(new { message = "This record is not a hall block." });
        if (block.Status == ReservationStatusReleased) return Ok(new { block.Id, block.Status });
        block.Status = ReservationStatusReleased;
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "unblock-hall", "Reservation", block.Id.ToString(), after: new { block.Id, block.Status });
        return Ok(new { block.Id, block.Status });
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

        if (reservation.Status == ReservationStatusReleased)
        {
            // Retrying a release must never queue another message or change visit state.
            return Ok(new { reservation.Id, reservation.Status, reservation.IsArrived, reservation.IsNoShow,
                FeedbackEmailStatus = await _visitFeedback.DispatchForReservationAsync(reservation.Id) });
        }
        if (reservation.Status != ReservationStatusApproved || reservation.IsNoShow || reservation.GuestCount <= 0)
            return BadRequest(new { message = "Only an active guest reservation can be released." });

        var attended = reservation.IsArrived;
        await using (var transaction = await _db.Database.BeginTransactionAsync())
        {
            var changed = await _db.Reservations.Where(x => x.Id == id && x.Status == ReservationStatusApproved && !x.IsNoShow && x.IsArrived == attended)
                .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.Status, ReservationStatusReleased).SetProperty(x => x.IsArrived, false).SetProperty(x => x.HasCompletedVisit, attended));
            if (changed == 0)
                return Conflict(new { message = "Reservation changed. Please refresh and try again." });
            reservation.Status = ReservationStatusReleased;
            reservation.IsArrived = false;
            reservation.HasCompletedVisit = attended;
            if (attended) await _visitFeedback.QueueAsync(reservation, GetFrontendUrl());
            await _db.SaveChangesAsync();
            await transaction.CommitAsync();
        }
        await _audit.RecordAsync(HttpContext, "release", "Reservation", reservation.Id.ToString(), after: new { reservation.Id, reservation.Status });
        var feedbackEmailStatus = attended
            ? string.IsNullOrWhiteSpace(reservation.Email) ? "missing-email" : await _visitFeedback.DispatchForReservationAsync(reservation.Id)
            : "not-visited";

        return Ok(new
        {
            reservation.Id,
            reservation.Status,
            reservation.IsArrived,
            reservation.IsNoShow,
            FeedbackEmailStatus = feedbackEmailStatus
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
        var cancelledBy = AdminAuthService.Current(HttpContext);
        reservation.DeletedAtUtc = DateTime.UtcNow;
        reservation.DeletedByAdminUserId = cancelledBy?.Id;
        reservation.DeletedByAdminName = cancelledBy?.Name;
        reservation.DeleteReason = "Cancelled by admin";
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "cancel", "Reservation", reservation.Id.ToString(), after: new { reservation.Id, reservation.Status });

        if (!string.IsNullOrWhiteSpace(reservation.Email))
{
    await _emailService.SendAsync(
        reservation.Email,
        $"Вашата резервация е отменена · {_brand.Name}",
        $"""
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
          <h2>Вашата резервация е отменена</h2>
          <p>Здравейте, {reservation.GuestName},</p>
          <p>Информираме Ви, че резервацията Ви в <strong>{HtmlRestaurantName}</strong> беше отменена.</p>
          <p><strong>Дата:</strong> {reservation.ReservedDate:dd.MM.yyyy} г.</p>
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
