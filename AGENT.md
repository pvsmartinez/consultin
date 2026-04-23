# AGENT.md - Consultin

> **For GitHub Copilot and AI agents working in this repo.**
> Read this file fully before making code changes.

## Project

**Consultin** - SaaS platform for small Brazilian clinics (dental, medical, aesthetic, physio, etc.)

**Owner:** Pedro Martinez (pvsmartinez@gmail.com)
**Repo:** https://github.com/pvsmartinez/consultin
**Started:** February 2026

---

## What We Are Building

A multi-tenant clinic management system covering:

- 📅 **Agenda** — appointment scheduling, conflict detection, daily/weekly/monthly views
- 👤 **Pacientes** — patient CRUD, history, CPF/contact management
- 🩺 **Profissionais** — professional registration, availability configuration
- 💰 **Financeiro** — payment tracking, invoicing, monthly reports
- 🔔 **Notificações** — appointment reminders (e-mail → SMS/WhatsApp later)
- 🏥 **Multi-clínica** — full data isolation per clinic via Supabase RLS

---

## Product Concept — Simplest Possible Tool for Any Clinic

Consultin is designed to be **the simplest possible clinic management tool** — highly
customizable so each clinic only sees what it actually needs. No clutter, no "enterprise"
features forced on a 2-dentist office.

### Initial Setup

Fresh clinics should land in the product immediately. The first post-signup experience is
the regular agenda, not a blocking wizard.

`clinics.onboarding_completed` is still kept as a lightweight product signal, but it now
controls only optional guidance inside `/configuracoes`. It must never block access to the
agenda or other staff routes.

The initial setup guidance should point users to the same existing settings tabs:

| Area            | Where to configure                                                     |
| --------------- | ---------------------------------------------------------------------- |
| Clinic data     | `/configuracoes?tab=dados`                                             |
| Schedule basics | `/configuracoes?tab=agenda`                                            |
| Form fields     | `/configuracoes?tab=campos&entity=pacientes` or `entity=profissionais` |
| Team and access | `/configuracoes?tab=usuarios`                                          |

`/onboarding` remains only as a compatibility alias and should redirect to the setup-focused
view of `/configuracoes`.

### Field Customization Architecture

Every registration form respects two config blobs stored in `clinics`:

```
clinics.patient_field_config        JSONB  — Record<fieldKey, boolean>  (built-in toggles)
clinics.custom_patient_fields       JSONB  — CustomFieldDef[]            (extra fields)
clinics.professional_field_config   JSONB  — Record<fieldKey, boolean>
clinics.custom_professional_fields  JSONB  — CustomFieldDef[]
```

Built-in fields default to **visible** when the key is absent. The clinic disables
a field by setting `fieldKey: false`. Custom fields are appended under "Informações
adicionais".

**`CustomFieldDef` types:** `text | number | date | select | multiselect | boolean`

For `select` and `multiselect`, `options: string[]` holds the choices.
Values are stored as `unknown` (scalar or `string[]`) in the JSONB `custom_fields`
column of the `patients` / `professionals` row.

### Routing Guard

```
After login:
  profile missing                       → show OnboardingPage (invite / patient / no-access flow)
  clinic.onboardingCompleted === false  → keep access to normal staff routes
```

The `/onboarding` route should behave as a compatibility alias to the setup-focused settings
experience, not as a mandatory first-run blocker.

---

## Target Platforms

| Platform                | Priority     | Notes                            |
| ----------------------- | ------------ | -------------------------------- |
| Web (browser)           | Primary      | Any browser, mobile-responsive   |
| Desktop (macOS/Windows) | Secondary    | Tauri v2 wrapper — same codebase |
| Mobile app              | Future phase | React Native (Expo)              |

---

## Technical Stack

