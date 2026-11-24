using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SeatMap.Api.Data;
using SeatMap.Api.Filters;
using SeatMap.Api.Platform.Data;
using SeatMap.Api.Services;
using SeatMap.Api.Services.Sommelier;
namespace SeatMap.Api.Controllers;

[ApiController, Route("api/sommelier")]
public sealed class SommelierController(AppDbContext db, IServiceProvider services, AuditService audit) : ControllerBase
{
    private PlatformDbContext? Platform => services.GetService<PlatformDbContext>();
    [HttpGet("~/api/v1/restaurants/{restaurantId}/sommelier")]
    public async Task<IActionResult> Recommend([FromQuery] SommelierRequest request)
    {
        Response.Headers.CacheControl = "no-store";
        var dishItem = await db.MenuItems.AsNoTracking().SingleOrDefaultAsync(x => x.Id == request.DishId && x.IsActive);
        if (dishItem == null) return NotFound(new { code = "DISH_NOT_FOUND" });
        var platform = Platform;
        if (platform == null) return await MenuFallback(request);
        var dish = await db.SommelierProfiles.AsNoTracking().SingleOrDefaultAsync(x => x.MenuItemId == request.DishId && x.Kind == "dish" && x.Verified);
        if (dish == null) return await MenuFallback(request);
        var offers = await (from p in db.SommelierProfiles.AsNoTracking()
                            join m in db.MenuItems.AsNoTracking() on p.MenuItemId equals m.Id
                            where p.Kind == "wine" && p.Verified && p.Available && m.IsActive && m.Price > 0 && p.WineId != null
                            select new { Profile = p, Item = m }).ToListAsync();
        var ids = offers.Select(x => x.Profile.WineId!.Value).Distinct().ToArray();
        var wines = await platform.SommelierWines.AsNoTracking().Where(x => ids.Contains(x.Id) && x.Verified).ToDictionaryAsync(x => x.Id);
        var rules = await platform.SommelierRules.AsNoTracking().Where(x => x.Enabled).ToDictionaryAsync(x => x.Code, x => x.Weight);
        if (rules.Count == 0) return Ok(new { status = "not_configured", recommendations = Array.Empty<object>() });
        var ranked = offers.Where(x => wines.ContainsKey(x.Profile.WineId!.Value))
            .Where(x => request.MaxPriceMinor == null || decimal.Round(x.Item.Price * 100) <= request.MaxPriceMinor)
            .Where(x => request.Serving == null || x.Profile.Serving == request.Serving)
            .Where(x => request.Style == null || wines[x.Profile.WineId!.Value].Style == request.Style)
            .Select(x => new { Offer = x, Wine = wines[x.Profile.WineId!.Value], Match = SommelierScoring.Score(dish, wines[x.Profile.WineId!.Value], rules) })
            .Where(x => x.Match != null).OrderByDescending(x => x.Match!.Value.Score).ThenBy(x => x.Offer.Item.Price).ThenBy(x => x.Offer.Item.Id)
            .DistinctBy(x => x.Wine.Id).Take(3).Select(x => new {
                menuItemId = x.Offer.Item.Id,
                name = request.Language == "ru" ? x.Offer.Item.NameRu : request.Language == "en" ? x.Offer.Item.NameEn : x.Offer.Item.NameBg,
                wineName = x.Wine.Name, priceMinor = (long)decimal.Round(x.Offer.Item.Price * 100), currency = "EUR",
                volume = x.Offer.Item.Weight, serving = x.Offer.Profile.Serving, style = x.Wine.Style,
                image = x.Offer.Item.ImageUrl, reasons = x.Match!.Value.Reasons
            }).ToArray();
        return Ok(new { status = ranked.Length == 0 ? "no_match" : "ok", recommendations = ranked });
    }

