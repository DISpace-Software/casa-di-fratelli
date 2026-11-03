using SeatMap.Api.Platform.Models;
using Microsoft.EntityFrameworkCore;

namespace SeatMap.Api.Platform.Data;

// Deliberately independent of AppDbContext and CurrentTenant.
public sealed class PlatformDbContext(DbContextOptions<PlatformDbContext> options) : DbContext(options)
{
    public DbSet<GuestProfile> GuestProfiles => Set<GuestProfile>();
    public DbSet<GuestFavorite> GuestFavorites => Set<GuestFavorite>();
    public DbSet<GuestReservationReference> GuestReservationReferences => Set<GuestReservationReference>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<GuestProfile>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.IdentityIssuer).IsRequired().HasMaxLength(300);
            entity.Property(x => x.IdentitySubject).IsRequired().HasMaxLength(300);
            entity.HasIndex(x => new { x.IdentityIssuer, x.IdentitySubject }).IsUnique();
            entity.Property(x => x.DisplayName).IsRequired().HasMaxLength(120);
            entity.Property(x => x.Phone).HasMaxLength(50);
            entity.Property(x => x.Email).HasMaxLength(254);
        });
        modelBuilder.Entity<GuestFavorite>(entity =>
        {
            entity.HasKey(x => new { x.GuestProfileId, x.RestaurantId });
            entity.Property(x => x.RestaurantId).HasMaxLength(100);
            entity.HasOne<GuestProfile>().WithMany().HasForeignKey(x => x.GuestProfileId)
                .OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<GuestReservationReference>(entity =>
        {
            entity.HasKey(x => new { x.RestaurantId, x.ReservationId });
            entity.Property(x => x.RestaurantId).HasMaxLength(100);
            entity.Property(x => x.ReservedTime).IsRequired().HasMaxLength(20);
            entity.Property(x => x.Status).IsRequired().HasMaxLength(30);
            entity.HasIndex(x => new { x.GuestProfileId, x.ReservedDate });
            entity.HasOne<GuestProfile>().WithMany().HasForeignKey(x => x.GuestProfileId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