| Layer         | Technology                                             |
| ------------- | ------------------------------------------------------ |
| Frontend      | React 19 + TypeScript + Vite                           |
| Styling       | Tailwind CSS v3                                        |
| Routing       | React Router v7                                        |
| Icons         | Phosphor Icons                                         |
| Desktop shell | Tauri v2 (Rust)                                        |
| Backend / DB  | Supabase (PostgreSQL + Auth + Storage + RLS)           |
| DB client     | `@supabase/supabase-js` v2                             |
| Date handling | `date-fns` + `date-fns-tz` (TZ: `America/Sao_Paulo`)   |
| Money         | Centavos (integer) in DB; formatted as `R$ 0,00` in UI |

---

## Project Structure

```
consultin/
├── app/                              # Tauri v2 + React frontend
│   └── src/
│       ├── App.tsx                   # Root: routing, auth guards, query client
│       ├── contexts/
│       │   └── AuthContext.tsx       # Auth state, profile, clinic, role/permissions
│       ├── pages/
│       │   ├── LoginPage.tsx
│       │   ├── OnboardingPage.tsx    # 5-step wizard (runs once per clinic)
│       │   ├── DashboardPage.tsx
│       │   ├── AppointmentsPage.tsx  # Calendar views (day/week/month)
│       │   ├── AgendarConsultaPage.tsx # Patient-facing booking
│       │   ├── PatientsPage.tsx      # Patient list + search
│       │   ├── PatientDetailPage.tsx # Individual patient + history
│       │   ├── ProfessionalsPage.tsx
│       │   ├── FinanceiroPage.tsx    # Payments + reports
│       │   ├── RelatoriosPage.tsx
│       │   ├── SettingsPage.tsx      # Clinic configuration (tabbed)
│       │   ├── settings/             # Sub-tabs: Dados, Campos, Agenda,
│       │   │                         #   Disponibilidade, Financeiro, Salas, WhatsApp
│       │   ├── WhatsAppInboxPage.tsx
│       │   ├── AdminPage.tsx         # Super-admin only
│       │   ├── MeuPerfilPage.tsx
│       │   ├── MyAppointmentsPage.tsx
│       │   ├── CadastroPage.tsx
│       │   └── AccessDeniedPage.tsx
│       ├── components/
│       │   ├── layout/
│       │   │   ├── AppLayout.tsx     # Sidebar + main layout shell
│       │   │   └── PatientPortalLayout.tsx
│       │   ├── appointments/
│       │   │   ├── AppointmentModal.tsx
│       │   │   └── AppointmentPaymentModal.tsx
│       │   ├── patients/
│       │   │   └── PatientRecordsPanel.tsx
│       │   ├── professionals/
│       │   │   ├── ProfessionalModal.tsx
│       │   │   └── ProfessionalBankAccountModal.tsx
│       │   ├── auth/
│       │   │   └── RequireAuth.tsx
│       │   ├── ui/                   # Badge, Input, Select, TextArea, CustomFieldInput
│       │   └── ImportModal.tsx
│       ├── hooks/
│       │   ├── usePatients.ts        # CRUD + search (React Query)
│       │   ├── useAppointments.ts    # Read + filters
│       │   ├── useAppointmentsMutations.ts  # Create/update/cancel
│       │   ├── useAvailabilitySlots.ts
│       │   ├── useAppointmentPayments.ts
│       │   ├── useProfessionals.ts
│       │   ├── useProfessionalBankAccount.ts
│       │   ├── usePatientRecords.ts
│       │   ├── useClinic.ts          # Clinic read + update
│       │   ├── useFinancial.ts
│       │   ├── useBilling.ts         # Asaas integration
│       │   ├── useRooms.ts
│       │   ├── useInvites.ts
│       │   └── useAdmin.ts
│       ├── services/
│       │   ├── supabase.ts           # Supabase client singleton
│       │   ├── asaas.ts              # Asaas payments API
│       │   └── whatsapp.ts           # WhatsApp messaging
│       ├── types/
│       │   ├── index.ts              # Domain types (Patient, Appointment, etc.)
│       │   └── database.ts           # Auto-generated: `supabase gen types typescript`
│       └── utils/
│           ├── validators.ts         # CPF, CNPJ, phone, CEP validation + formatters
│           ├── currency.ts           # centavos ↔ R$ 0,00
│           └── date.ts               # date/time utils (pt-BR, America/Sao_Paulo)
├── supabase/
│   ├── migrations/                   # SQL migrations — apply with apply-migrations.sh
│   ├── functions/                    # Edge Functions (Deno)
│   │   ├── admin-users/              # Super-admin user management
│   │   ├── asaas/                    # Asaas API proxy
│   │   ├── asaas-webhook/            # Asaas payment webhook
│   │   ├── whatsapp-send/            # Send WhatsApp messages
│   │   ├── whatsapp-reminders/       # Scheduled appointment reminders
│   │   └── whatsapp-ai-agent/        # AI-powered WhatsApp bot
│   └── seed.sql
└── scripts/
    ├── apply-migrations.sh           # Applies all migrations (reads password from pedrin/.env)
    └── push-asaas-secrets.sh         # Pushes Asaas keys to Supabase secrets
```

