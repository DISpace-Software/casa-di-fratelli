using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CasaDiFratelli.Api.Migrations
{
    /// <inheritdoc />
    [Migration("20260602133000_AddReservationEmailConfirmation")]
    public partial class AddReservationEmailConfirmation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE "Reservations"
                ADD COLUMN IF NOT EXISTS "EmailConfirmationTokenHash" character varying(128) NULL;

                ALTER TABLE "Reservations"
                ADD COLUMN IF NOT EXISTS "EmailConfirmationExpiresAtUtc" timestamp with time zone NULL;

                ALTER TABLE "Reservations"
                ADD COLUMN IF NOT EXISTS "EmailConfirmedAtUtc" timestamp with time zone NULL;

                CREATE INDEX IF NOT EXISTS "IX_Reservations_EmailConfirmationTokenHash"
                ON "Reservations" ("EmailConfirmationTokenHash");
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DROP INDEX IF EXISTS "IX_Reservations_EmailConfirmationTokenHash";
                ALTER TABLE "Reservations" DROP COLUMN IF EXISTS "EmailConfirmedAtUtc";
                ALTER TABLE "Reservations" DROP COLUMN IF EXISTS "EmailConfirmationExpiresAtUtc";
                ALTER TABLE "Reservations" DROP COLUMN IF EXISTS "EmailConfirmationTokenHash";
                """);
        }
    }
}
