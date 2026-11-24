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

public sealed record PreorderLineRequest([Range(1, int.MaxValue)] int MenuItemId, [Range(1, 20)] int Quantity, [StringLength(200)] string Notes = "");
public sealed class PreorderDraftRequest
{
    public Guid IdempotencyKey { get; set; }
    [StringLength(64)] public string? ExpectedRevision { get; set; }
    [Required, MinLength(1), MaxLength(40)] public List<PreorderLineRequest> Items { get; set; } = [];
    [Range(0, 120)] public int ServeOffsetMinutes { get; set; }
    [StringLength(500)] public string Notes { get; set; } = "";
    [RegularExpression("^(bg|en|ru)$")] public string Language { get; set; } = "bg";
}
public sealed record PreorderLine(int MenuItemId, string Name, int Quantity, long UnitMinor, string Kind, string Notes = "");
public sealed record PreorderQuote(string Currency, long TotalMinor, DateTime ServeAtUtc, IReadOnlyList<PreorderLine> Items,
    bool BookingConfirmed, bool FullPrepaymentRequired = true, bool CardPaymentsAvailable = false);
public sealed record PreorderDraftDto(Guid Id, int ReservationId, string Status, string Currency, long TotalMinor,
    DateTime ServeAtUtc, IReadOnlyList<PreorderLine> Items, string Notes, DateTime CreatedAtUtc, string Revision, bool FullPrepaymentRequired = true, bool CardPaymentsAvailable = false);

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
        if (request.Items == null || request.Items.Count is < 1 or > 40 || request.Items.Any(x => x == null || x.MenuItemId < 1 || x.Quantity is < 1 or > 20 || (x.Notes?.Length ?? 0) > 200) || request.Items.Select(x => (x.MenuItemId, Notes: (x.Notes ?? "").Trim())).Distinct().Count() != request.Items.Count || request.Items.GroupBy(x => x.MenuItemId).Any(g => g.Sum(x => x.Quantity) > 20))
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
        var ids = items.Select(x => x.MenuItemId).Distinct().ToArray();
        var menu = await db.MenuItems.AsNoTracking().Where(x => ids.Contains(x.Id) && x.IsActive).ToDictionaryAsync(x => x.Id);
        if (menu.Count != ids.Length || menu.Values.Any(x => x.Price <= 0 || x.Price > 10000 || decimal.Round(x.Price, 2) != x.Price))
            throw new PreorderException(409, "PREORDER_MENU_CHANGED", "Some menu items are no longer available. Refresh the menu.");
        var lines = items.OrderBy(x => x.MenuItemId).Select(x => {
            var item = menu[x.MenuItemId];
            var name = request.Language == "en" ? item.NameEn : request.Language == "ru" ? item.NameRu : item.NameBg;
            return new PreorderLine(item.Id, string.IsNullOrWhiteSpace(name) ? item.NameBg : name, x.Quantity,
                checked((long)(item.Price * 100)), item.Department.Equals("Bar", StringComparison.OrdinalIgnoreCase) ? "Drink" : "Dish", (x.Notes ?? "").Trim());
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
        var hash = RequestHash(request);
        var replay = await ReplayAsync(reservationId, null, request.IdempotencyKey, hash);
        if (replay != null) return Describe(replay);
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
        draft.OperationsJson = JsonSerializer.Serialize(new Dictionary<Guid, string> { [request.IdempotencyKey] = "create:" + hash }, Json);
        db.ReservationPreorders.Add(draft); await db.SaveChangesAsync(); await transaction.CommitAsync();
        return Describe(draft);
    }
    public async Task<PreorderDraftDto> UpdateDraftAsync(int reservationId, Guid preorderId, string? token, PreorderDraftRequest request)
    {
        await using var transaction = await RestaurantWriteTransaction.BeginAsync(db);
        var reservation = await OwnAsync(reservationId, token); await RequireEnabledAsync();
        var draft = await db.ReservationPreorders.SingleOrDefaultAsync(x => x.Id == preorderId && x.ReservationId == reservationId);
        if (draft == null) throw Missing();
        if (draft.Status != "Draft") throw new PreorderException(409, "PREORDER_NOT_EDITABLE", "Contact the restaurant to change a submitted order.");
        if (request.IdempotencyKey == Guid.Empty) throw new PreorderException(400, "PREORDER_REQUEST_ID_REQUIRED", "A request ID is required.");
        ValidateItems(request);
        var hash = RequestHash(request);
        var replay = await ReplayAsync(reservationId, preorderId, request.IdempotencyKey, hash);
        if (replay != null) return Describe(replay);
        if (request.ExpectedRevision != Revision(draft))
            throw new PreorderException(409, "PREORDER_CHANGED", "This preorder changed. Reopen it before editing.");
        if (await db.ReservationPreorders.AnyAsync(x => x.Id != preorderId && x.ReservationId == reservationId && x.IdempotencyKey == request.IdempotencyKey))
            throw new PreorderException(409, "PREORDER_REQUEST_CONFLICT", "Request ID already used.");
        var quote = await QuoteAsync(reservation, request);
        if (!quote.BookingConfirmed) throw new PreorderException(409, "PREORDER_BOOKING_UNCONFIRMED", "Confirm your reservation before saving a preorder.");
        var operations = Operations(draft);
        if (operations.Count >= 1000) throw new PreorderException(429, "PREORDER_DRAFT_LIMIT", "Too many edits. Contact the restaurant.");
        operations[request.IdempotencyKey] = "update:" + hash;
        draft.OperationsJson = JsonSerializer.Serialize(operations, Json);
        draft.RequestHash = hash;
        draft.TotalMinor = quote.TotalMinor;
        draft.CommissionMinor = Commission(quote.TotalMinor, draft.CommissionBasisPoints);
        draft.RestaurantNetMinor = quote.TotalMinor - draft.CommissionMinor;
        draft.ServeAtUtc = quote.ServeAtUtc;
        draft.ItemsJson = JsonSerializer.Serialize(quote.Items, Json);
        draft.Notes = (request.Notes ?? "").Trim();
        await db.SaveChangesAsync(); await transaction.CommitAsync();
        return Describe(draft);
    }
    // Keep every accepted operation so delayed retries cannot recreate or roll back a cart.
    private static Dictionary<Guid, string> Operations(ReservationPreorder draft) =>
        JsonSerializer.Deserialize<Dictionary<Guid, string>>(draft.OperationsJson, Json) ?? new();
    private async Task<ReservationPreorder?> ReplayAsync(int reservationId, Guid? preorderId, Guid key, string hash)
    {
        foreach (var draft in await db.ReservationPreorders.Where(x => x.ReservationId == reservationId).ToListAsync())
        {
            var operations = Operations(draft);
            if (!operations.TryGetValue(key, out var accepted)) continue;
            var expected = (preorderId.HasValue ? "update:" : "create:") + hash;
            // Legacy entries predate operation kinds, but still protect their retained key.
            if ((accepted != expected && accepted != "legacy:" + hash) || (preorderId.HasValue && draft.Id != preorderId))
                throw new PreorderException(409, "PREORDER_REQUEST_CONFLICT", "This request ID was already used for another cart.");
            return draft;
        }
        return null;
    }
    private static string Revision(ReservationPreorder draft)
    {
        var operations = Operations(draft);
        // Preserve revisions held by pre-upgrade clients until the first new edit.
        if (operations.Values.All(x => x.StartsWith("legacy:", StringComparison.Ordinal))) return draft.RequestHash;
        var history = string.Join(":", operations.Keys.Select(x => x.ToString("N")).OrderBy(x => x, StringComparer.Ordinal));
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(draft.RequestHash + ":" + history)));
    }
    private static string RequestHash(PreorderDraftRequest request)
    {
        object items = request.Items.All(x => string.IsNullOrWhiteSpace(x.Notes))
            ? request.Items.OrderBy(x => x.MenuItemId).Select(x => (object)new { x.MenuItemId, x.Quantity }).ToArray()
            : request.Items.OrderBy(x => x.MenuItemId).ThenBy(x => (x.Notes ?? "").Trim(), StringComparer.Ordinal)
                .Select(x => (object)new { x.MenuItemId, x.Quantity, Notes = (x.Notes ?? "").Trim() }).ToArray();
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new {
            Items = items, request.ServeOffsetMinutes, Notes = (request.Notes ?? "").Trim(), request.Language }, Json))));
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
        draft.ServeAtUtc, JsonSerializer.Deserialize<PreorderLine[]>(draft.ItemsJson, Json) ?? [], draft.Notes, draft.CreatedAtUtc, Revision(draft));
}