---

## Dev Setup

```bash
# 1. Install frontend dependencies
cd app && npm install

# 2. Copy env file and fill in your Supabase keys
cp app/.env.example app/.env

# 3. Run web dev server only (no Tauri)
cd app && npm run dev

# 4. Run full Tauri desktop app
cd app && npm run tauri dev

# 5. Type-check (must be zero errors)
cd app && npm run typecheck
```

---

## Supabase — Migrations & Types

### Applying migrations (CI/CD — preferred)

Migrations are applied automatically on `git push origin main` via GitHub Actions (`scripts/ci_migrate.sh`). Nothing else needed.

### Applying migrations manually (if needed)

Use `scripts/apply-migrations.sh` — it reads the DB password from `pedrin/.env`:

```bash
cd consultin && bash scripts/apply-migrations.sh
```

### Regenerating TypeScript types

If the schema changes, regenerate types using the Supabase CLI (install if not present):

```bash
brew install supabase/tap/supabase
supabase login
supabase gen types typescript --project-id nxztzehgnkdmluogxehi > app/src/types/database.ts
```

**Note:** `supabase CLI` is available at `/usr/local/bin/supabase`. Already logged in. No need to install or login.

### RLS Policy Authoring Rules — OBRIGATÓRIO

**Sempre** envolva chamadas a `auth.uid()`, `auth.email()`, `auth.jwt()` e `current_setting()` em `(select ...)` dentro de cláusulas `USING` / `WITH CHECK` de policies RLS.

```sql
-- ✅ CORRETO — avaliado uma vez por statement ("init plan")
CREATE POLICY "example" ON my_table
  FOR ALL
  USING ((select auth.uid()) = user_id);

-- ❌ ERRADO — auth.uid() reavaliado para cada linha scaneada
CREATE POLICY "example" ON my_table
  FOR ALL
  USING (auth.uid() = user_id);
```

**Por quê:** O Postgres executa funções em cláusulas RLS para cada linha durante o scan. Sem o `(select ...)`, `auth.uid()` vira chamada de função por linha — O(n). Com o wrapper, o otimizador trata como escalar estável e avalia uma única vez — O(1).

**Exceções legítimas:** Dentro de corpos PL/pgSQL (ex: `v_user_id := auth.uid()`) não há problema — já é avaliado uma vez por invocação de função.

**Histórico:** Em março/2026 foram criadas as migrations `0034_fix_rls_auth_init_plan.sql` (consultin) e `0003_fix_rls_auth_init_plan.sql` (cafezin) para corrigir ~20 policies que tinham esse problema. O Supabase Linter detecta isso como "Auth RLS Initialization Plan".

---

## Performance Rules — OBRIGATÓRIO

> Estas regras foram estabelecidas após uma auditoria em março/2026 que identificou carregamentos de 10s+.

