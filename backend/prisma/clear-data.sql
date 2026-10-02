-- Wipes every row of data (customers, leads, bookings, payments, users, inventory, catalog, files, numbering, audit log…)
-- but keeps the tables, the migration history, and the currency list that the currencies migration inserts.
-- Afterwards run the seed in production mode to put back just the Super Admin and the company profile:
--   NODE_ENV=production npx prisma db seed
-- This cannot be undone. On a server, take a backup first (pg_dump) and stop the API while it runs.

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'Currency')
  LOOP
    EXECUTE format('TRUNCATE TABLE %I RESTART IDENTITY CASCADE', t.tablename);
  END LOOP;
END $$;
