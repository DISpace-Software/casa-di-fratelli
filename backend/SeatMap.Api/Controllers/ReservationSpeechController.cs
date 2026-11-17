using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using SeatMap.Api.Filters;
using SeatMap.Api.Models;
using SeatMap.Api.Services;
using SeatMap.Api.Services.Reservations;
using SeatMap.Api.Services.Tenancy;

namespace SeatMap.Api.Controllers;

[ApiController]
[Route("api/admin/reservations/voice")]
[AdminAuthorize(AdminRoleAccess.Administrator, AdminRoleAccess.Owner, AdminRoleAccess.Developer)]
public sealed class ReservationSpeechController(
    ICurrentTenant tenant, IOptions<ReservationSpeechOptions> options,
    ReservationSpeechService speech, ReservationSpeechGate gate) : ControllerBase
{
    [HttpGet("capabilities")]
    public IActionResult Capabilities()
    {
        Response.Headers.CacheControl = "no-store";
        return Ok(new { enabled = tenant.IsResolved && options.Value.AllowsTenant(tenant.TenantId) && speech.IsConfigured,
            languages = new[] { "bg", "ru", "en" }, maxAudioBytes = ReservationSpeechAudio.MaxAudioBytes });
    }

    [HttpPost("transcribe")]
    [RequestSizeLimit(ReservationSpeechAudio.MaxRequestBytes)]
    public async Task<IActionResult> Transcribe()
    {
        Response.Headers.CacheControl = "no-store";
        var admin = AdminAuthService.Current(HttpContext);
        if (admin is null) return Unauthorized(new { code = "unauthorized" });
        if (!tenant.IsResolved || !options.Value.AllowsTenant(tenant.TenantId)) return NotFound(new { code = "unavailable" });
        if (!speech.IsConfigured) return StatusCode(503, new { code = "unavailable" });
        using var lease = gate.TryEnter(tenant.TenantId, admin.Id, out var rejection);
        if (lease is null)
        {
            Response.Headers.RetryAfter = rejection == "busy" ? "5" : "60";
            return StatusCode(429, new { code = rejection });
        }
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(HttpContext.RequestAborted);
        deadline.CancelAfter(TimeSpan.FromSeconds(20));
        ReservationSpeechAudio? audio = null;
        try
        {
            audio = await ReservationSpeechAudio.ReadAsync(Request, deadline.Token);
            var text = await speech.TranscribeAsync(audio, deadline.Token);
            return Ok(new { text });
        }
        catch (ReservationSpeechException error) { return StatusCode(error.StatusCode, new { code = error.Code }); }
        catch (OperationCanceledException) when (!HttpContext.RequestAborted.IsCancellationRequested) { return StatusCode(504, new { code = "timeout" }); }
        catch (OperationCanceledException) { return new EmptyResult(); }
        catch (BadHttpRequestException error) when (error.StatusCode == 413) { return StatusCode(413, new { code = "audio-too-large" }); }
        catch (InvalidDataException) { return BadRequest(new { code = "invalid-audio" }); }
        catch (IOException) { return BadRequest(new { code = "invalid-audio" }); }
        finally { if (audio is not null) Array.Clear(audio.Bytes); }
    }
}