### 1. Nunca criar um hook `useQuery` que duplica dados já em cache

Todo dado que já é buscado por um hook existente **deve reusar o mesmo queryKey**.
Criar um segundo hook para os mesmos dados com uma key diferente gera um fetch extra toda vez que a página é montada, mesmo que o dado já esteja na memória.

```typescript
// ❌ ERRADO — 'professionals-list-report' nunca vai ter cache hit
// porque o app guarda sob ['professionals', clinicId]
export function useProfessionalsList() {
  return useQuery({ queryKey: ['professionals-list-report'], ... })
}

// ✅ CORRETO — reutiliza o cache de useProfessionals()
import { useProfessionals } from './useProfessionals'
const { data: allProfs } = useProfessionals()
const actives = allProfs.filter(p => p.active)
```

**Lista de dados que já têm cache no startup (não recriar):**

- `['professionals', clinicId]` — `useProfessionals()`
- `['clinic', clinicId]` — `useClinic()`
- `['my-professional-records', userId]` — `useMyProfessionalRecords()`

### 2. Nunca encadear queries dependentes (waterfall)

Se A depende do resultado de B, que depende de C → você tem um waterfall. O tempo de carregamento vira A + B + C.

Regras para evitar:

- **Seede dados no startup:** o RPC `get_startup_data()` em `AuthContext.tsx` já retorna profile + clinic + professionals + my-professional-records. Se um hook novo precisar de dados que chegam no startup, seed-o ali.
- **Use `Promise.all` quando houver múltiplos fetches independentes** dentro de um mesmo `queryFn`.
- **Gate queries com `enabled`:** uma query não deve disparar enquanto depende de outra que ainda não resolveu.

```typescript
// ❌ ERRADO — 3 RTTs sequenciais
const { data: a } = await fetchA();
if (!a) return;
const { data: b } = await fetchB(a.id);
if (!b) return;
const { data: c } = await fetchC(b.id);

// ✅ CORRETO — quando A, B, C são independentes
const [a, b, c] = await Promise.all([fetchA(), fetchB(), fetchC()]);
```

### 3. Sempre definir `staleTime` explícito quando diferir do default

O QueryClient global tem `staleTime: 60_000` (1 min). Qualquer hook que precisar de comportamento diferente **deve declarar explicitamente**.

| Tipo de dado                                                    | staleTime recomendado                       |
| --------------------------------------------------------------- | ------------------------------------------- |
| Dados de configuração da clínica (clinic, rooms, service types) | `5 * 60_000` (5 min)                        |
| Listas de referência (professionals, availability, FAQs)        | `2 * 60_000` (2 min)                        |
| Dados transacionais do dia (appointments, notifications)        | `30_000` a `60_000` (30–60s)                |
| Dados de relatório (mês fechado)                                | `5 * 60_000` (5 min)                        |
| Queries em tempo real (whatsapp messages)                       | não usar React Query — usar Realtime direto |

### 4. Nunca usar `select('*')` em tabelas grandes sem necessidade

Sempre liste as colunas necessárias. Use `PATIENT_LIST_COLS` para listas de pacientes.
Use `select('*')` apenas em páginas de detalhe onde todos os campos são exibidos.

### 5. `useMyProfessionalRecords` tem fallback por email — mantenha o índice

A tabela `professionals` deve ter o índice funcional `lower(email)` (migration `0039`).
Se esse índice for removido, o fallback vira table scan.

### 6. Auth timeout não deve passar de 5s

O timeout em `AuthContext.tsx` está em `5000ms`. **Não aumentar.**
Um timeout maior tem impacto direct na UX quando o usuário abre o app com rede lenta.

### 7. Toda query sequencial nova em um hook → abrir PR com benchmark

Antes de criar qualquer query que aguarda o resultado de outra para disparar (seja via `enabled:` ou await encadeado), documente no PR o motivo e valide se não há como paralelizar.

---

## Query Key Registry — OBRIGATÓRIO

