-- Migration: 0023_permission_overrides
-- Adds per-user permission overrides, enabling admins to grant or restrict
-- individual permissions without changing the user's base role.
--
-- Examples:
--   {"canViewFinancial": true}   → receptionist gains financial access
--   {"canManageProfessionals": false} → admin loses professional management
--
-- The frontend merges: role defaults → permission_overrides (last wins).

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS permission_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Admins can update permission_overrides of other members in their clinic.
-- Covered by the existing user_profiles RLS policies (clinic admin can update
-- members of their clinic via the admin-users edge function or direct update).
-- No new RLS policy needed — the column is protected by existing row-level rules.

COMMENT ON COLUMN public.user_profiles.permission_overrides IS
  'Per-user permission overrides applied on top of role defaults. '
  'Keys match ROLE_PERMISSIONS in types/index.ts. '
  'null value = use role default; true = grant; false = revoke.';
