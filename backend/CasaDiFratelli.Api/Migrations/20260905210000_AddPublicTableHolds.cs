using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;
using CasaDiFratelli.Api.Data;

#nullable disable

namespace CasaDiFratelli.Api.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260905210000_AddPublicTableHolds")]
    public partial class AddPublicTableHolds : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PublicTableHolds",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", Npgsql.EntityFrameworkCore.PostgreSQL.Metadata.NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ReservedDate = table.Column<DateOnly>(type: "date", nullable: false),
                    TableIdsJson = table.Column<string>(type: "text", nullable: false),
                    Note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedByAdminUserId = table.Column<int>(type: "integer", nullable: true),
                    CreatedByAdminName = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true)
                },
                constraints: table => table.PrimaryKey("PK_PublicTableHolds", x => x.Id));

            migrationBuilder.CreateIndex(
                name: "IX_PublicTableHolds_ReservedDate",
                table: "PublicTableHolds",
                column: "ReservedDate");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "PublicTableHolds");
        }
    }
}
