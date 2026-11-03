using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SeatMap.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddAdminCrmEntities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // These migrations originated on SQLite. Native PostgreSQL types and
            // identities are required when provisioning a new restaurant database.
            var postgres = ActiveProvider == "Npgsql.EntityFrameworkCore.PostgreSQL";
            migrationBuilder.AddColumn<DateOnly>(
                name: "BirthDate",
                table: "Reservations",
                type: postgres ? "date" : "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "CreatedByAdmin",
                table: "Reservations",
                type: postgres ? "boolean" : "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "InternalNote",
                table: "Reservations",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsBlacklisted",
                table: "Reservations",
                type: postgres ? "boolean" : "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsNoShow",
                table: "Reservations",
                type: postgres ? "boolean" : "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsRegularCustomer",
                table: "Reservations",
                type: postgres ? "boolean" : "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "MarketingConsent",
                table: "Reservations",
                type: postgres ? "boolean" : "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "BlacklistEntries",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true)
                        .Annotation("Npgsql:ValueGenerationStrategy", Npgsql.EntityFrameworkCore.PostgreSQL.Metadata.NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    GuestName = table.Column<string>(type: "TEXT", nullable: true),
                    Phone = table.Column<string>(type: "TEXT", nullable: true),
                    Email = table.Column<string>(type: "TEXT", nullable: true),
                    Reason = table.Column<string>(type: "TEXT", nullable: false),
                    Notes = table.Column<string>(type: "TEXT", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: postgres ? "timestamp with time zone" : "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BlacklistEntries", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CustomerProfiles",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true)
                        .Annotation("Npgsql:ValueGenerationStrategy", Npgsql.EntityFrameworkCore.PostgreSQL.Metadata.NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    GuestName = table.Column<string>(type: "TEXT", nullable: true),
                    Phone = table.Column<string>(type: "TEXT", nullable: true),
                    Email = table.Column<string>(type: "TEXT", nullable: true),
                    ReservationCount = table.Column<int>(type: "INTEGER", nullable: false),
                    IsRegularCustomer = table.Column<bool>(type: postgres ? "boolean" : "INTEGER", nullable: false),
                    BirthDate = table.Column<DateOnly>(type: postgres ? "date" : "TEXT", nullable: true),
                    MarketingConsent = table.Column<bool>(type: postgres ? "boolean" : "INTEGER", nullable: false),
                    FirstReservationAtUtc = table.Column<DateTime>(type: postgres ? "timestamp with time zone" : "TEXT", nullable: false),
                    LastReservationAtUtc = table.Column<DateTime>(type: postgres ? "timestamp with time zone" : "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerProfiles", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "MenuItems",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true)
                        .Annotation("Npgsql:ValueGenerationStrategy", Npgsql.EntityFrameworkCore.PostgreSQL.Metadata.NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    NameBg = table.Column<string>(type: "TEXT", nullable: false),
                    NameEn = table.Column<string>(type: "TEXT", nullable: false),
                    DescriptionBg = table.Column<string>(type: "TEXT", nullable: false),
                    DescriptionEn = table.Column<string>(type: "TEXT", nullable: false),
                    Weight = table.Column<string>(type: "TEXT", nullable: false),
                    Price = table.Column<decimal>(type: postgres ? "numeric" : "TEXT", nullable: false),
                    Category = table.Column<string>(type: "TEXT", nullable: false),
                    IsActive = table.Column<bool>(type: postgres ? "boolean" : "INTEGER", nullable: false),
                    NotifySubscribers = table.Column<bool>(type: postgres ? "boolean" : "INTEGER", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: postgres ? "timestamp with time zone" : "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: postgres ? "timestamp with time zone" : "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MenuItems", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BlacklistEntries");

            migrationBuilder.DropTable(
                name: "CustomerProfiles");

            migrationBuilder.DropTable(
                name: "MenuItems");

            migrationBuilder.DropColumn(
                name: "BirthDate",
                table: "Reservations");

            migrationBuilder.DropColumn(
                name: "CreatedByAdmin",
                table: "Reservations");

            migrationBuilder.DropColumn(
                name: "InternalNote",
                table: "Reservations");

            migrationBuilder.DropColumn(
                name: "IsBlacklisted",
                table: "Reservations");

            migrationBuilder.DropColumn(
                name: "IsNoShow",
                table: "Reservations");

            migrationBuilder.DropColumn(
                name: "IsRegularCustomer",
                table: "Reservations");

            migrationBuilder.DropColumn(
                name: "MarketingConsent",
                table: "Reservations");
        }
    }
}
