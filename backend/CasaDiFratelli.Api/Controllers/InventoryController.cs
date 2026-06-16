using CasaDiFratelli.Api.Data;
using CasaDiFratelli.Api.Filters;
using CasaDiFratelli.Api.Models;
using CasaDiFratelli.Api.Services;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CasaDiFratelli.Api.Controllers;

[ApiController]
[Route("api/inventory")]
[AdminAuthorize]
[ProOnly]
public class InventoryController : ControllerBase
{
    private static readonly string[] Units = { "g", "kg", "ml", "l", "pcs" };
    private static readonly string[] MovementTypes = { "Receipt", "SaleConsumption", "ManualAdjustment", "InventoryCorrection", "Waste" };

    private readonly AppDbContext _db;
    private readonly AuditService _audit;
    private readonly InventoryRecipeSeedService _recipeSeed;

    public InventoryController(AppDbContext db, AuditService audit, InventoryRecipeSeedService recipeSeed)
    {
        _db = db;
        _audit = audit;
        _recipeSeed = recipeSeed;
    }

    [HttpGet("items")]
    public async Task<IActionResult> GetItems([FromQuery] string? search = null, [FromQuery] bool lowStock = false)
    {
        var query = _db.InventoryItems.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(x => x.Name.ToLower().Contains(term) || x.Category.ToLower().Contains(term));
        }

        if (lowStock)
            query = query.Where(x => x.IsActive && x.CurrentQuantity <= x.MinimumQuantity);

        var items = await query
            .OrderBy(x => x.Category)
            .ThenBy(x => x.Name)
            .Select(x => new
            {
                x.Id,
                x.Name,
                x.Category,
                x.Unit,
                x.CurrentQuantity,
                x.MinimumQuantity,
                x.UnitCost,
                x.IsActive,
                IsLowStock = x.IsActive && x.CurrentQuantity <= x.MinimumQuantity,
                x.CreatedAtUtc,
                x.UpdatedAtUtc
            })
            .ToListAsync();

