using CasaDiFratelli.Api.Services.Tenancy;
using CasaDiFratelli.Api.Data;
using CasaDiFratelli.Api.Filters;
using CasaDiFratelli.Api.Models;
using CasaDiFratelli.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;

namespace CasaDiFratelli.Api.Controllers;

[ApiController]
[Route("api/feedback")]
public class FeedbackController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly TenantBrandingService _branding;
    private readonly AuditService _audit;

    public FeedbackController(AppDbContext db, TenantBrandingService branding, AuditService audit)
    {
        _db = db;
        _branding = branding;
        _audit = audit;
    }

    [HttpGet("meta")]
    public async Task<IActionResult> GetMeta()
    {
        return Ok(new
        {
            reviewUrl = await GetReviewUrlAsync()
        });
    }

    [HttpGet]
    [AdminAuthorize(AdminRoleAccess.Administrator, AdminRoleAccess.Owner, AdminRoleAccess.Developer)]
    public async Task<IActionResult> GetAll([FromQuery] string? search = null)
    {
        var query = _db.CustomerFeedbacks.AsQueryable();
        var term = (search ?? string.Empty).Trim().ToLowerInvariant();

        if (!string.IsNullOrWhiteSpace(term))
        {
            query = query.Where(x =>
                x.DiscountCode.ToLower().Contains(term) ||
                x.GuestName.ToLower().Contains(term) ||
                x.Email.ToLower().Contains(term));
        }

        var feedback = await query
            .OrderByDescending(x => x.CreatedAtUtc)
            .Take(300)
            .Select(x => new
            {
                x.Id,
                x.ReservationId,
                x.GuestName,
                x.Email,
                x.AtmosphereRating,
                x.AtmosphereImpression,
                x.AtmosphereChange,
                x.FoodRating,
                x.FoodImpression,
                x.FoodChange,
                x.ServiceRating,
                x.ServiceImpression,
                x.ServiceChange,
                x.OnlineReservationRating,
                x.OnlineReservationFeedback,
                x.OnlineReservationEase,
                x.TableMapRating,
                x.TableMapUsefulnessRating,
                x.TableMapFavoriteFeature,
                x.TableMapReuseIntent,
                x.TableChoiceImportance,
                x.SoftwareRating,
                x.SoftwareFeedback,
                x.MostUsefulDigitalFeature,
                x.ClientCareFeedback,
                x.SmallDetailsFeedback,
                x.ReturnLikelihood,
                x.RecommendLikelihood,
                x.OneThingToChange,
                x.GoogleReviewClicked,
                x.DiscountCode,
                x.DiscountCodeUsed,
                x.DiscountCodeUsedAtUtc,
                x.CreatedAtUtc
            })
            .ToListAsync();

        return Ok(feedback);
    }

    [HttpPost]
    public async Task<IActionResult> Submit([FromBody] SubmitFeedbackRequest request)
    {
        var guestName = (request.GuestName ?? string.Empty).Trim();
        var email = (request.Email ?? string.Empty).Trim();

        if (string.IsNullOrWhiteSpace(guestName))
            return BadRequest(new { message = "Guest name is required." });

        if (string.IsNullOrWhiteSpace(email))
            return BadRequest(new { message = "Email is required." });

        var feedback = new CustomerFeedback
        {
            ReservationId = request.ReservationId,
            GuestName = guestName,
            Email = email,
            AtmosphereRating = ClampRating(request.AtmosphereRating),
            AtmosphereImpression = Clean(request.AtmosphereImpression),
            AtmosphereChange = Clean(request.AtmosphereChange),
            FoodRating = ClampRating(request.FoodRating),
            FoodImpression = Clean(request.FoodImpression),
            FoodChange = Clean(request.FoodChange),
            ServiceRating = ClampRating(request.ServiceRating),
            ServiceImpression = Clean(request.ServiceImpression),
            ServiceChange = Clean(request.ServiceChange),
            OnlineReservationRating = ClampRating(request.OnlineReservationRating),
            OnlineReservationFeedback = Clean(request.OnlineReservationFeedback),
            OnlineReservationEase = CleanOption(request.OnlineReservationEase),
            TableMapRating = ClampRating(request.TableMapRating),
            TableMapUsefulnessRating = ClampRating(request.TableMapUsefulnessRating),
            TableMapFavoriteFeature = Clean(request.TableMapFavoriteFeature),
            TableMapReuseIntent = CleanOption(request.TableMapReuseIntent),
            TableChoiceImportance = CleanOption(request.TableChoiceImportance),
            SoftwareRating = ClampRating(request.SoftwareRating),
            SoftwareFeedback = Clean(request.SoftwareFeedback),
            MostUsefulDigitalFeature = CleanOption(request.MostUsefulDigitalFeature),
            ClientCareFeedback = Clean(request.ClientCareFeedback),
            SmallDetailsFeedback = Clean(request.SmallDetailsFeedback),
            ReturnLikelihood = ClampScale(request.ReturnLikelihood, 1, 10),
            RecommendLikelihood = ClampScale(request.RecommendLikelihood, 0, 10),
            OneThingToChange = Clean(request.OneThingToChange),
            GoogleReviewClicked = request.GoogleReviewClicked,
            DiscountCode = $"FRATELLI5-{RandomNumberGenerator.GetInt32(1000, 9999)}",
            CreatedAtUtc = DateTime.UtcNow
        };

        _db.CustomerFeedbacks.Add(feedback);
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "submit-feedback", "CustomerFeedback", feedback.Id.ToString(), after: new { feedback.Id, feedback.ReservationId, feedback.Email });

        return Ok(new
        {
            feedback.Id,
            feedback.DiscountCode,
            reviewUrl = await GetReviewUrlAsync()
        });
    }

    [HttpPatch("{id:int}/discount-used")]
    [AdminAuthorize(AdminRoleAccess.Administrator, AdminRoleAccess.Owner, AdminRoleAccess.Developer)]
    public async Task<IActionResult> MarkDiscountUsed(int id)
    {
        var feedback = await _db.CustomerFeedbacks.FirstOrDefaultAsync(x => x.Id == id);
        if (feedback == null)
            return NotFound();

        feedback.DiscountCodeUsed = true;
        feedback.DiscountCodeUsedAtUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "use-feedback-discount", "CustomerFeedback", feedback.Id.ToString(), after: new { feedback.Id, feedback.DiscountCode });

        return Ok(new { feedback.Id, feedback.DiscountCodeUsed, feedback.DiscountCodeUsedAtUtc });
    }

    [HttpDelete("{id:int}")]
    [AdminAuthorize(AdminRoleAccess.Administrator, AdminRoleAccess.Owner, AdminRoleAccess.Developer)]
    public async Task<IActionResult> Delete(int id)
    {
        var feedback = await _db.CustomerFeedbacks.FirstOrDefaultAsync(x => x.Id == id);
        if (feedback == null)
            return NotFound();

        _db.CustomerFeedbacks.Remove(feedback);
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "delete-feedback", "CustomerFeedback", id.ToString(), before: new { feedback.Id, feedback.Email, feedback.DiscountCode });

        return NoContent();
    }

    private async Task<string> GetReviewUrlAsync() => (await _branding.GetAsync()).GoogleReviewUrl;

    private static int ClampRating(int value) => Math.Clamp(value, 1, 5);

    private static int ClampScale(int value, int min, int max) => Math.Clamp(value, min, max);

    private static string CleanOption(string? value)
    {
        var text = (value ?? string.Empty).Trim();
        return text.Length <= 120 ? text : text[..120];
    }

    private static string Clean(string? value)
    {
        var text = (value ?? string.Empty).Trim();
        return text.Length <= 2500 ? text : text[..2500];
    }
}

