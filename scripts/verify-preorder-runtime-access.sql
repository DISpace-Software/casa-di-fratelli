-- Run using the API's actual restaurant runtime connection, once per tenant.
-- This checks access only: it grants nothing and cannot change restaurant data.
\set ON_ERROR_STOP on
BEGIN READ ONLY;

DO $check$
DECLARE
    table_name text;
    privilege_name text;
    table_id regclass;
    sequence_name text;
BEGIN
    IF NOT has_schema_privilege(current_user, 'public', 'USAGE') THEN
        RAISE EXCEPTION 'Runtime role % lacks USAGE on public', current_user;
    END IF;
    FOREACH table_name IN ARRAY ARRAY['ReservationPreorders', 'PreorderPayments'] LOOP
        table_id := to_regclass(format('public.%I', table_name));
        IF table_id IS NULL THEN
            RAISE EXCEPTION 'Missing preorder table public.%', table_name;
        END IF;
        FOREACH privilege_name IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
            IF NOT has_table_privilege(current_user, table_id, privilege_name) THEN
                RAISE EXCEPTION 'Runtime role % lacks % on public.%', current_user, privilege_name, table_name;
            END IF;
        END LOOP;
        -- Current IDs are UUIDs; check sequence access if a future migration adds one.
        sequence_name := pg_get_serial_sequence(format('public.%I', table_name), 'Id');
        IF sequence_name IS NOT NULL AND NOT has_sequence_privilege(current_user, sequence_name, 'USAGE') THEN
            RAISE EXCEPTION 'Runtime role % lacks USAGE on sequence %', current_user, sequence_name;
        END IF;
    END LOOP;
END
$check$;

-- Resolve the same relationship used by cancellation's paid-preorder guard.
-- Resolve the columns used by the guest order list, even for an empty table.
SELECT "OperationsJson" FROM "ReservationPreorders" WHERE false;

-- No reservation identifiers, contact data or payment values are returned.
SELECT 'preorder-runtime-access-ok' AS check_result, current_user AS runtime_role
FROM (SELECT p."Id"
      FROM "PreorderPayments" p
      JOIN "ReservationPreorders" d ON d."Id" = p."ReservationPreorderId"
      JOIN "Reservations" r ON r."Id" = d."ReservationId"
      WHERE NOT r."IsDeleted"
      LIMIT 1) AS payment_access
RIGHT JOIN (SELECT 1) AS smoke ON true;

ROLLBACK;
