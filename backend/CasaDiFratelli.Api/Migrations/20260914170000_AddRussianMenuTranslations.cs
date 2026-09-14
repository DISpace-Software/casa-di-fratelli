using CasaDiFratelli.Api.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CasaDiFratelli.Api.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260914170000_AddRussianMenuTranslations")]
    public partial class AddRussianMenuTranslations : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "NameRu",
                table: "MenuItems",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "DescriptionRu",
                table: "MenuItems",
                type: "text",
                nullable: false,
                defaultValue: "");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "NameRu", table: "MenuItems");
            migrationBuilder.DropColumn(name: "DescriptionRu", table: "MenuItems");
        }
    }
}
