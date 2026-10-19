using CasaDiFratelli.Api.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CasaDiFratelli.Api.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261019195000_PreserveOrdersAfterReservationDeletion")]
public class PreserveOrdersAfterReservationDeletion : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE "DiningOrders" ALTER COLUMN "ReservationId" DROP NOT NULL;
            ALTER TABLE "DiningOrders" DROP CONSTRAINT IF EXISTS "FK_DiningOrders_Reservations_ReservationId";
            ALTER TABLE "DiningOrders" ADD CONSTRAINT "FK_DiningOrders_Reservations_ReservationId"
                FOREIGN KEY ("ReservationId") REFERENCES "Reservations" ("Id") ON DELETE SET NULL;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DO $$ BEGIN
                IF EXISTS (SELECT 1 FROM "DiningOrders" WHERE "ReservationId" IS NULL) THEN
                    RAISE EXCEPTION 'Cannot restore required reservation links while archived detached orders exist.';
                END IF;
            END $$;
            ALTER TABLE "DiningOrders" DROP CONSTRAINT IF EXISTS "FK_DiningOrders_Reservations_ReservationId";
            ALTER TABLE "DiningOrders" ALTER COLUMN "ReservationId" SET NOT NULL;
            ALTER TABLE "DiningOrders" ADD CONSTRAINT "FK_DiningOrders_Reservations_ReservationId"
                FOREIGN KEY ("ReservationId") REFERENCES "Reservations" ("Id") ON DELETE CASCADE;
            """);
    }
}
