using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CasaDiFratelli.Api.Migrations
{
    /// <inheritdoc />
    public partial class ReleaseHistoricalReservations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE "Reservations"
                SET "Status" = 'Released',
                    "IsArrived" = false,
                    "IsNoShow" = false
                WHERE "ReservedDate" < DATE '2026-08-06'
                  AND "Status" <> 'Cancelled'
                  AND "Status" <> 'Released';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Historical reservation states cannot be reconstructed safely.
        }
    }
}
