using System.ComponentModel.DataAnnotations;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SeatMap.Api.Data;
using SeatMap.Api.Models;
using SeatMap.Api.Services.Reservations;
using SeatMap.Api.Services.Tenancy;

namespace SeatMap.Api.Services.Preorders;

public sealed record PreorderLineRequest([Range(1, int.MaxValue)] int MenuItemId, [Range(1, 20)] int Quantity);
public sealed class PreorderDraftRequest
{
    public Guid IdempotencyKey { get; set; }
    [Required, MinLength(1), MaxLength(40)] public List<PreorderLineRequest> Items { get; set; } = [];
    [Range(0, 120)] public int ServeOffsetMinutes { get; set; }
    [StringLength(500)] public string Notes { get; set; } = "";
    [RegularExpression("^(bg|en|ru)$")] public string Language { get; set; } = "bg";
}
public sealed record PreorderLine(int MenuItemId, string Name, int Quantity, long UnitMinor, string Kind);
public sealed record PreorderQuote(string Currency, long TotalMinor, DateTime ServeAtUtc, IReadOnlyList<PreorderLine> Items,
    bool BookingConfirmed, bool FullPrepaymentRequired = true, bool CardPaymentsAvailable = false);
public sealed record PreorderDraftDto(Guid Id, int ReservationId, string Status, string Currency, long TotalMinor,
    DateTime ServeAtUtc, IReadOnlyList<PreorderLine> Items, string Notes, DateTime CreatedAtUtc, bool FullPrepaymentRequired = true, bool CardPaymentsAvailable = false);

