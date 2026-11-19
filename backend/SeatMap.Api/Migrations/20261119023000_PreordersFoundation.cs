using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SeatMap.Api.Data;

namespace SeatMap.Api.Migrations;

[DbContext(typeof(AppDbContext)), Migration("20261119023000_PreordersFoundation")]
public sealed class PreordersFoundation : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable("ReservationPreorders", table => new {
            Id = table.Column<Guid>(type: "uuid", nullable: false),
            ReservationId = table.Column<int>(type: "integer", nullable: false),
            IdempotencyKey = table.Column<Guid>(type: "uuid", nullable: false),
            RequestHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
            Status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
            Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
            TotalMinor = table.Column<long>(type: "bigint", nullable: false),
            CommissionBasisPoints = table.Column<int>(type: "integer", nullable: false),
            CommissionMinor = table.Column<long>(type: "bigint", nullable: false),
            RestaurantNetMinor = table.Column<long>(type: "bigint", nullable: false),
            ItemsJson = table.Column<string>(type: "text", nullable: false),
            Notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
            ServeAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
            CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
        }, constraints: table => {
            table.PrimaryKey("PK_ReservationPreorders", x => x.Id);
            table.ForeignKey("FK_ReservationPreorders_Reservations_ReservationId", x => x.ReservationId, "Reservations", "Id", onDelete: ReferentialAction.Restrict);
        });
        migrationBuilder.CreateIndex("IX_ReservationPreorders_ReservationId_IdempotencyKey", "ReservationPreorders", new[] { "ReservationId", "IdempotencyKey" }, unique: true);
        migrationBuilder.CreateTable("PreorderPayments", table => new {
            Id = table.Column<Guid>(type: "uuid", nullable: false),
            ReservationPreorderId = table.Column<Guid>(type: "uuid", nullable: false),
            Provider = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
            ProviderPaymentId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
            Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
            GrossMinor = table.Column<long>(type: "bigint", nullable: false),
            CommissionMinor = table.Column<long>(type: "bigint", nullable: false),
            RestaurantNetMinor = table.Column<long>(type: "bigint", nullable: false),
            PaidAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
        }, constraints: table => {
            table.PrimaryKey("PK_PreorderPayments", x => x.Id);
            table.ForeignKey("FK_PreorderPayments_ReservationPreorders_ReservationPreorderId", x => x.ReservationPreorderId, "ReservationPreorders", "Id", onDelete: ReferentialAction.Restrict);
        });
        migrationBuilder.CreateIndex("IX_PreorderPayments_Provider_ProviderPaymentId", "PreorderPayments", new[] { "Provider", "ProviderPaymentId" }, unique: true);
        migrationBuilder.CreateIndex("IX_PreorderPayments_ReservationPreorderId", "PreorderPayments", "ReservationPreorderId", unique: true);
        migrationBuilder.CreateIndex("IX_PreorderPayments_PaidAtUtc", "PreorderPayments", "PaidAtUtc");
    }
    protected override void Down(MigrationBuilder migrationBuilder)
    { migrationBuilder.DropTable("PreorderPayments"); migrationBuilder.DropTable("ReservationPreorders"); }
}
