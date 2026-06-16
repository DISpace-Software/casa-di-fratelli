using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CasaDiFratelli.Api.Migrations
{
    /// <inheritdoc />
    [Migration("20260616120000_AddOperationalSoftDelete")]
    public partial class AddOperationalSoftDelete : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE "Reservations" ADD COLUMN IF NOT EXISTS "IsDeleted" boolean NOT NULL DEFAULT false;
                ALTER TABLE "Reservations" ADD COLUMN IF NOT EXISTS "DeletedAtUtc" timestamp with time zone NULL;
                ALTER TABLE "Reservations" ADD COLUMN IF NOT EXISTS "DeletedByAdminUserId" integer NULL;
                ALTER TABLE "Reservations" ADD COLUMN IF NOT EXISTS "DeletedByAdminName" varchar(120) NULL;
                ALTER TABLE "Reservations" ADD COLUMN IF NOT EXISTS "DeleteReason" text NULL;
                CREATE INDEX IF NOT EXISTS "IX_Reservations_IsDeleted" ON "Reservations" ("IsDeleted");

                ALTER TABLE "DiningOrders" ADD COLUMN IF NOT EXISTS "IsDeleted" boolean NOT NULL DEFAULT false;
                ALTER TABLE "DiningOrders" ADD COLUMN IF NOT EXISTS "DeletedAtUtc" timestamp with time zone NULL;
                ALTER TABLE "DiningOrders" ADD COLUMN IF NOT EXISTS "DeletedByAdminUserId" integer NULL;
                ALTER TABLE "DiningOrders" ADD COLUMN IF NOT EXISTS "DeletedByAdminName" varchar(120) NULL;
                ALTER TABLE "DiningOrders" ADD COLUMN IF NOT EXISTS "DeleteReason" text NULL;
                CREATE INDEX IF NOT EXISTS "IX_DiningOrders_IsDeleted" ON "DiningOrders" ("IsDeleted");

                ALTER TABLE "DiningOrderItems" ADD COLUMN IF NOT EXISTS "IsDeleted" boolean NOT NULL DEFAULT false;
                ALTER TABLE "DiningOrderItems" ADD COLUMN IF NOT EXISTS "DeletedAtUtc" timestamp with time zone NULL;
                ALTER TABLE "DiningOrderItems" ADD COLUMN IF NOT EXISTS "DeletedByAdminUserId" integer NULL;
                ALTER TABLE "DiningOrderItems" ADD COLUMN IF NOT EXISTS "DeletedByAdminName" varchar(120) NULL;
                ALTER TABLE "DiningOrderItems" ADD COLUMN IF NOT EXISTS "DeleteReason" text NULL;
                CREATE INDEX IF NOT EXISTS "IX_DiningOrderItems_IsDeleted" ON "DiningOrderItems" ("IsDeleted");
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DROP INDEX IF EXISTS "IX_DiningOrderItems_IsDeleted";
                ALTER TABLE "DiningOrderItems" DROP COLUMN IF EXISTS "DeleteReason";
                ALTER TABLE "DiningOrderItems" DROP COLUMN IF EXISTS "DeletedByAdminName";
                ALTER TABLE "DiningOrderItems" DROP COLUMN IF EXISTS "DeletedByAdminUserId";
                ALTER TABLE "DiningOrderItems" DROP COLUMN IF EXISTS "DeletedAtUtc";
                ALTER TABLE "DiningOrderItems" DROP COLUMN IF EXISTS "IsDeleted";

                DROP INDEX IF EXISTS "IX_DiningOrders_IsDeleted";
                ALTER TABLE "DiningOrders" DROP COLUMN IF EXISTS "DeleteReason";
                ALTER TABLE "DiningOrders" DROP COLUMN IF EXISTS "DeletedByAdminName";
                ALTER TABLE "DiningOrders" DROP COLUMN IF EXISTS "DeletedByAdminUserId";
                ALTER TABLE "DiningOrders" DROP COLUMN IF EXISTS "DeletedAtUtc";
                ALTER TABLE "DiningOrders" DROP COLUMN IF EXISTS "IsDeleted";

                DROP INDEX IF EXISTS "IX_Reservations_IsDeleted";
                ALTER TABLE "Reservations" DROP COLUMN IF EXISTS "DeleteReason";
                ALTER TABLE "Reservations" DROP COLUMN IF EXISTS "DeletedByAdminName";
                ALTER TABLE "Reservations" DROP COLUMN IF EXISTS "DeletedByAdminUserId";
                ALTER TABLE "Reservations" DROP COLUMN IF EXISTS "DeletedAtUtc";
                ALTER TABLE "Reservations" DROP COLUMN IF EXISTS "IsDeleted";
                """);
        }
    }
}