    private async Task<IActionResult> MenuFallback(SommelierRequest request)
    {
        var items = await db.MenuItems.AsNoTracking().Where(x => x.IsActive && x.Price > 0).ToListAsync();
        var profiles = await db.SommelierProfiles.AsNoTracking().ToDictionaryAsync(x => x.MenuItemId);
        var wineItems = items.Where(x => (x.Category.Contains("wine", StringComparison.OrdinalIgnoreCase) ||
            x.NameBg.Contains("вино", StringComparison.OrdinalIgnoreCase) || x.NameEn.Contains("wine", StringComparison.OrdinalIgnoreCase)) &&
            (!profiles.TryGetValue(x.Id, out var p) || p.Kind != "wine" || p.Available)).ToArray();
        var options = wineItems.Where(x => request.MaxPriceMinor == null || decimal.Round(x.Price * 100) <= request.MaxPriceMinor)
            .OrderBy(x => x.Price).ThenBy(x => x.Id).Take(6).Select(x => new {
                menuItemId = x.Id, name = request.Language == "ru" ? x.NameRu : request.Language == "en" ? x.NameEn : x.NameBg,
                wineName = x.NameBg, volume = x.Weight, priceMinor = (long)decimal.Round(x.Price * 100), currency = "EUR", reasons = Array.Empty<string>()
            }).ToArray();
        // Generic menu positions are displayed as consultation options, never claimed as pairings.
        return Ok(new { status = wineItems.Length == 0 ? "no_wines" : "consultation", recommendations = Array.Empty<object>(), menuOptions = options });
    }

    [HttpGet("configuration"), AdminAuthorize(AdminRoleAccess.Owner, AdminRoleAccess.Developer, AdminRoleAccess.Administrator)]
    public async Task<IActionResult> Configuration()
    {
        Response.Headers.CacheControl = "no-store";
        var platform = Platform;
        return Ok(new {
            profiles = await db.SommelierProfiles.AsNoTracking().OrderBy(x => x.MenuItemId).ToListAsync(),
            wines = platform == null ? [] : await platform.SommelierWines.AsNoTracking().OrderBy(x => x.Name).ToListAsync(),
            canEditCatalogue = AdminAuthService.Current(HttpContext)?.Role == AdminRoleAccess.Developer,
            platformAvailable = platform != null
        });
    }
    [HttpPut("profiles/{id:int}"), AdminAuthorize(AdminRoleAccess.Owner, AdminRoleAccess.Developer, AdminRoleAccess.Administrator)]
    public async Task<IActionResult> SaveProfile(int id, SommelierProfile profile)
    {
        if (id != profile.MenuItemId || !await db.MenuItems.AnyAsync(x => x.Id == id)) return BadRequest(new { code = "MENU_ITEM_INVALID" });
        if (profile.Kind == "wine" && (profile.WineId == null || Platform == null || !await Platform.SommelierWines.AnyAsync(x => x.Id == profile.WineId && (!profile.Verified || x.Verified))))
            return BadRequest(new { code = "WINE_PROFILE_REQUIRED" });
        var old = await db.SommelierProfiles.AsNoTracking().SingleOrDefaultAsync(x => x.MenuItemId == id);
        profile.UpdatedAtUtc = DateTime.UtcNow;
        if (old == null) db.SommelierProfiles.Add(profile); else db.SommelierProfiles.Update(profile);
        await audit.RecordAsync(HttpContext, "SommelierProfile.Update", "MenuItem", id.ToString(), old, profile);
        return Ok(profile);
    }
    // Only a platform developer may alter knowledge shared by all restaurants.
    [HttpPut("wines/{id:guid}"), AdminAuthorize(AdminRoleAccess.Developer)]
    public async Task<IActionResult> SaveWine(Guid id, SommelierWine wine)
    {
        var platform = Platform;
        if (platform == null) return StatusCode(503, new { code = "PLATFORM_UNAVAILABLE" });
        if (id == Guid.Empty || id != wine.Id || string.IsNullOrWhiteSpace(wine.Name) || string.IsNullOrWhiteSpace(wine.Source)) return BadRequest();
        var old = await platform.SommelierWines.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id);
        if (old == null) platform.SommelierWines.Add(wine); else platform.SommelierWines.Update(wine);
        await platform.SaveChangesAsync();
        await audit.RecordAsync(HttpContext, "SommelierWine.Update", "SommelierWine", id.ToString(), old, wine);
        return Ok(wine);
    }
}
