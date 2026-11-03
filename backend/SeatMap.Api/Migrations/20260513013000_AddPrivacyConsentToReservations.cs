using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SeatMap.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPrivacyConsentToReservations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE "Reservations"
                ADD COLUMN IF NOT EXISTS "PrivacyConsent" boolean NOT NULL DEFAULT false;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE "Reservations"
                DROP COLUMN IF EXISTS "PrivacyConsent";
                """);
        }
    }
}
