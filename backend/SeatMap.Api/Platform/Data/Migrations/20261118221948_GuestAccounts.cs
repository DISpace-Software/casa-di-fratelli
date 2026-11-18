using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SeatMap.Api.Platform.Data.Migrations
{
    /// <inheritdoc />
    public partial class GuestAccounts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "City",
                table: "GuestProfiles",
                type: "character varying(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Country",
                table: "GuestProfiles",
                type: "character varying(80)",
                maxLength: 80,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateOnly>(
                name: "DateOfBirth",
                table: "GuestProfiles",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FirstName",
                table: "GuestProfiles",
                type: "character varying(60)",
                maxLength: 60,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "LastName",
                table: "GuestProfiles",
                type: "character varying(60)",
                maxLength: 60,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "MarketingConsent",
                table: "GuestProfiles",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "PreferredLanguage",
                table: "GuestProfiles",
                type: "character varying(5)",
                maxLength: 5,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTime>(
                name: "PrivacyConsentAtUtc",
                table: "GuestProfiles",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PrivacyPolicyVersion",
                table: "GuestProfiles",
                type: "character varying(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAtUtc",
                table: "GuestProfiles",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "GuestCredentials",
                columns: table => new
                {
                    GuestProfileId = table.Column<Guid>(type: "uuid", nullable: false),
                    NormalizedEmail = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    PasswordHash = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    FailedLoginCount = table.Column<int>(type: "integer", nullable: false),
                    LockedUntilUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GuestCredentials", x => x.GuestProfileId);
                    table.ForeignKey(
                        name: "FK_GuestCredentials_GuestProfiles_GuestProfileId",
                        column: x => x.GuestProfileId,
                        principalTable: "GuestProfiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "GuestSessions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GuestProfileId = table.Column<Guid>(type: "uuid", nullable: false),
                    TokenHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpiresAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    RevokedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GuestSessions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GuestSessions_GuestProfiles_GuestProfileId",
                        column: x => x.GuestProfileId,
                        principalTable: "GuestProfiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GuestCredentials_NormalizedEmail",
                table: "GuestCredentials",
                column: "NormalizedEmail",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GuestSessions_GuestProfileId_ExpiresAtUtc",
                table: "GuestSessions",
                columns: new[] { "GuestProfileId", "ExpiresAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_GuestSessions_TokenHash",
                table: "GuestSessions",
                column: "TokenHash",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GuestCredentials");

            migrationBuilder.DropTable(
                name: "GuestSessions");

            migrationBuilder.DropColumn(
                name: "City",
                table: "GuestProfiles");

            migrationBuilder.DropColumn(
                name: "Country",
                table: "GuestProfiles");

            migrationBuilder.DropColumn(
                name: "DateOfBirth",
                table: "GuestProfiles");

            migrationBuilder.DropColumn(
                name: "FirstName",
                table: "GuestProfiles");

            migrationBuilder.DropColumn(
                name: "LastName",
                table: "GuestProfiles");

            migrationBuilder.DropColumn(
                name: "MarketingConsent",
                table: "GuestProfiles");

            migrationBuilder.DropColumn(
                name: "PreferredLanguage",
                table: "GuestProfiles");

            migrationBuilder.DropColumn(
                name: "PrivacyConsentAtUtc",
                table: "GuestProfiles");

            migrationBuilder.DropColumn(
                name: "PrivacyPolicyVersion",
                table: "GuestProfiles");

            migrationBuilder.DropColumn(
                name: "UpdatedAtUtc",
                table: "GuestProfiles");
        }
    }
}
