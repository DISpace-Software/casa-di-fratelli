using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SeatMap.Api.Data;
namespace SeatMap.Api.Migrations;
[DbContext(typeof(AppDbContext)), Migration("20261124175322_SommelierProfiles")]
public sealed class SommelierProfiles : Migration
{
    protected override void Up(MigrationBuilder m) => m.CreateTable(
        name: "SommelierProfiles",
        columns: t => new {
            MenuItemId = t.Column<int>(nullable: false),
            Kind = t.Column<string>(nullable: false),
            WineId = t.Column<Guid>(nullable: true),
            Serving = t.Column<string>(nullable: false),
            Available = t.Column<bool>(nullable: false),
            Verified = t.Column<bool>(nullable: false),
            Body = t.Column<int>(nullable: false),
            Acidity = t.Column<int>(nullable: false),
            Sweetness = t.Column<int>(nullable: false),
            Fat = t.Column<int>(nullable: false),
            Heat = t.Column<int>(nullable: false),
            Umami = t.Column<int>(nullable: false),
            Notes = t.Column<string>(maxLength: 500, nullable: false),
            UpdatedAtUtc = t.Column<DateTime>(nullable: false)
        }, constraints: t => { t.PrimaryKey("PK_SommelierProfiles", x => x.MenuItemId); t.ForeignKey("FK_SommelierProfiles_MenuItems", x => x.MenuItemId, "MenuItems", "Id", onDelete: ReferentialAction.Cascade); });
    protected override void Down(MigrationBuilder m) => m.DropTable("SommelierProfiles");
}
