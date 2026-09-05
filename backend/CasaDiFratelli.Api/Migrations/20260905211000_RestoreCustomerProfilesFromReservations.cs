using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;
using CasaDiFratelli.Api.Data;

#nullable disable

namespace CasaDiFratelli.Api.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260905211000_RestoreCustomerProfilesFromReservations")]
    public partial class RestoreCustomerProfilesFromReservations : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                WITH eligible AS (
                    SELECT
                        r.*,
                        CASE
                            WHEN NULLIF(lower(trim(COALESCE(r."Email", ''))), '') IS NOT NULL
                                THEN 'email:' || lower(trim(r."Email"))
                            ELSE 'phone:' || lower(trim(r."Phone"))
                        END AS customer_key
                    FROM "Reservations" r
                    WHERE NOT r."IsDeleted"
                      AND NOT r."IsWalkIn"
                      AND NOT r."IsNoShow"
                      AND r."ReservedDate" <= CURRENT_DATE
                      AND r."Status" NOT IN ('Cancelled', 'AwaitingEmailConfirmation')
                      AND NOT (r."CreatedByAdmin" AND (r."Phone" = 'admin' OR r."GuestName" = 'Admin block'))
                      AND (NULLIF(trim(COALESCE(r."Email", '')), '') IS NOT NULL
                           OR NULLIF(trim(COALESCE(r."Phone", '')), '') IS NOT NULL)
                ),
                grouped AS (
                    SELECT
                        customer_key,
                        (array_agg("GuestName" ORDER BY "ReservedDate" DESC, "CreatedAtUtc" DESC))[1] AS guest_name,
                        NULLIF((array_agg("Phone" ORDER BY "ReservedDate" DESC, "CreatedAtUtc" DESC))[1], '') AS phone,
                        NULLIF((array_agg("Email" ORDER BY "ReservedDate" DESC, "CreatedAtUtc" DESC))[1], '') AS email,
                        count(*)::integer AS reservation_count,
                        (array_agg("BirthDate" ORDER BY ("BirthDate" IS NULL), "ReservedDate" DESC))[1] AS birth_date,
                        bool_or("MarketingConsent") AS marketing_consent,
                        min("CreatedAtUtc") AS first_at,
                        max("CreatedAtUtc") AS last_at
                    FROM eligible
                    GROUP BY customer_key
                )
                INSERT INTO "CustomerProfiles" (
                    "GuestName", "Phone", "Email", "ReservationCount", "IsRegularCustomer",
                    "BirthDate", "MarketingConsent", "FirstReservationAtUtc", "LastReservationAtUtc")
                SELECT
                    g.guest_name, g.phone, g.email, g.reservation_count, g.reservation_count >= 5,
                    g.birth_date, g.marketing_consent, g.first_at, g.last_at
                FROM grouped g
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM "CustomerProfiles" p
                    WHERE (g.email IS NOT NULL AND lower(trim(COALESCE(p."Email", ''))) = lower(trim(g.email)))
                       OR (g.phone IS NOT NULL AND lower(trim(COALESCE(p."Phone", ''))) = lower(trim(g.phone)))
                );
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Recreated profiles cannot be distinguished safely from profiles added later.
        }
    }
}
