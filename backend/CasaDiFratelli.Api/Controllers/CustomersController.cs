using CasaDiFratelli.Api.Data;
using CasaDiFratelli.Api.Filters;
using CasaDiFratelli.Api.Models;
using CasaDiFratelli.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CasaDiFratelli.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[AdminAuthorize]
public class CustomersController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AuditService _audit;

    public CustomersController(AppDbContext db, AuditService audit)
    {
        _db = db;
        _audit = audit;
    }

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var customers = await _db.CustomerProfiles
            .OrderByDescending(x => x.LastReservationAtUtc)
            .ThenBy(x => x.GuestName)
            .Select(x => new
            {
                x.Id,
                x.GuestName,
                x.Phone,
                x.Email,
                x.ReservationCount,
                x.IsRegularCustomer,
                x.BirthDate,
                x.MarketingConsent,
                x.FirstReservationAtUtc,
                x.LastReservationAtUtc
            })
            .ToListAsync();

        return Ok(customers);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateCustomerRequest request)
    {
        var guestName = request.GuestName?.Trim();
        var phone = request.Phone?.Trim();
        var email = request.Email?.Trim();

        if (string.IsNullOrWhiteSpace(guestName))
            return BadRequest(new { message = "Guest name is required." });

        if (string.IsNullOrWhiteSpace(phone) && string.IsNullOrWhiteSpace(email))
            return BadRequest(new { message = "Phone or email is required." });

        var existing = await _db.CustomerProfiles.FirstOrDefaultAsync(x =>
            (!string.IsNullOrWhiteSpace(email) && x.Email == email) ||
            (!string.IsNullOrWhiteSpace(phone) && x.Phone == phone));

        if (existing != null)
        {
            existing.GuestName = guestName;
            existing.Phone = string.IsNullOrWhiteSpace(existing.Phone) ? phone : existing.Phone;
            existing.Email = string.IsNullOrWhiteSpace(existing.Email) ? email : existing.Email;
            existing.BirthDate = request.BirthDate ?? existing.BirthDate;
            existing.MarketingConsent = existing.MarketingConsent || request.MarketingConsent;
            existing.LastReservationAtUtc = DateTime.UtcNow;

            await _db.SaveChangesAsync();
            await _audit.RecordAsync(HttpContext, "update-manual", "CustomerProfile", existing.Id.ToString(), after: existing);

            return Ok(existing);
        }

        var customer = new CustomerProfile
        {
            GuestName = guestName,
            Phone = phone,
            Email = email,
            BirthDate = request.BirthDate,
            MarketingConsent = request.MarketingConsent,
            ReservationCount = 0,
            IsRegularCustomer = false,
            FirstReservationAtUtc = DateTime.UtcNow,
            LastReservationAtUtc = DateTime.UtcNow
        };

        _db.CustomerProfiles.Add(customer);
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "create-manual", "CustomerProfile", customer.Id.ToString(), after: customer);

        return Ok(customer);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var customer = await _db.CustomerProfiles.FirstOrDefaultAsync(x => x.Id == id);
        if (customer == null)
            return NotFound(new { message = "Customer not found." });

        var before = new
        {
            customer.Id,
            customer.GuestName,
            customer.Phone,
            customer.Email,
            customer.ReservationCount,
            customer.IsRegularCustomer,
            customer.BirthDate,
            customer.MarketingConsent,
            customer.FirstReservationAtUtc,
            customer.LastReservationAtUtc
        };

        _db.CustomerProfiles.Remove(customer);
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "delete", "CustomerProfile", id.ToString(), before: before);

        return NoContent();
    }
}

public sealed class CreateCustomerRequest
{
    public string? GuestName { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public DateOnly? BirthDate { get; set; }
    public bool MarketingConsent { get; set; }
}