> Todas as keys do React Query vivem em `app/src/lib/queryKeys.ts` (objeto `QK`).
> **NUNCA** escreva arrays de chave inline. Cada key nova deve ser adicionada ao `QK` primeiro.

### Por quê

- TypeScript detecta na compile time chaves duplicadas ou com nome errado — o bug de `useProfessionalsList` vs `useProfessionals` não teria existido com este padrão.
- Centraliza em um lugar descobrir "quem invalida o quê": basta buscar `QK.appointments.all()`.
- Garante que a chave de prefixo usada nas invalidações respeite a mesma estrutura da chave completa.

### Como usar

```typescript
import { QK } from '../lib/queryKeys'

// Numa query
useQuery({ queryKey: QK.professionals.list(clinicId), ... })

// Numa invalidação
qc.invalidateQueries({ queryKey: QK.professionals.list(clinicId) })

// Invalidação de prefixo (invalida qualquer key que comece com 'appointments')
qc.invalidateQueries({ queryKey: QK.appointments.all() })
```

### Como adicionar uma key nova

1. Identifique o domínio (ou crie um novo namespace se não existir)
2. Adicione a factory function em `queryKeys.ts`, mantendo o padrão do bloco correspondente
3. Use `QK.domain.method()` no hook — nunca o array literal

```typescript
// queryKeys.ts — exemplo de adição
  myDomain: {
    all:    ()           => ['my-domain']             as const,
    list:   (id: string) => ['my-domain', id]         as const,
    detail: (id: string) => ['my-domain', id, 'detail'] as const,
  },
```

---

## Environment & Credentials (KEEP THIS UPDATED)

> **If any of the values below change, update this section immediately so future agents don't waste time with wrong credentials.**

### Supabase Project (consultin)

| Key              | Value                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| Project ref      | `nxztzehgnkdmluogxehi`                                                                         |
| Region           | `sa-east-1`                                                                                    |
| REST URL         | `https://nxztzehgnkdmluogxehi.supabase.co`                                                     |
| Anon key         | `sb_publishable_hXdLHGFae86XehzBS49T9A_XejOUKfA`                                               |
| Service role key | stored in `pedrin/secrets/supabase/config.json`                                                |
| DB password      | stored in `pedrin/secrets/supabase/config.json`                                                |
| Pooler URL       | `postgresql://postgres.nxztzehgnkdmluogxehi@aws-1-sa-east-1.pooler.supabase.com:5432/postgres` |

To read credentials programmatically:

```bash
cat /Users/pedromartinez/Dev/pmatz/pedrin/secrets/supabase/config.json | python3 -c "
import sys, json
d = json.load(sys.stdin)
c = next(p for p in d['projects'] if 'consultin' in p.get('comment','').lower() or p['name'] == 'pvsmartinez-supabase')
print('url:', c['url'])
print('service_role_key:', c['service_role_key'])
print('db_password:', c['db_password'])
"
```

### Super Admin Account

| Field    | Value                                                         |
| -------- | ------------------------------------------------------------- |
| Email    | `pvsmartinez@gmail.com`                                       |
| Password | `12345678`                                                    |
| Profile  | `is_super_admin: true`, `roles: ["admin"]`, `clinic_id: null` |

Login via Supabase Auth (email+password) to get a JWT:

```bash
curl -s -X POST 'https://nxztzehgnkdmluogxehi.supabase.co/auth/v1/token?grant_type=password' \
  -H 'apikey: sb_publishable_hXdLHGFae86XehzBS49T9A_XejOUKfA' \
  -H 'Content-Type: application/json' \
  -d '{"email":"pvsmartinez@gmail.com","password":"12345678"}'
```

### CI/CD

- **GitHub Actions** (`.github/workflows/deploy.yml`): runs on every push to `main`, applies pending migrations via `scripts/ci_migrate.sh`
- **Vercel**: auto-deploys the frontend on every push to `main` via GitHub integration — no manual step needed
- **To deploy**: just `git push origin main` — both run in parallel automatically

