using SeatMap.Api.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SeatMap.Api.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261119000311_GuestReservationManagement")]
public sealed class GuestReservationManagement : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.AddColumn<string>(
        name: "GuestManagementTokenHash", table: "Reservations", type: "character varying(64)",
        maxLength: 64, nullable: true);

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.DropColumn(name: "GuestManagementTokenHash", table: "Reservations");
}
