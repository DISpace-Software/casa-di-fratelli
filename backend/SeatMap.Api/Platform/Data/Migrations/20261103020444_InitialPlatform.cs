using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SeatMap.Api.Platform.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialPlatform : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "GuestProfiles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    IdentityIssuer = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    IdentitySubject = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    DisplayName = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Phone = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Email = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: true),
                    PhoneVerifiedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GuestProfiles", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "GuestFavorites",
                columns: table => new
                {
                    GuestProfileId = table.Column<Guid>(type: "uuid", nullable: false),
                    RestaurantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GuestFavorites", x => new { x.GuestProfileId, x.RestaurantId });
                    table.ForeignKey(
                        name: "FK_GuestFavorites_GuestProfiles_GuestProfileId",
                        column: x => x.GuestProfileId,
                        principalTable: "GuestProfiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "GuestReservationReferences",
                columns: table => new
                {
                    RestaurantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ReservationId = table.Column<int>(type: "integer", nullable: false),
                    GuestProfileId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReservedDate = table.Column<DateOnly>(type: "date", nullable: false),
                    ReservedTime = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    SourceVersion = table.Column<long>(type: "bigint", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GuestReservationReferences", x => new { x.RestaurantId, x.ReservationId });
                    table.ForeignKey(
                        name: "FK_GuestReservationReferences_GuestProfiles_GuestProfileId",
                        column: x => x.GuestProfileId,
                        principalTable: "GuestProfiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GuestProfiles_IdentityIssuer_IdentitySubject",
                table: "GuestProfiles",
                columns: new[] { "IdentityIssuer", "IdentitySubject" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GuestReservationReferences_GuestProfileId_ReservedDate",
                table: "GuestReservationReferences",
                columns: new[] { "GuestProfileId", "ReservedDate" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GuestFavorites");

            migrationBuilder.DropTable(
                name: "GuestReservationReferences");

            migrationBuilder.DropTable(
                name: "GuestProfiles");
        }
    }
}
