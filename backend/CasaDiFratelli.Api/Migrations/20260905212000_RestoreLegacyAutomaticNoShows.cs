using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CasaDiFratelli.Api.Migrations
{
    [Migration("20260905212000_RestoreLegacyAutomaticNoShows")]
    public partial class RestoreLegacyAutomaticNoShows : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                CREATE TEMP TABLE restored_legacy_no_shows ON COMMIT DROP AS
                SELECT DISTINCT r."Id"
                FROM "Reservations" r
                JOIN "AuditLogs" no_show
                  ON no_show."Entity" = 'Reservation'
                 AND no_show."Action" = 'no-show'
                 AND no_show."EntityId" = r."Id"::text
                JOIN "AuditLogs" blacklist
                  ON blacklist."Entity" = 'BlacklistEntry'
                 AND blacklist."Action" = 'create'
                 AND blacklist."CreatedAtUtc" BETWEEN no_show."CreatedAtUtc" - interval '5 minutes'
                                                    AND no_show."CreatedAtUtc"
                 AND blacklist."AdminUserId" IS NOT DISTINCT FROM no_show."AdminUserId"
                WHERE NOT r."IsDeleted"
                  AND r."ReservedDate" <= CURRENT_DATE
                  AND NOT r."IsWalkIn"
                  AND NOT (r."CreatedByAdmin" AND (r."Phone" = 'admin' OR r."GuestName" = 'Admin block'))
                  AND r."IsNoShow"
                  AND r."Status" = 'Cancelled'
                  AND lower(COALESCE(blacklist."AfterJson"::jsonb ->> 'Reason', '')) = 'no-show'
                  AND (
                    (NULLIF(lower(trim(COALESCE(r."Email", ''))), '') IS NOT NULL
                     AND lower(trim(COALESCE(blacklist."AfterJson"::jsonb ->> 'Email', ''))) = lower(trim(r."Email")))
                    OR
                    (NULLIF(lower(trim(COALESCE(r."Phone", ''))), '') IS NOT NULL
                     AND lower(trim(COALESCE(blacklist."AfterJson"::jsonb ->> 'Phone', ''))) = lower(trim(r."Phone")))
                  );

                UPDATE "Reservations" r
                SET "IsNoShow" = FALSE,
                    "IsArrived" = FALSE,
                    "IsBlacklisted" = FALSE,
                    "Status" = 'Released'
                FROM restored_legacy_no_shows restored
                WHERE r."Id" = restored."Id";

                WITH eligible AS (
                    SELECT r.*,
                        CASE WHEN NULLIF(lower(trim(COALESCE(r."Email", ''))), '') IS NOT NULL
                            THEN 'email:' || lower(trim(r."Email"))
                            ELSE 'phone:' || lower(trim(r."Phone")) END AS customer_key
                    FROM "Reservations" r
                    JOIN restored_legacy_no_shows restored ON restored."Id" = r."Id"
                    WHERE NULLIF(trim(COALESCE(r."Email", '')), '') IS NOT NULL
                       OR NULLIF(trim(COALESCE(r."Phone", '')), '') IS NOT NULL
                ), grouped AS (
                    SELECT customer_key,
                        (array_agg("GuestName" ORDER BY "ReservedDate" DESC, "CreatedAtUtc" DESC))[1] guest_name,
                        NULLIF((array_agg("Phone" ORDER BY "ReservedDate" DESC, "CreatedAtUtc" DESC))[1], '') phone,
                        NULLIF((array_agg("Email" ORDER BY "ReservedDate" DESC, "CreatedAtUtc" DESC))[1], '') email,
                        count(*)::integer reservation_count,
                        min("CreatedAtUtc") first_at,
                        max("CreatedAtUtc") last_at
                    FROM eligible GROUP BY customer_key
                )
                INSERT INTO "CustomerProfiles" (
                    "GuestName", "Phone", "Email", "ReservationCount", "IsRegularCustomer",
                    "BirthDate", "MarketingConsent", "FirstReservationAtUtc", "LastReservationAtUtc")
                SELECT g.guest_name, g.phone, g.email, g.reservation_count, g.reservation_count >= 5,
                    NULL, FALSE, g.first_at, g.last_at
                FROM grouped g
                WHERE NOT EXISTS (
                    SELECT 1 FROM "CustomerProfiles" p
                    WHERE (g.email IS NOT NULL AND lower(trim(COALESCE(p."Email", ''))) = lower(trim(g.email)))
                       OR (g.phone IS NOT NULL AND lower(trim(COALESCE(p."Phone", ''))) = lower(trim(g.phone)))
                );
            """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Historical attendance restoration is intentionally irreversible.
        }
    }
}