        return Ok(items);
    }

    [HttpPost("items")]
    public async Task<IActionResult> CreateItem([FromBody] InventoryItemRequest request)
    {
        var validation = ValidateItemRequest(request);
        if (validation != null) return validation;

        var item = new InventoryItem
        {
            Name = request.Name.Trim(),
            Category = request.Category.Trim(),
            Unit = NormalizeUnit(request.Unit),
            CurrentQuantity = request.CurrentQuantity,
            MinimumQuantity = request.MinimumQuantity,
            UnitCost = request.UnitCost,
            IsActive = request.IsActive,
            CreatedAtUtc = DateTime.UtcNow
        };

        _db.InventoryItems.Add(item);
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "create", "InventoryItem", item.Id.ToString(), after: item);

        return Ok(item);
    }

    [HttpPut("items/{id:int}")]
    public async Task<IActionResult> UpdateItem(int id, [FromBody] InventoryItemRequest request)
    {
        var item = await _db.InventoryItems.FindAsync(id);
        if (item == null) return NotFound();

        var validation = ValidateItemRequest(request);
        if (validation != null) return validation;

        var before = new { item.Name, item.Category, item.Unit, item.CurrentQuantity, item.MinimumQuantity, item.UnitCost, item.IsActive };
        item.Name = request.Name.Trim();
        item.Category = request.Category.Trim();
        item.Unit = NormalizeUnit(request.Unit);
        item.CurrentQuantity = request.CurrentQuantity;
        item.MinimumQuantity = request.MinimumQuantity;
        item.UnitCost = request.UnitCost;
        item.IsActive = request.IsActive;
        item.UpdatedAtUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "update", "InventoryItem", item.Id.ToString(), before, item);

        return Ok(item);
    }

    [HttpDelete("items/{id:int}")]
    public async Task<IActionResult> DeleteItem(int id)
    {
        var item = await _db.InventoryItems.FindAsync(id);
        if (item == null) return NotFound();

        var hasUsage = await _db.MenuItemRecipeIngredients.AnyAsync(x => x.InventoryItemId == id)
            || await _db.InventoryMovements.AnyAsync(x => x.InventoryItemId == id)
            || await _db.InventoryAuditLines.AnyAsync(x => x.InventoryItemId == id)
            || await _db.DiningOrderItemInventoryExtras.AnyAsync(x => x.InventoryItemId == id);

        if (hasUsage)
        {
            item.IsActive = false;
            item.UpdatedAtUtc = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            await _audit.RecordAsync(HttpContext, "deactivate", "InventoryItem", item.Id.ToString(), after: new { item.Id, item.IsActive });
            return Ok(new { item.Id, item.IsActive, Mode = "Deactivated" });
        }

        _db.InventoryItems.Remove(item);
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "delete", "InventoryItem", item.Id.ToString(), before: item);

        return Ok(new { item.Id, Mode = "Deleted" });
    }

    [HttpPost("items/{id:int}/activate")]
    public async Task<IActionResult> ActivateItem(int id)
    {
        var item = await _db.InventoryItems.FindAsync(id);
        if (item == null) return NotFound();

        item.IsActive = true;
        item.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "activate", "InventoryItem", item.Id.ToString(), after: new { item.Id, item.IsActive });

        return Ok(item);
    }

    [HttpGet("low-stock")]
    public Task<IActionResult> GetLowStock()
    {
        return GetItems(lowStock: true);
    }

    [HttpPost("seed-test-recipes")]
    public async Task<IActionResult> SeedTestRecipes()
    {
        var admin = AdminAuthService.Current(HttpContext);
        if (AdminRoleAccess.Normalize(admin?.Role) is not (AdminRoleAccess.Administrator or AdminRoleAccess.Owner or AdminRoleAccess.Developer))
            return Forbid();

        var result = await _recipeSeed.SeedAsync();
        await _audit.RecordAsync(HttpContext, "seed-test-recipes", "Inventory", "recipes", after: result);
        return Ok(result);
    }

    [HttpGet("movements")]
    public async Task<IActionResult> GetMovements([FromQuery] int? itemId = null, [FromQuery] string? type = null)
    {
        var query = _db.InventoryMovements
            .Include(x => x.InventoryItem)
            .AsNoTracking()
            .AsQueryable();

        if (itemId.HasValue) query = query.Where(x => x.InventoryItemId == itemId.Value);
        if (!string.IsNullOrWhiteSpace(type)) query = query.Where(x => x.Type == type.Trim());

        var movements = await query
            .OrderByDescending(x => x.CreatedAtUtc)
            .Take(300)
            .Select(x => new
            {
                x.Id,
                x.InventoryItemId,
                Ingredient = x.InventoryItem == null ? null : x.InventoryItem.Name,
                Unit = x.InventoryItem == null ? null : x.InventoryItem.Unit,
                x.Quantity,
                x.Type,
                x.CreatedAtUtc,
                x.AdminUserId,
                x.AdminName,
                x.Comment,
                x.DiningOrderId,
                x.DiningOrderItemId,
                x.InventoryAuditId
            })
            .ToListAsync();

        return Ok(movements);
    }

    [HttpPost("adjustment")]
    public async Task<IActionResult> CreateAdjustment([FromBody] InventoryAdjustmentRequest request)
    {
        if (!MovementTypes.Contains(request.Type) || request.Type == "SaleConsumption" || request.Type == "InventoryCorrection")
            return BadRequest(new { message = "Invalid manual movement type." });

        if (request.Quantity == 0)
            return BadRequest(new { message = "Quantity must not be zero." });

        var item = await _db.InventoryItems.FindAsync(request.InventoryItemId);
        if (item == null) return NotFound();

        var admin = AdminAuthService.Current(HttpContext);
        item.CurrentQuantity += request.Quantity;
        item.UpdatedAtUtc = DateTime.UtcNow;

        var movement = new InventoryMovement
        {
            InventoryItemId = item.Id,
            Quantity = request.Quantity,
            Type = request.Type,
            CreatedAtUtc = DateTime.UtcNow,
            AdminUserId = admin?.Id,
            AdminName = admin?.Name,
            Comment = request.Comment
        };
        _db.InventoryMovements.Add(movement);

        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "adjust", "InventoryItem", item.Id.ToString(), after: new { item.Id, item.CurrentQuantity, movement.Type, movement.Quantity });

        return Ok(new { item.Id, item.CurrentQuantity, Movement = movement });
    }

    private BadRequestObjectResult? ValidateItemRequest(InventoryItemRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { message = "Ingredient name is required." });

        if (!Units.Contains(NormalizeUnit(request.Unit)))
            return BadRequest(new { message = "Invalid unit." });

        if (request.CurrentQuantity < 0 || request.MinimumQuantity < 0 || request.UnitCost < 0)
            return BadRequest(new { message = "Quantities and cost must be positive." });

        return null;
    }

    private static string NormalizeUnit(string? unit)
    {
        var normalized = (unit ?? "g").Trim().ToLowerInvariant();
        return normalized switch
        {
            "gram" or "grams" or "гр" or "г" => "g",
            "kilogram" or "kilograms" or "кг" => "kg",
            "milliliter" or "milliliters" or "мл" => "ml",
            "liter" or "liters" or "л" => "l",
            "piece" or "pieces" or "бр" or "брой" => "pcs",
            _ => normalized
        };
    }
}

