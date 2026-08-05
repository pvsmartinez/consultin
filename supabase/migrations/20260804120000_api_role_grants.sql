-- Table-level privileges for the PostgREST API roles.
--
-- Why this exists: the hosted project has these grants from Supabase's project
-- bootstrap (default privileges for the `postgres` role), so they were never written
-- down as a migration. A database rebuilt purely from this migration set therefore
-- came up with `anon`/`authenticated` holding no SELECT/INSERT/UPDATE/DELETE on any
-- of the 39 public tables — every API call answered 403 "permission denied for
-- table ...". That made local development, CI and any staging/restore unusable.
--
-- Row visibility is still governed entirely by RLS, which is enabled on every table;
-- these grants only let PostgREST reach the tables so the policies can be evaluated.
--
-- This is a no-op in production (the grants are already there).
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES  IN SCHEMA public TO anon, authenticated, service_role;

-- Keep future objects covered without another migration.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES  TO anon, authenticated, service_role;
