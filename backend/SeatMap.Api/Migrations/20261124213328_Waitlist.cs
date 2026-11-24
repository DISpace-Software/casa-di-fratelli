using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SeatMap.Api.Data;
namespace SeatMap.Api.Migrations;
[DbContext(typeof(AppDbContext)), Migration("20261124213328_Waitlist")]
public sealed class Waitlist : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
            migrationBuilder.CreateTable(
                name: "WaitlistEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GuestId = table.Column<Guid>(type: "uuid", nullable: false),
                    GuestName = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Email = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    Phone = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Language = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    Guests = table.Column<int>(type: "integer", nullable: false),
                    Area = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    TimesJson = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    QueueAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    OfferId = table.Column<Guid>(type: "uuid", nullable: true),
                    TableIdsJson = table.Column<string>(type: "text", nullable: false),
                    OfferTime = table.Column<string>(type: "text", nullable: true),
                    ExpiresAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ReservationId = table.Column<int>(type: "integer", nullable: true),
                    NotificationLeaseUntilUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    EmailSentAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    PushSentAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    NotificationAttempts = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WaitlistEntries", x => x.Id);
                });
            migrationBuilder.CreateIndex(
                name: "IX_WaitlistEntries_GuestId_Date",
                table: "WaitlistEntries",
                columns: new[] { "GuestId", "Date" });
            migrationBuilder.CreateIndex(
                name: "IX_WaitlistEntries_Status_Date_QueueAtUtc",
                table: "WaitlistEntries",
                columns: new[] { "Status", "Date", "QueueAtUtc" });
    }
    protected override void Down(MigrationBuilder m) { m.DropTable("WaitlistEntries"); }
}