[ApiController]
[Route("api/recipes")]
[AdminAuthorize]
[ProOnly]
public class RecipesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AuditService _audit;

    public RecipesController(AppDbContext db, AuditService audit)
    {
        _db = db;
        _audit = audit;
    }

    [HttpGet("menu-item/{menuItemId:int}")]
    public async Task<IActionResult> GetRecipe(int menuItemId)
    {
        var menuItem = await _db.MenuItems.AsNoTracking().FirstOrDefaultAsync(x => x.Id == menuItemId);
        if (menuItem == null) return NotFound();

        var lines = await _db.MenuItemRecipeIngredients
            .Include(x => x.InventoryItem)
            .AsNoTracking()
            .Where(x => x.MenuItemId == menuItemId)
            .OrderBy(x => x.InventoryItem!.Name)
            .ToListAsync();

        var cost = lines.Sum(x => x.Quantity * (x.InventoryItem?.UnitCost ?? 0));
        var margin = menuItem.Price - cost;
        var foodCostPercent = menuItem.Price > 0 ? Math.Round(cost / menuItem.Price * 100, 2) : 0;

        return Ok(new
        {
            MenuItem = new { menuItem.Id, menuItem.NameBg, menuItem.NameEn, menuItem.Price, menuItem.Department, menuItem.Category },
            Lines = lines.Select(x => new
            {
                x.Id,
                x.InventoryItemId,
                Ingredient = x.InventoryItem?.Name,
                Unit = x.InventoryItem?.Unit,
                x.Quantity,
                UnitCost = x.InventoryItem?.UnitCost ?? 0,
                Cost = x.Quantity * (x.InventoryItem?.UnitCost ?? 0),
                x.Notes
            }),
            Cost = cost,
            SalePrice = menuItem.Price,
            Margin = margin,
            FoodCostPercent = foodCostPercent
        });
    }

    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary()
    {
        var menuItems = await _db.MenuItems
            .AsNoTracking()
            .Where(x => x.IsActive)
            .OrderBy(x => x.Department)
            .ThenBy(x => x.Category)
            .ThenBy(x => x.NameBg)
            .Select(x => new
            {
                x.Id,
                x.NameBg,
                x.NameEn,
                x.Category,
                x.Department,
                x.Price
            })
            .ToListAsync();

        var recipes = await _db.MenuItemRecipeIngredients
            .Include(x => x.InventoryItem)
            .AsNoTracking()
            .ToListAsync();

        var recipeLookup = recipes
            .GroupBy(x => x.MenuItemId)
            .ToDictionary(
                group => group.Key,
                group => new
                {
                    Lines = group.Count(),
                    Cost = group.Sum(x => x.Quantity * (x.InventoryItem?.UnitCost ?? 0)),
                    MissingInactive = group.Count(x => x.InventoryItem == null || !x.InventoryItem.IsActive)
                });

        var result = menuItems.Select(item =>
        {
            recipeLookup.TryGetValue(item.Id, out var recipe);
            var cost = recipe?.Cost ?? 0;
            return new
            {
                item.Id,
                item.NameBg,
                item.NameEn,
                item.Category,
                item.Department,
                SalePrice = item.Price,
                Lines = recipe?.Lines ?? 0,
                Cost = cost,
                Margin = item.Price - cost,
                FoodCostPercent = item.Price > 0 ? Math.Round(cost / item.Price * 100, 2) : 0,
                MissingInactive = recipe?.MissingInactive ?? 0,
                Status = recipe == null || recipe.Lines == 0
                    ? "Missing"
                    : recipe.MissingInactive > 0
                        ? "NeedsAttention"
                        : "Ready"
            };
        });

        return Ok(result);
    }

    [HttpPost("menu-item/{menuItemId:int}")]
    [HttpPut("menu-item/{menuItemId:int}")]
    public async Task<IActionResult> SaveRecipe(int menuItemId, [FromBody] SaveRecipeRequest request)
    {
        var menuItem = await _db.MenuItems.FindAsync(menuItemId);
        if (menuItem == null) return NotFound();

        if (request.Lines.Any(x => x.InventoryItemId <= 0 || x.Quantity <= 0))
            return BadRequest(new { message = "Recipe line must contain ingredient and positive quantity." });

        var before = await _db.MenuItemRecipeIngredients
            .Where(x => x.MenuItemId == menuItemId)
            .Select(x => new { x.InventoryItemId, x.Quantity, x.Notes })
            .ToListAsync();

        var existing = await _db.MenuItemRecipeIngredients
            .Where(x => x.MenuItemId == menuItemId)
            .ToListAsync();
        _db.MenuItemRecipeIngredients.RemoveRange(existing);

        var lines = request.Lines
            .GroupBy(x => x.InventoryItemId)
            .Select(group => new MenuItemRecipeIngredient
            {
                MenuItemId = menuItemId,
                InventoryItemId = group.Key,
                Quantity = group.Sum(x => x.Quantity),
                Notes = group.Select(x => x.Notes).FirstOrDefault(x => !string.IsNullOrWhiteSpace(x))?.Trim()
            })
            .ToList();

        _db.MenuItemRecipeIngredients.AddRange(lines);
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "save-recipe", "MenuItem", menuItemId.ToString(), before, lines);

        return await GetRecipe(menuItemId);
    }

    [HttpDelete("menu-item/{menuItemId:int}")]
    public async Task<IActionResult> DeleteRecipe(int menuItemId)
    {
        var existing = await _db.MenuItemRecipeIngredients
            .Where(x => x.MenuItemId == menuItemId)
            .ToListAsync();

        if (existing.Count == 0)
            return NoContent();

        var before = existing.Select(x => new { x.InventoryItemId, x.Quantity, x.Notes }).ToList();
        _db.MenuItemRecipeIngredients.RemoveRange(existing);
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "delete-recipe", "MenuItem", menuItemId.ToString(), before);

        return NoContent();
    }
}

