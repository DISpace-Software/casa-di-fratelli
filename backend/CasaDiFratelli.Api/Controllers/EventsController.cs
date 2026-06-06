using System.Text.Json;
using CasaDiFratelli.Api.Data;
using CasaDiFratelli.Api.Filters;
using CasaDiFratelli.Api.Models;
using CasaDiFratelli.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CasaDiFratelli.Api.Controllers;

[ApiController]
[Route("api/events")]
public class EventsController : ControllerBase
{
    private const int MaxImagesJsonLength = 1_600_000;
    private readonly AppDbContext _db;
    private readonly AuditService _audit;

    public EventsController(AppDbContext db, AuditService audit)
    {
        _db = db;
        _audit = audit;
    }

    private static List<string> ReadImages(RestaurantEvent item)
    {
        try
        {
            return JsonSerializer.Deserialize<List<string>>(item.ImageUrlsJson) ?? new List<string>();
        }
        catch
        {
            return new List<string>();
        }
    }

    private static string NormalizeImages(IEnumerable<string>? images)
    {
        var normalized = (images ?? Array.Empty<string>())
            .Select(x => x?.Trim() ?? string.Empty)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Take(8)
            .ToList();

        var json = JsonSerializer.Serialize(normalized);
        if (json.Length > MaxImagesJsonLength)
            throw new InvalidOperationException("Event photos are too large. Please upload smaller photos.");

        return json;
    }

    private static object ToDto(RestaurantEvent item) => new
    {
        item.Id,
        item.TitleBg,
        item.TitleEn,
        item.TextBg,
        item.TextEn,
        item.Badge,
        ImageUrls = ReadImages(item),
        item.IsActive,
        item.CreatedAtUtc,
        item.UpdatedAtUtc
    };

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var items = await _db.RestaurantEvents
            .AsNoTracking()
            .Where(x => x.IsActive)
            .OrderByDescending(x => x.CreatedAtUtc)
            .ToListAsync();

        return Ok(items.Select(ToDto));
    }

    [HttpGet("admin")]
    [AdminAuthorize]
    public async Task<IActionResult> GetAdmin()
    {
        var items = await _db.RestaurantEvents
            .AsNoTracking()
            .OrderByDescending(x => x.CreatedAtUtc)
            .ToListAsync();

        return Ok(items.Select(ToDto));
    }

    [HttpPost]
    [AdminAuthorize]
    public async Task<IActionResult> Create([FromBody] RestaurantEventRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.TitleBg))
            return BadRequest(new { message = "Event title is required." });

        RestaurantEvent item;
        try
        {
            item = new RestaurantEvent
            {
                TitleBg = request.TitleBg.Trim(),
                TitleEn = string.IsNullOrWhiteSpace(request.TitleEn) ? request.TitleBg.Trim() : request.TitleEn.Trim(),
                TextBg = request.TextBg?.Trim() ?? string.Empty,
                TextEn = string.IsNullOrWhiteSpace(request.TextEn) ? request.TextBg?.Trim() ?? string.Empty : request.TextEn.Trim(),
                Badge = request.Badge?.Trim() ?? string.Empty,
                ImageUrlsJson = NormalizeImages(request.ImageUrls),
                IsActive = request.IsActive,
                CreatedAtUtc = DateTime.UtcNow
            };
        }
        catch (InvalidOperationException error)
        {
            return StatusCode(StatusCodes.Status413PayloadTooLarge, new { message = error.Message });
        }

        _db.RestaurantEvents.Add(item);
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "create", "RestaurantEvent", item.Id.ToString(), after: ToDto(item));

        return Ok(ToDto(item));
    }

    [HttpPut("{id:int}")]
    [AdminAuthorize]
    public async Task<IActionResult> Update(int id, [FromBody] RestaurantEventRequest request)
    {
        var item = await _db.RestaurantEvents.FirstOrDefaultAsync(x => x.Id == id);
        if (item == null)
            return NotFound();

        if (string.IsNullOrWhiteSpace(request.TitleBg))
            return BadRequest(new { message = "Event title is required." });

        var before = ToDto(item);
        try
        {
            item.TitleBg = request.TitleBg.Trim();
            item.TitleEn = string.IsNullOrWhiteSpace(request.TitleEn) ? item.TitleBg : request.TitleEn.Trim();
            item.TextBg = request.TextBg?.Trim() ?? string.Empty;
            item.TextEn = string.IsNullOrWhiteSpace(request.TextEn) ? item.TextBg : request.TextEn.Trim();
            item.Badge = request.Badge?.Trim() ?? string.Empty;
            item.ImageUrlsJson = NormalizeImages(request.ImageUrls);
            item.IsActive = request.IsActive;
            item.UpdatedAtUtc = DateTime.UtcNow;
        }
        catch (InvalidOperationException error)
        {
            return StatusCode(StatusCodes.Status413PayloadTooLarge, new { message = error.Message });
        }

        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "update", "RestaurantEvent", item.Id.ToString(), before, ToDto(item));

        return Ok(ToDto(item));
    }

    [HttpDelete("{id:int}")]
    [AdminAuthorize]
    public async Task<IActionResult> Delete(int id)
    {
        var item = await _db.RestaurantEvents.FirstOrDefaultAsync(x => x.Id == id);
        if (item == null)
            return NotFound();

        var before = ToDto(item);
        _db.RestaurantEvents.Remove(item);
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "delete", "RestaurantEvent", item.Id.ToString(), before);

        return NoContent();
    }
}

public class RestaurantEventRequest
{
    public string TitleBg { get; set; } = string.Empty;

    public string? TitleEn { get; set; }

    public string? TextBg { get; set; }

    public string? TextEn { get; set; }

    public string? Badge { get; set; }

    public List<string> ImageUrls { get; set; } = new();

    public bool IsActive { get; set; } = true;
}
