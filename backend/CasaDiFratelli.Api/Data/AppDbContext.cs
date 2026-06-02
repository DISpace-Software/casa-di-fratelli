using CasaDiFratelli.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CasaDiFratelli.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<Reservation> Reservations => Set<Reservation>();
    public DbSet<ReservationTable> ReservationTables => Set<ReservationTable>();
    public DbSet<MenuItem> MenuItems => Set<MenuItem>();
    public DbSet<BlacklistEntry> BlacklistEntries => Set<BlacklistEntry>();
    public DbSet<CustomerProfile> CustomerProfiles => Set<CustomerProfile>();
    public DbSet<AdminUser> AdminUsers => Set<AdminUser>();
    public DbSet<AdminSession> AdminSessions => Set<AdminSession>();
    public DbSet<AdminDeviceCredential> AdminDeviceCredentials => Set<AdminDeviceCredential>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<DiningOrder> DiningOrders => Set<DiningOrder>();
    public DbSet<DiningOrderItem> DiningOrderItems => Set<DiningOrderItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Reservation>(entity =>
        {
            entity.Property(x => x.GuestName).IsRequired().HasMaxLength(120);
            entity.Property(x => x.Phone).IsRequired().HasMaxLength(50);
            entity.Property(x => x.Email).HasMaxLength(120);
            entity.Property(x => x.Area).IsRequired().HasMaxLength(50);
            entity.Property(x => x.ReservedTime).IsRequired().HasMaxLength(20);
            entity.Property(x => x.Status).IsRequired().HasMaxLength(30);
            entity.Property(x => x.OrderAccessToken).HasMaxLength(80);
            entity.Property(x => x.EmailConfirmationTokenHash).HasMaxLength(128);
            entity.HasIndex(x => x.OrderAccessToken);
            entity.HasIndex(x => x.EmailConfirmationTokenHash);
        });

        modelBuilder.Entity<ReservationTable>(entity =>
        {
            entity.Property(x => x.TableCode).IsRequired().HasMaxLength(20);
        });

        modelBuilder.Entity<AdminUser>(entity =>
        {
            entity.Property(x => x.Name).IsRequired().HasMaxLength(120);
            entity.Property(x => x.Email).IsRequired().HasMaxLength(180);
            entity.Property(x => x.PasswordResetTokenHash).HasMaxLength(128);
            entity.HasIndex(x => x.Email).IsUnique();
            entity.HasIndex(x => x.PasswordResetTokenHash);
        });

        modelBuilder.Entity<AdminSession>(entity =>
        {
            entity.Property(x => x.TokenHash).IsRequired().HasMaxLength(128);
            entity.HasIndex(x => x.TokenHash).IsUnique();
        });

        modelBuilder.Entity<AdminDeviceCredential>(entity =>
        {
            entity.Property(x => x.CredentialHash).IsRequired().HasMaxLength(128);
            entity.HasIndex(x => x.CredentialHash).IsUnique();
        });

        modelBuilder.Entity<DiningOrder>(entity =>
        {
            entity.Property(x => x.GuestName).IsRequired().HasMaxLength(120);
            entity.Property(x => x.TableLabel).IsRequired().HasMaxLength(120);
            entity.Property(x => x.Status).IsRequired().HasMaxLength(30);
            entity.HasMany(x => x.Items).WithOne(x => x.DiningOrder).HasForeignKey(x => x.DiningOrderId);
        });

        modelBuilder.Entity<DiningOrderItem>(entity =>
        {
            entity.Property(x => x.Name).IsRequired().HasMaxLength(180);
        });
    }
}