[ApiController]
[Route("api/inventory/audits")]
[AdminAuthorize]
[ProOnly]
public class InventoryAuditsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AuditService _audit;

    public InventoryAuditsController(AppDbContext db, AuditService audit)
    {
        _db = db;
        _audit = audit;
    }

    [HttpGet]
    public async Task<IActionResult> GetAudits()
    {
        var audits = await _db.InventoryAudits
            .Include(x => x.Lines)
            .AsNoTracking()
            .OrderByDescending(x => x.CreatedAtUtc)
            .Take(100)
            .Select(x => new
            {
                x.Id,
                x.Title,
                x.Status,
                x.CreatedByAdminName,
                x.CreatedAtUtc,
                x.ConfirmedAtUtc,
                x.ConfirmedByAdminName,
                Lines = x.Lines.Count,
                Difference = x.Lines.Sum(line => line.DifferenceQuantity)
            })
            .ToListAsync();

        return Ok(audits);
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetAudit(int id)
    {
        var audit = await _db.InventoryAudits
            .Include(x => x.Lines)
                .ThenInclude(x => x.InventoryItem)
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == id);

        if (audit == null) return NotFound();

        return Ok(new
        {
            audit.Id,
            audit.Title,
            audit.Status,
            audit.CreatedByAdminUserId,
            audit.CreatedByAdminName,
            audit.CreatedAtUtc,
            audit.ConfirmedAtUtc,
            audit.ConfirmedByAdminUserId,
            audit.ConfirmedByAdminName,
            Lines = audit.Lines.OrderBy(x => x.InventoryItem!.Category).ThenBy(x => x.InventoryItem!.Name).Select(x => new
            {
                x.Id,
                x.InventoryItemId,
                Ingredient = x.InventoryItem?.Name,
                Category = x.InventoryItem?.Category,
                Unit = x.InventoryItem?.Unit,
                x.ExpectedQuantity,
                x.ActualQuantity,
                x.DifferenceQuantity,
                x.Comment
            })
        });
    }

    [HttpGet("{id:int}/export")]
    public async Task<IActionResult> ExportAudit(int id)
    {
        var audit = await _db.InventoryAudits
            .Include(x => x.Lines)
                .ThenInclude(x => x.InventoryItem)
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == id);

        if (audit == null) return NotFound();

        var csv = new StringBuilder();
        csv.AppendLine("Ingredient,Category,Expected,Actual,Difference,Unit,Comment");
        foreach (var line in audit.Lines.OrderBy(x => x.InventoryItem!.Category).ThenBy(x => x.InventoryItem!.Name))
        {
            csv.AppendLine(string.Join(",",
                Csv(line.InventoryItem?.Name),
                Csv(line.InventoryItem?.Category),
                line.ExpectedQuantity,
                line.ActualQuantity,
                line.DifferenceQuantity,
                Csv(line.InventoryItem?.Unit),
                Csv(line.Comment)));
        }

        return File(Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(csv.ToString())).ToArray(), "text/csv", $"inventory-audit-{audit.Id}.csv");
    }

    [HttpPost]
    public async Task<IActionResult> CreateAudit([FromBody] CreateInventoryAuditRequest request)
    {
        var admin = AdminAuthService.Current(HttpContext);
        var inventory = await _db.InventoryItems
            .Where(x => x.IsActive)
            .OrderBy(x => x.Category)
            .ThenBy(x => x.Name)
            .ToListAsync();

        var provided = request.Lines.ToDictionary(x => x.InventoryItemId, x => x);
        var audit = new InventoryAudit
        {
            Title = string.IsNullOrWhiteSpace(request.Title)
                ? $"Ревизия {DateTime.UtcNow:yyyy-MM-dd HH:mm}"
                : request.Title.Trim(),
            Status = "Draft",
            CreatedAtUtc = DateTime.UtcNow,
            CreatedByAdminUserId = admin?.Id,
            CreatedByAdminName = admin?.Name,
            Lines = inventory.Select(item =>
            {
                provided.TryGetValue(item.Id, out var line);
                var actual = line?.ActualQuantity ?? item.CurrentQuantity;
                return new InventoryAuditLine
                {
                    InventoryItemId = item.Id,
                    ExpectedQuantity = item.CurrentQuantity,
                    ActualQuantity = actual,
                    DifferenceQuantity = actual - item.CurrentQuantity,
                    Comment = line?.Comment
                };
            }).ToList()
        };

        _db.InventoryAudits.Add(audit);
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "create-audit", "InventoryAudit", audit.Id.ToString(), after: new { audit.Id, audit.Title });

        return await GetAudit(audit.Id);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> UpdateAudit(int id, [FromBody] ConfirmInventoryAuditRequest request)
    {
        var audit = await _db.InventoryAudits
            .Include(x => x.Lines)
            .FirstOrDefaultAsync(x => x.Id == id);

        if (audit == null) return NotFound();
        if (audit.Status == "Confirmed") return Conflict(new { message = "Confirmed audit cannot be edited." });

        var provided = request.Lines.ToDictionary(x => x.InventoryItemId, x => x);
        foreach (var line in audit.Lines)
        {
            if (!provided.TryGetValue(line.InventoryItemId, out var next)) continue;

            line.ActualQuantity = next.ActualQuantity;
            line.DifferenceQuantity = line.ActualQuantity - line.ExpectedQuantity;
            line.Comment = next.Comment;
        }

        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "update-audit", "InventoryAudit", audit.Id.ToString(), after: new { audit.Id, Lines = audit.Lines.Count });

        return await GetAudit(audit.Id);
    }

    [HttpPost("{id:int}/confirm")]
    public async Task<IActionResult> ConfirmAudit(int id, [FromBody] ConfirmInventoryAuditRequest request)
    {
        var audit = await _db.InventoryAudits
            .Include(x => x.Lines)
            .FirstOrDefaultAsync(x => x.Id == id);

        if (audit == null) return NotFound();
        if (audit.Status == "Confirmed") return Conflict(new { message = "Audit is already confirmed." });

        var admin = AdminAuthService.Current(HttpContext);
        var now = DateTime.UtcNow;

        var provided = request.Lines.ToDictionary(x => x.InventoryItemId, x => x);
        foreach (var line in audit.Lines)
        {
            if (provided.TryGetValue(line.InventoryItemId, out var next))
            {
                line.ActualQuantity = next.ActualQuantity;
                line.Comment = next.Comment;
            }

            line.DifferenceQuantity = line.ActualQuantity - line.ExpectedQuantity;
        }

        var itemIds = audit.Lines.Select(x => x.InventoryItemId).ToList();
        var items = await _db.InventoryItems.Where(x => itemIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id);

        foreach (var line in audit.Lines)
        {
            if (!items.TryGetValue(line.InventoryItemId, out var item)) continue;
            if (line.DifferenceQuantity == 0) continue;

            item.CurrentQuantity = line.ActualQuantity;
            item.UpdatedAtUtc = now;
            _db.InventoryMovements.Add(new InventoryMovement
            {
                InventoryItemId = item.Id,
                Quantity = line.DifferenceQuantity,
                Type = "InventoryCorrection",
                CreatedAtUtc = now,
                AdminUserId = admin?.Id,
                AdminName = admin?.Name,
                Comment = line.Comment ?? $"Inventory audit #{audit.Id}",
                InventoryAuditId = audit.Id
            });
        }

        audit.Status = "Confirmed";
        audit.ConfirmedAtUtc = now;
        audit.ConfirmedByAdminUserId = admin?.Id;
        audit.ConfirmedByAdminName = admin?.Name;

        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "confirm-audit", "InventoryAudit", audit.Id.ToString(), after: new { audit.Id, audit.Status });

        return await GetAudit(audit.Id);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> DeleteAudit(int id)
    {
        var audit = await _db.InventoryAudits
            .Include(x => x.Lines)
            .FirstOrDefaultAsync(x => x.Id == id);

        if (audit == null) return NotFound();
        if (audit.Status == "Confirmed")
            return Conflict(new { message = "Confirmed audit cannot be deleted." });

        _db.InventoryAuditLines.RemoveRange(audit.Lines);
        _db.InventoryAudits.Remove(audit);
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "delete-audit", "InventoryAudit", id.ToString(), before: new { audit.Id, audit.Title });

        return NoContent();
    }

    private static string Csv(string? value)
    {
        var escaped = (value ?? string.Empty).Replace("\"", "\"\"");
        return $"\"{escaped}\"";
    }
}

public class InventoryItemRequest
{
    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Unit { get; set; } = "g";
    public decimal CurrentQuantity { get; set; }
    public decimal MinimumQuantity { get; set; }
    public decimal UnitCost { get; set; }
    public bool IsActive { get; set; } = true;
}

public class InventoryAdjustmentRequest
{
    public int InventoryItemId { get; set; }
    public decimal Quantity { get; set; }
    public string Type { get; set; } = "ManualAdjustment";
    public string? Comment { get; set; }
}

public class SaveRecipeRequest
{
    public List<SaveRecipeLineRequest> Lines { get; set; } = new();
}

public class SaveRecipeLineRequest
{
    public int InventoryItemId { get; set; }
    public decimal Quantity { get; set; }
    public string? Notes { get; set; }
}

public class CreateInventoryAuditRequest
{
    public string? Title { get; set; }
    public List<InventoryAuditLineRequest> Lines { get; set; } = new();
}

public class ConfirmInventoryAuditRequest
{
    public List<InventoryAuditLineRequest> Lines { get; set; } = new();
}

public class InventoryAuditLineRequest
{
    public int InventoryItemId { get; set; }
    public decimal ActualQuantity { get; set; }
    public string? Comment { get; set; }
}
