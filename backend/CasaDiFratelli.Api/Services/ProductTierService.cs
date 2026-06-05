using CasaDiFratelli.Api.Data;
using CasaDiFratelli.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CasaDiFratelli.Api.Services;

public class ProductTierService
{
    public const string Basic = "Basic";
    public const string Pro = "Pro";
    private const string ProductTierKey = "ProductTier";
    private readonly AppDbContext _db;

    public ProductTierService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<string> GetTierAsync()
    {
        var value = await _db.AppSettings
            .Where(x => x.Key == ProductTierKey)
            .Select(x => x.Value)
            .FirstOrDefaultAsync();

        return string.Equals(value, Pro, StringComparison.OrdinalIgnoreCase) ? Pro : Basic;
    }

    public async Task<bool> IsProAsync()
    {
        return string.Equals(await GetTierAsync(), Pro, StringComparison.OrdinalIgnoreCase);
    }

    public async Task<string> UnlockProAsync()
    {
        var setting = await _db.AppSettings.FirstOrDefaultAsync(x => x.Key == ProductTierKey);
        if (setting == null)
        {
            setting = new AppSetting { Key = ProductTierKey };
            _db.AppSettings.Add(setting);
        }

        setting.Value = Pro;
        setting.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Pro;
    }
}
