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
    private readonly IConfiguration _configuration;
    private readonly AuditService _audit;

    public FeedbackController(AppDbContext db, IConfiguration configuration, AuditService audit)
    {
        _db = db;
        _configuration = configuration;
        _audit = audit;
    }

    [HttpGet("meta")]
    public IActionResult GetMeta()
    {
        return Ok(new
        {
            reviewUrl = GetReviewUrl()
        });
    }

    [HttpGet]
    [AdminAuthorize]
    public async Task<IActionResult> GetAll()
    {
        var feedback = await _db.CustomerFeedbacks
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
                x.SoftwareRating,
                x.SoftwareFeedback,
                x.ClientCareFeedback,
                x.SmallDetailsFeedback,
                x.GoogleReviewClicked,
                x.DiscountCode,
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
            SoftwareRating = ClampRating(request.SoftwareRating),
            SoftwareFeedback = Clean(request.SoftwareFeedback),
            ClientCareFeedback = Clean(request.ClientCareFeedback),
            SmallDetailsFeedback = Clean(request.SmallDetailsFeedback),
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
            reviewUrl = GetReviewUrl()
        });
    }

    private string GetReviewUrl()
    {
        return (_configuration["REVIEW_URL"] ??
            "https://www.google.com/maps/search/?api=1&query=Casa%20di%20Fratelli%20Vechernitsa%209%20Plovdiv").Trim();
    }

    private static int ClampRating(int value) => Math.Clamp(value, 1, 5);

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
    public int SoftwareRating { get; set; } = 5;
    public string? SoftwareFeedback { get; set; }
    public string? ClientCareFeedback { get; set; }
    public string? SmallDetailsFeedback { get; set; }
    public bool GoogleReviewClicked { get; set; }
}
