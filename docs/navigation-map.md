# Consultin Navigation Map

Last audited: 2026-04-13

Purpose: keep a short operational map of the app's route surface, guards, module gates, special deep-links, and public/indexable URLs.

## Route Families

### Public

Defined in `app/src/routes/PublicRoutes.tsx`.

| Route               | Purpose             | Notes                                             |
| ------------------- | ------------------- | ------------------------------------------------- |
| `/`                 | Main landing page   | Public, indexable                                 |
| `/login`            | Sign in             | Public, not intended for indexing                 |
| `/cadastro-clinica` | Clinic signup       | Public, primary conversion route                  |
| `/bem-vindo`        | Post-signup welcome | Public flow page                                  |
| `/p/:slug`          | Public clinic page  | Dynamic public page, not listed in static sitemap |
| `/p/:slug/agendar`  | Public booking page | Dynamic public booking route                      |
| `*`                 | Public not found    | Uses public 404 page                              |

### Onboarding

Defined in `app/src/routes/OnboardingRoutes.tsx`.

| Route         | Purpose                   | Notes                                                         |
| ------------- | ------------------------- | ------------------------------------------------------------- |
| `/onboarding` | Clinic setup wizard       | Used when admin has clinic with `onboardingCompleted = false` |
| `*`           | Redirect to `/onboarding` | Fallback inside onboarding world                              |

### Staff

Defined in `app/src/routes/StaffRoutes.tsx`.

| Route                     | Purpose                   | Guard                    | Module gate |
| ------------------------- | ------------------------- | ------------------------ | ----------- |
| `/agenda`                 | Main agenda               | none                     | none        |
| `/minha-agenda`           | Professional agenda view  | none                     | none        |
| `/minha-disponibilidade`  | Professional availability | none                     | none        |
| `/pacientes`              | Patient list              | `canViewPatients`        | none        |
| `/pacientes/novo`         | New patient flow          | `canManagePatients`      | none        |
| `/pacientes/:id`          | Patient detail            | `canViewPatients`        | none        |
| `/pacientes/:id/editar`   | Patient edit flow         | `canManagePatients`      | none        |
| `/pacientes/:id/anamnese` | Patient anamnesis         | `canViewPatients`        | none        |
| `/salas`                  | Rooms management          | none                     | `rooms`     |
| `/equipe`                 | Team management           | `canManageProfessionals` | none        |
| `/profissionais`          | Legacy alias              | redirect to `/equipe`    | none        |
| `/whatsapp`               | WhatsApp inbox            | `canViewWhatsApp`        | `whatsapp`  |
| `/financeiro`             | Financial dashboard       | `canViewFinancial`       | `financial` |
| `/relatorios`             | Financial reports         | `canViewFinancial`       | `financial` |
| `/configuracoes`          | Settings hub              | `canManageSettings`      | none        |
| `/assinatura`             | Billing/subscription      | none                     | none        |
| `/minha-conta`            | Current user account      | none                     | none        |
| `/acesso-negado`          | Access denied             | none                     | none        |
| `*`                       | Staff fallback            | redirect to `/agenda`    | none        |

### Patient Portal

Defined in `app/src/routes/PatientRoutes.tsx`.

| Route               | Purpose                  | Notes                                              |
| ------------------- | ------------------------ | -------------------------------------------------- |
| `/`                 | Patient home redirect    | Sends to `/minhas-clinicas` or `/minhas-consultas` |
| `/minhas-clinicas`  | Patient clinics switcher | Used when user belongs to multiple clinics         |
| `/minhas-consultas` | Patient appointments     | Main patient home for single clinic                |
| `/agendar`          | Patient booking flow     | Portal route                                       |
| `/meu-perfil`       | Patient profile          | Portal route                                       |
| `/acesso-negado`    | Access denied            | Portal route                                       |
| `*`                 | Portal fallback          | redirect to `/minhas-consultas`                    |

## App-Level Entry Rules

Defined in `app/src/App.tsx`.

| Condition                        | Destination                     |
| -------------------------------- | ------------------------------- |
| Unauthenticated                  | Public routes                   |
| `recoveryMode`                   | `NovaSenhaPage`                 |
| Public path starts with `/p/`    | Public routes                   |
| Logged in without profile        | `OnboardingPage`                |
| Patient role                     | Patient portal routes           |
| Admin with incomplete onboarding | Onboarding routes               |
| Superadmin without clinic        | `https://admin.pmatz.com`       |
| All other staff/admin            | Staff routes inside `AppLayout` |

## Special Redirects

