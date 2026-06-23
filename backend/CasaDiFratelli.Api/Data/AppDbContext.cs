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
    public DbSet<AdminPushSubscription> AdminPushSubscriptions => Set<AdminPushSubscription>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<DiningOrder> DiningOrders => Set<DiningOrder>();
    public DbSet<DiningOrderItem> DiningOrderItems => Set<DiningOrderItem>();
    public DbSet<AppSetting> AppSettings => Set<AppSetting>();
    public DbSet<RestaurantEvent> RestaurantEvents => Set<RestaurantEvent>();
    public DbSet<InventoryItem> InventoryItems => Set<InventoryItem>();
    public DbSet<MenuItemRecipeIngredient> MenuItemRecipeIngredients => Set<MenuItemRecipeIngredient>();
    public DbSet<DiningOrderItemInventoryExtra> DiningOrderItemInventoryExtras => Set<DiningOrderItemInventoryExtra>();
    public DbSet<InventoryMovement> InventoryMovements => Set<InventoryMovement>();
    public DbSet<InventoryAudit> InventoryAudits => Set<InventoryAudit>();
    public DbSet<InventoryAuditLine> InventoryAuditLines => Set<InventoryAuditLine>();
    public DbSet<MarketingMessageLog> MarketingMessageLogs => Set<MarketingMessageLog>();
    public DbSet<CustomerFeedback> CustomerFeedbacks => Set<CustomerFeedback>();

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
            entity.Property(x => x.CreatedByAdminName).HasMaxLength(120);
            entity.Property(x => x.DeletedByAdminName).HasMaxLength(120);
            entity.HasIndex(x => x.OrderAccessToken);
            entity.HasIndex(x => x.EmailConfirmationTokenHash);
            entity.HasIndex(x => x.IsDeleted);
            entity.HasQueryFilter(x => !x.IsDeleted);
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

        modelBuilder.Entity<AdminPushSubscription>(entity =>
        {
            entity.Property(x => x.Endpoint).IsRequired();
            entity.Property(x => x.P256Dh).IsRequired();
            entity.Property(x => x.Auth).IsRequired();
            entity.HasIndex(x => x.Endpoint).IsUnique();
        });

        modelBuilder.Entity<AppSetting>(entity =>
        {
            entity.Property(x => x.Key).IsRequired().HasMaxLength(80);
            entity.Property(x => x.Value).IsRequired();
            entity.HasIndex(x => x.Key).IsUnique();
        });

        modelBuilder.Entity<MarketingMessageLog>(entity =>
        {
            entity.Property(x => x.CampaignKey).IsRequired().HasMaxLength(80);
            entity.Property(x => x.CustomerKey).IsRequired().HasMaxLength(180);
            entity.Property(x => x.Email).IsRequired().HasMaxLength(180);
            entity.Property(x => x.Subject).IsRequired().HasMaxLength(220);
            entity.HasIndex(x => new { x.CampaignKey, x.CustomerKey, x.SentForDate }).IsUnique();
        });

        modelBuilder.Entity<CustomerFeedback>(entity =>
        {
            entity.Property(x => x.GuestName).HasMaxLength(120);
            entity.Property(x => x.Email).HasMaxLength(180);
            entity.Property(x => x.DiscountCode).HasMaxLength(40);
            entity.Property(x => x.OnlineReservationEase).HasMaxLength(80);
            entity.Property(x => x.TableMapReuseIntent).HasMaxLength(80);
            entity.Property(x => x.TableChoiceImportance).HasMaxLength(80);
            entity.Property(x => x.MostUsefulDigitalFeature).HasMaxLength(120);
            entity.HasIndex(x => x.ReservationId);
            entity.HasIndex(x => x.DiscountCode);
            entity.HasIndex(x => x.CreatedAtUtc);
        });

        modelBuilder.Entity<RestaurantEvent>(entity =>
        {
            entity.Property(x => x.TitleBg).IsRequired().HasMaxLength(180);
            entity.Property(x => x.TitleEn).IsRequired().HasMaxLength(180);
            entity.Property(x => x.Badge).HasMaxLength(80);
        });

        modelBuilder.Entity<DiningOrder>(entity =>
        {
            entity.Property(x => x.GuestName).IsRequired().HasMaxLength(120);
            entity.Property(x => x.TableLabel).IsRequired().HasMaxLength(120);
            entity.Property(x => x.Status).IsRequired().HasMaxLength(30);
            entity.Property(x => x.Source).IsRequired().HasMaxLength(40);
            entity.Property(x => x.AssignedWaiterName).HasMaxLength(120);
            entity.Property(x => x.DeletedByAdminName).HasMaxLength(120);
            entity.HasIndex(x => x.IsDeleted);
            entity.HasQueryFilter(x => !x.IsDeleted);
            entity.HasMany(x => x.Items).WithOne(x => x.DiningOrder).HasForeignKey(x => x.DiningOrderId);
        });

        modelBuilder.Entity<DiningOrderItem>(entity =>
        {
            entity.Property(x => x.Name).IsRequired().HasMaxLength(180);
            entity.Property(x => x.Status).IsRequired().HasMaxLength(30);
            entity.Property(x => x.Source).IsRequired().HasMaxLength(40);
            entity.Property(x => x.Kind).IsRequired().HasMaxLength(30);
            entity.Property(x => x.DeletedByAdminName).HasMaxLength(120);
            entity.HasIndex(x => x.IsDeleted);
            entity.HasQueryFilter(x => !x.IsDeleted);
            entity.HasMany(x => x.InventoryExtras).WithOne(x => x.DiningOrderItem).HasForeignKey(x => x.DiningOrderItemId);
        });

        modelBuilder.Entity<MenuItem>(entity =>
        {
            entity.Property(x => x.Department).IsRequired().HasMaxLength(30);
        });

        modelBuilder.Entity<InventoryItem>(entity =>
        {
            entity.Property(x => x.Name).IsRequired().HasMaxLength(160);
            entity.Property(x => x.Category).IsRequired().HasMaxLength(80);
            entity.Property(x => x.Unit).IsRequired().HasMaxLength(20);
            entity.HasIndex(x => x.Name);
        });

        modelBuilder.Entity<MenuItemRecipeIngredient>(entity =>
        {
            entity.Property(x => x.Notes).HasMaxLength(300);
            entity.HasIndex(x => new { x.MenuItemId, x.InventoryItemId }).IsUnique();
            entity.HasOne(x => x.MenuItem).WithMany().HasForeignKey(x => x.MenuItemId);
            entity.HasOne(x => x.InventoryItem).WithMany().HasForeignKey(x => x.InventoryItemId);
        });

        modelBuilder.Entity<DiningOrderItemInventoryExtra>(entity =>
        {
            entity.Property(x => x.Notes).HasMaxLength(300);
            entity.HasOne(x => x.InventoryItem).WithMany().HasForeignKey(x => x.InventoryItemId);
        });

        modelBuilder.Entity<InventoryMovement>(entity =>
        {
            entity.Property(x => x.Type).IsRequired().HasMaxLength(40);
            entity.Property(x => x.AdminName).HasMaxLength(120);
            entity.HasIndex(x => x.InventoryItemId);
            entity.HasIndex(x => x.DiningOrderId);
            entity.HasOne(x => x.InventoryItem).WithMany().HasForeignKey(x => x.InventoryItemId);
        });

        modelBuilder.Entity<InventoryAudit>(entity =>
        {
            entity.Property(x => x.Title).IsRequired().HasMaxLength(180);
            entity.Property(x => x.Status).IsRequired().HasMaxLength(30);
            entity.Property(x => x.CreatedByAdminName).HasMaxLength(120);
            entity.Property(x => x.ConfirmedByAdminName).HasMaxLength(120);
            entity.HasMany(x => x.Lines).WithOne(x => x.InventoryAudit).HasForeignKey(x => x.InventoryAuditId);
        });

        modelBuilder.Entity<InventoryAuditLine>(entity =>
        {
            entity.Property(x => x.Comment).HasMaxLength(300);
            entity.HasIndex(x => new { x.InventoryAuditId, x.InventoryItemId }).IsUnique();
            entity.HasOne(x => x.InventoryItem).WithMany().HasForeignKey(x => x.InventoryItemId);
        });
    }
}
