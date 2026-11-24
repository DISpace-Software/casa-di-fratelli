using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SeatMap.Api.Data;
namespace SeatMap.Api.Migrations;
[DbContext(typeof(AppDbContext)), Migration("20261124000100_PreorderOperations")]
public sealed class PreorderOperations : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(name: "OperationsJson", table: "ReservationPreorders", type: "text", nullable: false, defaultValue: "{}");
        migrationBuilder.Sql("""UPDATE "ReservationPreorders" SET "OperationsJson" = json_build_object("IdempotencyKey"::text, 'legacy:' || "RequestHash")::text;""");
    }
    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.DropColumn("OperationsJson", "ReservationPreorders");
}