Defined in `app/src/routes/StaffRoutes.tsx` and `app/src/routes/PatientRoutes.tsx`.

| From                  | To                                                            |
| --------------------- | ------------------------------------------------------------- |
| `/`                   | `/agenda` for staff, patient home redirect for patient portal |
| `/hoje`               | `/agenda`                                                     |
| `/dashboard`          | `/agenda`                                                     |
| `/profissionais`      | `/equipe`                                                     |
| unknown staff route   | `/agenda`                                                     |
| unknown patient route | `/minhas-consultas`                                           |

## Settings Deep-Links

Single source of truth: `app/src/lib/settingsNavigation.ts`.

Use `buildSettingsPath(tab?, entity?)` instead of hardcoding `/configuracoes` with route state.

Supported tabs:

- `dados`
- `agenda`
- `servicos`
- `anamnese`
- `campos`
- `disponibilidade`
- `salas`
- `pagamento`
- `whatsapp`
- `notificacoes`
- `usuarios`
- `pagina-publica`

Supported `entity` values for `campos`:

- `pacientes`
- `profissionais`

Known deep-link examples:

- `buildSettingsPath('campos', 'pacientes')`
- `buildSettingsPath('campos', 'profissionais')`
- `buildSettingsPath('anamnese')`
- `buildSettingsPath('whatsapp')`

## Internal Navigation Sources

Primary shell navigation lives in `app/src/components/layout/AppLayout.tsx`.

Operational nav items:

- `/agenda`
- `/pacientes`
- `/equipe` when `staff` module is active and permission allows
- `/salas` when `rooms` module is active
- `/financeiro` when `financial` module is active and permission allows
- `/whatsapp` when `whatsapp` module is active and permission allows

Administrative nav item:

- `/relatorios` when `financial` module is active and permission allows

Footer nav items:

- `/configuracoes`
- `/minha-conta`
- `/assinatura` for admin

## Known Fragile Areas To Watch

- Any new link into Settings should use `buildSettingsPath`.
- Any new module-gated route should be reflected in both `StaffRoutes.tsx` and `AppLayout.tsx`.
- Dynamic public clinic pages (`/p/:slug`) are discoverable in-app but are not part of the static `public/sitemap.xml`.
- Public marketing pages must stay aligned across `public/sitemap.xml`, `public/robots.txt`, `public/llms.txt`, `public/llms-full.txt`, and `vercel.json` rewrites/redirects.

## Public SEO Surface

Static public files live in `app/public`.

Core crawler files:

- `robots.txt`
- `sitemap.xml`
- `llms.txt`
- `llms-full.txt`

Static indexable marketing pages currently present:

- `/sistema-para-clinicas`
- `/software-para-consultorios`
- `/agenda-medica-online`
- `/clinica-odontologica`
- `/clinica-de-psicologia`
- `/clinica-de-estetica`
- `/clinica-de-fisioterapia`
- `/confirmar-consulta-whatsapp`
- `/reducao-de-faltas`
- `/software-para-recepcao`
- `/para-fisioterapeutas`
- `/para-medicos`
- `/para-nutricionistas`
- `/para-psicologos`
- `/para-dentistas`
- `/para-estetica`
- `/para-clinicas`
- `/prontuario-eletronico`
- `/lembrete-de-consulta`
- `/gestao-de-clinica`
- `/controle-financeiro-clinica`
- `/agendamento-online`
- `/politica-de-privacidade`
- `/termos-de-uso`
- `/exclusao-de-dados`

## Vercel URL Mapping Notes

Defined in `vercel.json`.

- Trailing-slash redirects exist for the static marketing URLs.
- Static marketing URLs rewrite to matching `.html` files in `app/public`.
- SPA routes like `/`, `/login`, and `/cadastro-clinica` rewrite to `index.html`.
- Catch-all rewrite `/(.*) -> /index.html` means any missing explicit public rewrite can silently become an SPA route, so new public pages should always be added deliberately.

## Minimal Maintenance Checklist

When adding or changing a route:

1. Update the route file (`PublicRoutes`, `StaffRoutes`, `PatientRoutes`, or `OnboardingRoutes`).
2. Update `AppLayout.tsx` if the route belongs in the sidebar or bottom nav.
3. If it is a Settings deep-link, use `buildSettingsPath`.
4. If it is a public marketing page, update `public/sitemap.xml`, `public/llms.txt` or `public/llms-full.txt` when relevant, and `vercel.json` rewrites/redirects.
5. If it is module-gated, confirm `RequireModule` and the nav visibility stay aligned.
