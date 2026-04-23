# Copilot Instructions — Consultin

> **Role:** You are the coding assistant for **consultin** — a SaaS platform for small Brazilian clinics.
> Read **AGENT.md** at the project root for full architecture, rules, and project context before making changes.

---

## Idioma

- Código-fonte: **inglês** (variáveis, funções, classes, comentários técnicos).
- Interface e textos ao usuário: **Português do Brasil (pt-BR)**.

## Domínio e Terminologia

| Inglês (código)                | Português (UI)         |
| ------------------------------ | ---------------------- |
| `clinic` / `clinics`           | Clínica / Clínicas     |
| `patient` / `patients`         | Paciente / Pacientes   |
| `appointment` / `appointments` | Consulta / Agendamento |
| `schedule`                     | Agenda                 |
| `professional` / `doctor`      | Profissional / Médico  |
| `invoice` / `payment`          | Fatura / Pagamento     |
| `report`                       | Relatório              |
| `notification`                 | Notificação            |
| `user`                         | Usuário                |
| `role`                         | Perfil de acesso       |

## Regras Críticas de Código

- **TypeScript** — zero errors é o bar. Rodar `cd app && npx tsc --noEmit` após mudanças não-triviais.
- **Dinheiro** — sempre em centavos (integer) no DB; nunca float. Formatar como `R$ 0,00` na UI.
- **Datas** — armazenar em UTC; exibir no fuso `America/Sao_Paulo`. Usar utilitários de `src/utils/date.ts`.
- **Validação** — CPF, CNPJ, telefone sempre via `src/utils/validators.ts`.
- **Auth** — usar `useAuthContext()` do `AuthContext.tsx`; nunca acessar `supabase.auth` direto em componentes.
- **Multi-tenancy** — RLS do Supabase isola os dados por clínica. Nunca filtrar manualmente por `clinic_id` no cliente.
- **LGPD** — nunca logar CPF, nomes ou dados de saúde em plaintext.
- **Initial setup** — clínicas novas entram direto na agenda. Use `clinic.onboardingCompleted` apenas para guias leves em `/configuracoes`, nunca para bloquear o uso do app.
- **Field visibility** — nunca renderizar campo de paciente/profissional sem checar `fieldConfig[key] !== false`.
- **Commits** — Conventional Commits (`feat:`, `fix:`, `chore:`...), mensagens em inglês.

## Arquitetura

- Camadas separadas: UI (pages/components) → lógica (hooks com React Query) → dados (Supabase via hooks).
- Hooks em `src/hooks/` encapsulam toda lógica de acesso a dados — nunca chamar `supabase` direto em componentes.
- Testes para lógica crítica (agendamentos, conflitos de agenda, financeiro).

---

## Credenciais e Secrets — onde ficam

> **NUNCA** escrever senhas ou chaves diretamente no código.
> Detalhes completos em **`pedrin/AGENT.md`** (repositório irmão no mesmo workspace).

| O que                                             | Onde encontrar                                                 |
| ------------------------------------------------- | -------------------------------------------------------------- |
| `SUPABASE_DB_PASSWORD` e chaves Supabase          | `/Users/pedromartinez/Dev/pmatz/pedrin/.env` ← fonte canônica        |
| Chaves Supabase (anon, service role, project ref) | `/Users/pedromartinez/Dev/pmatz/pedrin/secrets/supabase/config.json` |
| Variáveis do app (front-end)                      | `consultin/app/.env`                                                  |
| Apple / ASC keys                                  | `/Users/pedromartinez/Dev/pmatz/pedrin/secrets/apple/`               |

**Supabase project ref:** `bpipnidvqygjjfhwfhtv`

### Script de migrations

```bash
bash /Users/pedromartinez/Dev/pmatz/consultin/scripts/apply-migrations.sh
```

- Busca senha automaticamente em `pedrin/.env`.
- Migrations em `supabase/migrations/` — numeradas `0001_`, `0002_`, ..., idempotentes.
- São idempotentes (`IF NOT EXISTS`): rodar o script completo toda vez é seguro.
