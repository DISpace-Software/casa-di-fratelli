using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SeatMap.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddReservationArrivalStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE "Reservations"
                ADD COLUMN IF NOT EXISTS "IsArrived" boolean NOT NULL DEFAULT false;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE "Reservations"
                DROP COLUMN IF EXISTS "IsArrived";
                """);
        }
    }
}
