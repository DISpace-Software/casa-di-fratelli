using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SeatMap.Api.Platform.Data.Migrations
{
    /// <inheritdoc />
    public partial class GuestEmailSecurity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "EmailVerifiedAtUtc",
                table: "GuestProfiles",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastEmailSentAtUtc",
                table: "GuestProfiles",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "GuestEmailChallenges",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GuestProfileId = table.Column<Guid>(type: "uuid", nullable: false),
                    Email = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    Purpose = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    CodeHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpiresAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ConsumedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GuestEmailChallenges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GuestEmailChallenges_GuestProfiles_GuestProfileId",
                        column: x => x.GuestProfileId,
                        principalTable: "GuestProfiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GuestEmailChallenges_GuestProfileId_CreatedAtUtc",
                table: "GuestEmailChallenges",
                columns: new[] { "GuestProfileId", "CreatedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GuestEmailChallenges");

            migrationBuilder.DropColumn(
                name: "EmailVerifiedAtUtc",
                table: "GuestProfiles");

            migrationBuilder.DropColumn(
                name: "LastEmailSentAtUtc",
                table: "GuestProfiles");
        }
    }
}