public sealed class GuestPreorderService(AppDbContext db, PreorderPolicyService policies, TenantBrandingService branding, TimeProvider time, RestaurantClosureService closures, SeasonalZoneService zones)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private async Task<Reservation> OwnAsync(int id, string? token)
    {
        if (token == null || token.Length != 64 || !token.All(Uri.IsHexDigit)) throw Missing();
        var reservation = await db.Reservations.Include(x => x.Tables).SingleOrDefaultAsync(x => x.Id == id);
        if (reservation?.GuestManagementTokenHash is not { Length: 64 } expected || reservation.CreatedByAdmin ||
            !CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(expected), Encoding.ASCII.GetBytes(GuestReservationService.HashToken(token)))) throw Missing();
        return reservation;
    }
    private static PreorderException Missing() => new(404, "RESERVATION_NOT_FOUND", "Reservation not found or access is invalid.");
    private async Task RequireEnabledAsync()
    {
        var platform = await policies.PlatformAsync();
        if (!platform.Enabled)
            throw new PreorderException(403, "PREORDERS_DISABLED", "This restaurant does not offer preorders.");
    }
    private static void ValidateItems(PreorderDraftRequest request)
    {
        if (request.Items == null || request.Items.Count is < 1 or > 40 || request.Items.Any(x => x == null || x.MenuItemId < 1 || x.Quantity is < 1 or > 20) || request.Items.Select(x => x.MenuItemId).Distinct().Count() != request.Items.Count)
            throw new PreorderException(400, "PREORDER_ITEMS_INVALID", "Choose valid menu items and quantities.");
    }
    private async Task<PreorderQuote> QuoteAsync(Reservation reservation, PreorderDraftRequest request)
    {
        ValidateItems(request);
        if (reservation.Status is not ("Approved" or "Pending" or "AwaitingEmailConfirmation") || reservation.IsArrived || reservation.HasCompletedVisit || reservation.IsNoShow || reservation.IsWalkIn)
            throw new PreorderException(409, "PREORDER_BOOKING_INACTIVE", "Preorders require an upcoming reservation.");
        var closure = await closures.GetAsync();
        if ((closure.Enabled && reservation.ReservedDate >= closure.StartDate && reservation.ReservedDate <= closure.EndDate) ||
            await zones.IsSelectionClosedAsync(reservation.Area, reservation.Tables.Select(x => x.TableCode)))
            throw new PreorderException(409, "PREORDER_RESTAURANT_CLOSED", "The restaurant or your room is closed. Contact the restaurant.");
        var brand = await branding.GetAsync();
        var starts = GuestReservationService.StartsAtUtc(reservation, brand);
        var now = time.GetUtcNow().UtcDateTime;
        if (!starts.HasValue || starts.Value < now.AddMinutes(30))
            throw new PreorderException(409, "PREORDER_TOO_LATE", "Preorders close 30 minutes before the reservation.");
        if (request.ServeOffsetMinutes is < 0 or > 120 || request.ServeOffsetMinutes % 15 != 0)
            throw new PreorderException(400, "PREORDER_TIME_INVALID", "Choose a serving time within two hours of your reservation, in 15-minute steps.");
        var items = request.Items;
        var ids = items.Select(x => x.MenuItemId).ToArray();
        var menu = await db.MenuItems.AsNoTracking().Where(x => ids.Contains(x.Id) && x.IsActive).ToDictionaryAsync(x => x.Id);
        if (menu.Count != ids.Length || menu.Values.Any(x => x.Price <= 0 || x.Price > 10000 || decimal.Round(x.Price, 2) != x.Price))
            throw new PreorderException(409, "PREORDER_MENU_CHANGED", "Some menu items are no longer available. Refresh the menu.");
        var lines = items.OrderBy(x => x.MenuItemId).Select(x => {
            var item = menu[x.MenuItemId];
            var name = request.Language == "en" ? item.NameEn : request.Language == "ru" ? item.NameRu : item.NameBg;
            return new PreorderLine(item.Id, string.IsNullOrWhiteSpace(name) ? item.NameBg : name, x.Quantity,
                checked((long)(item.Price * 100)), item.Department.Equals("Bar", StringComparison.OrdinalIgnoreCase) ? "Drink" : "Dish");
        }).ToArray();
        return new("EUR", checked(lines.Sum(x => checked(x.UnitMinor * x.Quantity))), starts.Value.AddMinutes(request.ServeOffsetMinutes), lines, reservation.Status == "Approved");
    }
    public async Task<PreorderQuote> QuoteAsync(int reservationId, string? token, PreorderDraftRequest request)
    {
        var reservation = await OwnAsync(reservationId, token); await RequireEnabledAsync();
        return await QuoteAsync(reservation, request);
    }
    public async Task<PreorderDraftDto> CreateDraftAsync(int reservationId, string? token, PreorderDraftRequest request)
    {
        await using var transaction = await RestaurantWriteTransaction.BeginAsync(db);
        var reservation = await OwnAsync(reservationId, token); await RequireEnabledAsync();
        if (request.IdempotencyKey == Guid.Empty) throw new PreorderException(400, "PREORDER_REQUEST_ID_REQUIRED", "A request ID is required.");
        ValidateItems(request);
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new {
            Items = request.Items.OrderBy(x => x.MenuItemId), request.ServeOffsetMinutes, Notes = (request.Notes ?? "").Trim(), request.Language }, Json))));
        var existing = await db.ReservationPreorders.SingleOrDefaultAsync(x => x.ReservationId == reservationId && x.IdempotencyKey == request.IdempotencyKey);
        if (existing != null) {
            if (existing.RequestHash != hash) throw new PreorderException(409, "PREORDER_REQUEST_CONFLICT", "This request ID was already used for another cart.");
            return Describe(existing);
        }
        var quote = await QuoteAsync(reservation, request);
        if (!quote.BookingConfirmed) throw new PreorderException(409, "PREORDER_BOOKING_UNCONFIRMED", "Confirm your reservation before saving a preorder.");
        if (await db.ReservationPreorders.CountAsync(x => x.ReservationId == reservationId) >= 20)
            throw new PreorderException(429, "PREORDER_DRAFT_LIMIT", "Too many saved carts. Contact the restaurant.");
        var policy = await policies.PlatformAsync();
        var commission = Commission(quote.TotalMinor, policy.CommissionBasisPoints);
        var draft = new ReservationPreorder { ReservationId = reservationId, IdempotencyKey = request.IdempotencyKey,
            RequestHash = hash, TotalMinor = quote.TotalMinor, CommissionBasisPoints = policy.CommissionBasisPoints,
            CommissionMinor = commission, RestaurantNetMinor = quote.TotalMinor - commission,
            ServeAtUtc = quote.ServeAtUtc, ItemsJson = JsonSerializer.Serialize(quote.Items, Json), Notes = (request.Notes ?? "").Trim(), CreatedAtUtc = time.GetUtcNow().UtcDateTime };
        db.ReservationPreorders.Add(draft); await db.SaveChangesAsync(); await transaction.CommitAsync();
        return Describe(draft);
    }
    public async Task<IReadOnlyList<PreorderDraftDto>> ListAsync(int reservationId, string? token)
    {
        await OwnAsync(reservationId, token);
        return (await db.ReservationPreorders.AsNoTracking().Where(x => x.ReservationId == reservationId).OrderByDescending(x => x.CreatedAtUtc).ToListAsync()).Select(Describe).ToArray();
    }
    public async Task CheckoutAsync(int reservationId, Guid preorderId, string? token)
    {
        await OwnAsync(reservationId, token); await RequireEnabledAsync();
        if (!await db.ReservationPreorders.AnyAsync(x => x.Id == preorderId && x.ReservationId == reservationId)) throw Missing();
        // A future, verified marketplace PSP capture integration is required. Never
        // turn a draft into a paid/kitchen order from a client callback or admin toggle.
        throw new PreorderException(503, "CARD_PAYMENTS_NOT_CONNECTED", "Card prepayment is not available yet. Your cart remains an unpaid draft.");
    }
    public static long Commission(long totalMinor, int basisPoints) => checked((long)decimal.Round((decimal)totalMinor * basisPoints / 10000, 0, MidpointRounding.AwayFromZero));
    private static PreorderDraftDto Describe(ReservationPreorder draft) => new(draft.Id, draft.ReservationId, draft.Status, draft.Currency, draft.TotalMinor,
        draft.ServeAtUtc, JsonSerializer.Deserialize<PreorderLine[]>(draft.ItemsJson, Json) ?? [], draft.Notes, draft.CreatedAtUtc);
}
