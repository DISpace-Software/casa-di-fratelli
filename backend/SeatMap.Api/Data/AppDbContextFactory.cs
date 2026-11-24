using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace SeatMap.Api.Data;

public class AppDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var optionsBuilder = new DbContextOptionsBuilder<AppDbContext>();
        if (args.Contains("--postgres"))
            optionsBuilder.UseNpgsql("Host=localhost;Database=seatmap_design_only;Username=design_only");
        else
            optionsBuilder.UseSqlite("Data Source=casadifratelli.db");

        return new AppDbContext(optionsBuilder.Options);
    }
}