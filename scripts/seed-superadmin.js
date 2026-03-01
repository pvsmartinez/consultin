#!/usr/bin/env node
// seed-superadmin.js — creates a super-admin account using the Supabase service role key.
//
// REQUIREMENTS:
//   • Node.js 20+ (ESM, --env-file flag)
//   • VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY in app/.env
//     (SUPABASE_SERVICE_KEY = service_role secret from Supabase Dashboard → Settings → API)
//
// USAGE:
//   node --env-file=app/.env scripts/seed-superadmin.js \
//     --email="admin@suaclinica.com" \
//     --password="SenhaForte123!" \
//     --name="Pedro Martinez"
//
// Idempotent: if the email already exists, it will only ensure the user_profiles row exists.

import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Resolve @supabase/supabase-js from app/node_modules (script lives outside app/)
const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)
const require    = createRequire(join(__dirname, '../app/package.json'))
const { createClient } = require('@supabase/supabase-js')

// ─── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌  Missing env vars.')
  console.error('   Add to app/.env:')
  console.error('     VITE_SUPABASE_URL=https://<project>.supabase.co')
  console.error('     SUPABASE_SERVICE_KEY=<service_role secret key>')
  console.error('   Get the service role key from:')
  console.error('   Supabase Dashboard → Settings → API → service_role')
  process.exit(1)
}

// ─── Parse args ──────────────────────────────────────────────────────────────
const args = {}
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--')) {
    const [key, ...rest] = arg.slice(2).split('=')
    args[key] = rest.join('=')
  }
}

const email    = args['email']
const password = args['password']
const name     = args['name'] ?? 'Super Admin'

if (!email || !password) {
  console.error('❌  Usage: node seed-superadmin.js --email="..." --password="..." [--name="..."]')
  process.exit(1)
}

// ─── Client (service role, no session persistence) ────────────────────────────
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log(`\n🔑  Creating super admin: ${email}`)

// 1. Create or retrieve the auth user
let authUserId

const { data: existingUsers, error: listErr } = await supabase.auth.admin.listUsers()
if (listErr) { console.error('❌  listUsers:', listErr.message); process.exit(1) }

const existingUser = existingUsers.users.find(u => u.email?.toLowerCase() === email.toLowerCase())

if (existingUser) {
  console.log(`⚠️   Auth user already exists (${existingUser.id}), checking profile…`)
  authUserId = existingUser.id
} else {
  const { data, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,   // skip the confirmation email
  })
  if (createErr) { console.error('❌  createUser:', createErr.message); process.exit(1) }
  authUserId = data.user.id
  console.log(`✅  Auth user created: ${authUserId}`)
}

// 2. Upsert user_profiles with is_super_admin = true
const { error: profileErr } = await supabase.from('user_profiles').upsert(
  {
    id:             authUserId,
    clinic_id:      null,    // super admins are not tied to a single clinic
    roles:          ['admin'],
    name,
    is_super_admin: true,
  },
  { onConflict: 'id' }
)

if (profileErr) {
  console.error('❌  user_profiles upsert:', profileErr.message)
  process.exit(1)
}

console.log(`✅  Super admin profile ready.`)
console.log(`\n   Email    : ${email}`)
console.log(`   UUID     : ${authUserId}`)
console.log(`   Name     : ${name}`)
console.log(`\n🎉  Done! Log in at the app with those credentials.\n`)
