using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SeatMap.Api.Platform.Data.Migrations
{
    /// <inheritdoc />
    public partial class SommelierCatalogue : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SommelierRules",
                columns: table => new
                {
                    Code = table.Column<string>(type: "text", nullable: false),
                    Weight = table.Column<int>(type: "integer", nullable: false),
                    Enabled = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SommelierRules", x => x.Code);
                });

            migrationBuilder.CreateTable(
                name: "SommelierWines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Source = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Style = table.Column<string>(type: "text", nullable: false),
                    Body = table.Column<int>(type: "integer", nullable: false),
                    Acidity = table.Column<int>(type: "integer", nullable: false),
                    Sweetness = table.Column<int>(type: "integer", nullable: false),
                    Tannin = table.Column<int>(type: "integer", nullable: false),
                    Alcohol = table.Column<decimal>(type: "numeric", nullable: false),
                    Verified = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SommelierWines", x => x.Id);
                });
            foreach (var rule in new System.Collections.Generic.Dictionary<string, int> { ["balance"] = 12, ["freshness"] = 8, ["sweetness"] = 15, ["spice"] = 12, ["umami"] = 8 })
                migrationBuilder.InsertData("SommelierRules", new[] { "Code", "Weight", "Enabled" }, new object[] { rule.Key, rule.Value, true });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SommelierRules");

            migrationBuilder.DropTable(
                name: "SommelierWines");
        }
    }
}
