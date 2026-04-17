# WhatsApp Bot Audit — 2026-04-17

## Scope

This audit focuses on the WhatsApp onboarding and guidance experience for Consultin,
especially the path:

ad/landing page -> WhatsApp CTA -> Consultin platform number -> onboarding bot -> clinic creation / team join / first access

It also checks whether the per-clinic patient bot is actually in use and what can be verified today.

## Production Snapshot

Data pulled from the Consultin Supabase project on 2026-04-17:

- Platform bot users total: 4
- Platform bot users created in last 7 days: 2
- Platform bot messages sampled: 78
- Distinct sampled platform users: 4
- Platform bot sampled reply latency:
  - min: 0.52s
  - median: 1.24s
  - p90: 9.83s
- Clinic WhatsApp sessions: 0
- Clinic WhatsApp messages: 0
- Staff join requests: 0
- Clinics with `whatsapp_enabled = true`: 0
- Clinics with `whatsapp_phone_number_id` configured: 0

### Interpretation

- The platform bot is alive and answering.
- The platform bot still has very low real usage.
- The clinic bot for patients is effectively not validated in production yet.
- Today, we can review onboarding quality mostly by code + a tiny production sample, not by large real-user evidence.

## Current Entry Link

Public WhatsApp CTA currently points to:

`https://wa.me/5511936213029?text=Oi%2C+quero+cadastrar+minha+cl%C3%ADnica+no+Consultin`

This same link appears in:

- landing page CTA
- WhatsApp onboarding section
- clinic signup page shortcut

Relevant files:

- `app/src/pages-v1/LandingPage.tsx`
- `app/src/pages-v1/CadastroClinicaPage.tsx`
- `supabase/functions/whatsapp-webhook/index.ts`
- `supabase/functions/whatsapp-platform-agent/index.ts`

## 10 Entry Cases

### 1. Prospect clicks the ad CTA and sends the default text

Example:

`Oi, quero cadastrar minha clínica no Consultin`

Current behavior:

- Goes to the Consultin platform number.
- `whatsapp-webhook` routes the message to `whatsapp-platform-agent`.
- `whatsapp-platform-agent` detects clinic-creation intent and asks for clinic name + email.

Assessment:

- Status: good
- This is the strongest currently-supported entry path.
- It reduces friction well.

### 2. Prospect sends only `Oi`

Current behavior:

- No deterministic shortcut catches this on the platform bot.
- The LLM handles the first-touch greeting.
- Prompt instructs the bot to introduce Helen and show 3 options.

Assessment:

- Status: acceptable, but LLM-dependent
- Works in principle.
- More fragile than case 1 because greeting depends on model behavior.

### 3. Prospect asks for price first

Example:

`quanto custa?`

Current behavior:

- Deterministic fast-path returns `/precos` immediately.
- Interactive buttons are offered.

Assessment:

- Status: good
- This is a strong UX shortcut.
- No LLM needed.

### 4. Prospect asks for panel link first

Example:

`manda o link`

Current behavior:

- Deterministic fast-path returns `https://consultin.pmatz.com`.
- Interactive follow-up buttons are offered.

Assessment:

- Status: good
- Fast and reliable.

### 5. Prospect says they want to create a clinic directly

Example:

`quero criar minha clínica`

Current behavior:

- Deterministic shortcut asks for clinic name + email in one message.

Assessment:

- Status: good
- Strong low-friction path.
- Better than relying on a generic AI intro.

### 6. Prospect sends clinic name + email in one message

Example:

`Clínica Sorriso, joao@clinica.com`

Current behavior:

- The LLM is expected to interpret this and eventually call `search_clinics` then `create_clinic_now`.

Assessment:

- Status: partial
- Should work if the model behaves correctly.
- There is no server-side hard guard forcing the search step before creation.
- Duplicate prevention here depends too much on prompt discipline.

### 7. Staff member enters with a 6-character join code

Example:

`ABC123`

Current behavior:

- Deterministic shortcut stores the code in bot state.
- Bot asks for email + role.
- Interactive role buttons are offered.

Assessment:

- Status: good in code, not validated in production
- Flow design is strong.
- There is no real usage yet to confirm end-to-end success.

### 8. Staff member wants to join but has no code

Example:

`trabalho na Clínica X, como entro?`

Current behavior:

- LLM should search clinics and route to `request_clinic_membership`.
- Admin can later approve/reject the request.

Assessment:

- Status: partial and unvalidated
- Flow exists.
- There are zero `clinic_staff_requests` in production today.
- This path needs real-world validation or automated tests.

### 9. Existing clinic owner/admin comes back and asks operational questions

Example:

`tenho consultas amanhã?`

Current behavior:

- Platform bot can enter management mode.
- It injects agenda, finance, team, rooms, service types, and pending requests into the prompt.
- There are deterministic shortcuts for some admin financial summary questions.

Assessment:

- Status: promising
- This is one of the most differentiated parts of the bot.
- Production sample shows at least one real test of this path.

### 10. Staff or clinic owner writes to the wrong number

Example:

- professional writes to the clinic patient number instead of the platform number

Current behavior:

- `whatsapp-webhook` identifies staff actor type.
- It redirects them to the platform number instead of trying to serve them in the patient bot.

Assessment:

- Status: good
- This avoids mixing patient and staff workflows in the same inbox.

## Main Findings

### 1. The per-clinic patient bot is not really validated yet

Evidence:

- `whatsapp_sessions`: 0
- `whatsapp_messages`: 0
- `whatsapp_enabled`: 0 clinics

Impact:

- We cannot say yet whether the patient-facing AI actually guides well.
- We are still mostly auditing architecture and prompts, not real usage.

### 2. The webhook architecture is synchronous and can create perceived slowness

Current behavior:

- `whatsapp-webhook` waits for DB work, LLM response, action execution, and send calls before returning `200`.
- `whatsapp-platform-agent` also performs LLM + side effects inline before finishing.

Impact:

- Median platform reply looks good in sample.
- p90 near 10s is already noticeable.
- Under provider latency spikes, users may feel the bot is hanging.
- Meta webhook retry behavior can become messy when ack is delayed.

### 3. Duplicate protection in platform onboarding is too prompt-dependent

Current behavior:

- Prompt says: search clinics first, then create.
- Backend does not enforce that rule.
- `create_clinic_now` can still insert directly.

Impact:

- A model slip can create duplicate clinics.
- This is a backend trust problem, not only a prompt problem.

### 4. `create_clinic_now` and `join_clinic` can succeed partially

Current behavior:

- Clinic may be created before invite is fully secured.
- Join flow may return success even if invite/auth linking did not fully complete.
- There is no full rollback path on all failure branches.

Impact:

- Risk of orphan clinic row.
- Risk of user hearing “done” while access was not fully provisioned.

### 5. Public marketing copy and actual WhatsApp flow are slightly misaligned

Current promise on landing:

- “Sem formulário, sem senha”
- “assistente pergunta nome da clínica, especialidade e cria sua conta em segundos”
- “envia o link de acesso direto”

Current real flow:

- asks clinic name + email
- does not explicitly ask specialty in onboarding
- usually sends access via email invite / password setup, not immediate direct access

Impact:

- Not catastrophic, but it creates expectation drift.

### 6. There are almost no automated tests for the WhatsApp onboarding stack

Evidence:

- Only `public-booking` has a function test file in `supabase/functions`.
- No dedicated tests found for:
  - `whatsapp-webhook`
  - `whatsapp-platform-agent`
  - `whatsapp-ai-agent`

Impact:

- The highest-conversion conversational flow currently depends on manual checking.

## What Looks Good Today

- The CTA path is consistent across landing and signup.
- Deterministic shortcuts exist for key low-friction intents:
  - price
  - dashboard link
  - create clinic
  - join code
- Interactive button replies reduce friction.
- Platform bot has a useful staff/owner management mode, not only onboarding.
- Typing indicator exists.

## What Is Weak Today

- No meaningful production validation for the clinic patient bot.
- Weak server-side enforcement around duplicate clinic prevention.
- Partial-success risk in onboarding side effects.
- Real p90 latency already high enough to feel slow in WhatsApp.
- Marketing promise is ahead of actual onboarding behavior.
- Missing automated tests for the most important conversational flows.

## Recommended Next Steps

### Priority 1 — Reliability

1. Add server-side guard before `create_clinic_now` to re-check similar clinics and block obvious duplicates.
2. Make clinic creation / join flow transactional or add compensating rollback for invite/link failures.
3. Add structured logging for each action path: received -> model -> action -> side effect -> sent.

### Priority 2 — UX / Conversion

4. Align landing promise with the real onboarding flow, or improve the flow to match the promise.
5. Add a deterministic first-response path for generic first-touch greetings on the platform number.
6. Add explicit “what happens next” messaging after clinic creation and join success.

### Priority 3 — Validation

7. Build a 10-scenario automated test harness for `whatsapp-platform-agent`.
8. Build a simulated end-to-end harness for `whatsapp-webhook` + `whatsapp-ai-agent`.
9. Run manual scripted conversation tests for the 10 entry cases listed above.
10. Only after that start claiming the clinic bot flow is production-ready.

## Bottom Line

Today, the platform onboarding bot is promising and already has a decent low-friction skeleton.
But the patient-facing clinic bot is still effectively unproven in production, and the onboarding flow
still has backend integrity risks that should be fixed before we optimize copy or try to scale ad traffic.