---

## Tools Available on This Machine

> As of 2026-03-01. Update if the environment changes.

### ✅ Available

| Tool              | How to use                                                          |
| ----------------- | ------------------------------------------------------------------- |
| `curl`            | HTTP requests — primary way to interact with Supabase REST API      |
| `python3`         | Parse JSON from curl responses, run scripts                         |
| `node` / `npm`    | Frontend build, `npm run build`, `npm run typecheck`, `npm run dev` |
| `git`             | All git operations                                                  |
| Supabase REST API | CRUD via curl with anon/service-role key headers                    |

| `supabase CLI` | `/usr/local/bin/supabase` — deploy functions: `supabase functions deploy <name> --project-ref nxztzehgnkdmluogxehi` |

### ❌ Not Installed / Not Available

| Tool   | Notes                                                      |
| ------ | ---------------------------------------------------------- |
| `psql` | **Not installed.** Use Supabase REST API via curl instead. |

### Querying the Database

Since `psql` is not available, all direct DB queries must go through the **Supabase REST API**:

```bash
# Read with anon key (respects RLS — user must be authenticated)
curl -s 'https://nxztzehgnkdmluogxehi.supabase.co/rest/v1/TABLE?select=col1,col2' \
  -H 'apikey: sb_publishable_hXdLHGFae86XehzBS49T9A_XejOUKfA' \
  -H 'Authorization: Bearer <JWT>'

# Read / write with service role key (bypasses RLS — use for admin/debug only)
curl -s 'https://nxztzehgnkdmluogxehi.supabase.co/rest/v1/TABLE?select=*' \
  -H 'apikey: <service_role_key>' \
  -H 'Authorization: Bearer <service_role_key>'

# List all Auth users (admin API)
curl -s 'https://nxztzehgnkdmluogxehi.supabase.co/auth/v1/admin/users?page=1&per_page=50' \
  -H 'apikey: <service_role_key>' \
  -H 'Authorization: Bearer <service_role_key>'
```

---

## Key Rules for AI Agents

1. **Language** — code in English, UI strings in Portuguese (pt-BR).
2. **Money** — always store as centavos (integer); never use floats for money.
3. **Dates** — store UTC, display in `America/Sao_Paulo`. Use utils from `src/utils/date.ts`.
4. **Validation** — always validate CPF, CNPJ, phone using `src/utils/validators.ts`.
5. **Auth** — use `useAuth` hook; never access `supabase.auth` directly in components.
6. **Multi-tenancy** — every DB query is automatically scoped by Supabase RLS policies. Never manually filter by `clinic_id` from the client.
7. **Typecheck** — run `npm run typecheck` after every non-trivial change. Zero errors is the bar.
8. **Commits** — use Conventional Commits (`feat:`, `fix:`, `chore:`, etc.), messages in English.
9. **Initial setup** — `clinic.onboardingCompleted` may drive optional setup guidance, but must not block clinic staff from reaching the agenda or other normal app routes.
10. **Field visibility** — never render a built-in patient/professional form field without first checking `fieldConfig[key] !== false`. Always pass `customPatientFields` / `customProfessionalFields` from the clinic to the form component.
11. **RLS auth calls** — in any `USING` / `WITH CHECK` clause, always write `(select auth.uid())` not `auth.uid()`. Same for `auth.email()`, `auth.jwt()`, `current_setting()`. Bare calls are re-evaluated per row and will trigger the Supabase "Auth RLS Initialization Plan" lint warning.

---

## Brazilian Compliance

- **LGPD** (Lei 13.709/2018) — patient data is sensitive. Never log CPF, names, or health data in plaintext.
- **RLS** — all tables have Row Level Security enabled; policies enforce clinic isolation.
- **Formats** — CPF: `000.000.000-00` | CNPJ: `00.000.000/0000-00` | Phone: `(11) 99999-9999`