public sealed class SubmitFeedbackRequest
{
    public int? ReservationId { get; set; }
    public string? GuestName { get; set; }
    public string? Email { get; set; }
    public int AtmosphereRating { get; set; } = 5;
    public string? AtmosphereImpression { get; set; }
    public string? AtmosphereChange { get; set; }
    public int FoodRating { get; set; } = 5;
    public string? FoodImpression { get; set; }
    public string? FoodChange { get; set; }
    public int ServiceRating { get; set; } = 5;
    public string? ServiceImpression { get; set; }
    public string? ServiceChange { get; set; }
    public int OnlineReservationRating { get; set; } = 5;
    public string? OnlineReservationFeedback { get; set; }
    public string? OnlineReservationEase { get; set; }
    public int TableMapRating { get; set; } = 5;
    public int TableMapUsefulnessRating { get; set; } = 5;
    public string? TableMapFavoriteFeature { get; set; }
    public string? TableMapReuseIntent { get; set; }
    public string? TableChoiceImportance { get; set; }
    public int SoftwareRating { get; set; } = 5;
    public string? SoftwareFeedback { get; set; }
    public string? MostUsefulDigitalFeature { get; set; }
    public string? ClientCareFeedback { get; set; }
    public string? SmallDetailsFeedback { get; set; }
    public int ReturnLikelihood { get; set; } = 10;
    public int RecommendLikelihood { get; set; } = 10;
    public string? OneThingToChange { get; set; }
    public bool GoogleReviewClicked { get; set; }
}
