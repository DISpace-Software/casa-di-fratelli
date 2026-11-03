using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace SeatMap.Api.Platform.Data;

public sealed class PlatformDbContextFactory : IDesignTimeDbContextFactory<PlatformDbContext>
{
    public PlatformDbContext CreateDbContext(string[] args)
    {
        // Scaffolding/scripts never require or discover production credentials.
        // Use the application's MigratePlatform command to apply migrations.
        var options = new DbContextOptionsBuilder<PlatformDbContext>()
            .UseNpgsql("Host=localhost;Database=seatmap_design_only;Username=design_only").Options;
        return new PlatformDbContext(options);
    }
}
