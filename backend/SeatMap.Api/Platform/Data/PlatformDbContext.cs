using SeatMap.Api.Platform.Models;
using Microsoft.EntityFrameworkCore;

namespace SeatMap.Api.Platform.Data;

// Deliberately independent of AppDbContext and CurrentTenant.
public sealed class PlatformDbContext(DbContextOptions<PlatformDbContext> options) : DbContext(options)
{
    public DbSet<GuestProfile> GuestProfiles => Set<GuestProfile>();
    public DbSet<GuestFavorite> GuestFavorites => Set<GuestFavorite>();
    public DbSet<GuestReservationReference> GuestReservationReferences => Set<GuestReservationReference>();

    public DbSet<GuestCredential> GuestCredentials => Set<GuestCredential>();
    public DbSet<GuestSession> GuestSessions => Set<GuestSession>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<GuestProfile>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.IdentityIssuer).IsRequired().HasMaxLength(300);
            entity.Property(x => x.IdentitySubject).IsRequired().HasMaxLength(300);
            entity.HasIndex(x => new { x.IdentityIssuer, x.IdentitySubject }).IsUnique();
            entity.Property(x => x.DisplayName).IsRequired().HasMaxLength(120);
            entity.Property(x => x.FirstName).HasMaxLength(60);
            entity.Property(x => x.LastName).HasMaxLength(60);
            entity.Property(x => x.City).HasMaxLength(100);
            entity.Property(x => x.Country).HasMaxLength(80);
            entity.Property(x => x.PreferredLanguage).HasMaxLength(5);
            entity.Property(x => x.PrivacyPolicyVersion).HasMaxLength(30);
            entity.Property(x => x.Phone).HasMaxLength(50);
            entity.Property(x => x.Email).HasMaxLength(254);
        });
        modelBuilder.Entity<GuestCredential>(entity =>
        {
            entity.HasKey(x => x.GuestProfileId);
            entity.Property(x => x.NormalizedEmail).IsRequired().HasMaxLength(254);
            entity.HasIndex(x => x.NormalizedEmail).IsUnique();
            entity.Property(x => x.PasswordHash).IsRequired().HasMaxLength(1000);
            entity.HasOne(x => x.Profile).WithOne().HasForeignKey<GuestCredential>(x => x.GuestProfileId)
                .OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<GuestSession>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.TokenHash).IsRequired().HasMaxLength(64);
            entity.HasIndex(x => x.TokenHash).IsUnique();
            entity.HasIndex(x => new { x.GuestProfileId, x.ExpiresAtUtc });
            entity.HasOne(x => x.Profile).WithMany().HasForeignKey(x => x.GuestProfileId)
                .OnDelete(DeleteBehavior.Cascade);
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
