#!/bin/zsh
# ─────────────────────────────────────────────────────────────────────────────
# push-email-templates.sh
#
# Sobe os templates de e-mail do Consultin para o Supabase via Management API.
# Executa localmente — não faz parte do CI/CD (os templates mudam raramente).
#
# Pré-requisito: SUPABASE_PAT em pedrin/.env (já existe — mesmo token usado por deploy-features.sh)
#
# Uso:
#   cd consultin && bash scripts/push-email-templates.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

PROJECT_REF="nxztzehgnkdmluogxehi"
TEMPLATES_DIR="$(cd "$(dirname "$0")/../supabase/templates" && pwd)"
API="https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth"

# ── Load credentials from pedrin/.env (source of truth, never committed) ──────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PEDRIN_ENV="$SCRIPT_DIR/../../pedrin/.env"
if [[ ! -f "$PEDRIN_ENV" ]]; then
  echo "❌ pedrin/.env não encontrado em $PEDRIN_ENV"
  exit 1
fi
set -a; source "$PEDRIN_ENV"; set +a

TOKEN="${SUPABASE_PAT:?SUPABASE_PAT não definido em pedrin/.env}"

# ── Read templates ─────────────────────────────────────────────────────────────
invite_html=$(cat "${TEMPLATES_DIR}/invite.html")
recovery_html=$(cat "${TEMPLATES_DIR}/recovery.html")
email_change_html=$(cat "${TEMPLATES_DIR}/email_change.html")

echo "📧 Subindo templates de e-mail para o projeto ${PROJECT_REF}..."

# ── Build JSON payload ─────────────────────────────────────────────────────────
# python3 is used to safely JSON-encode the HTML strings (avoids escaping issues)
payload=$(python3 - <<PYEOF
import json, sys

invite       = open("${TEMPLATES_DIR}/invite.html").read()
recovery     = open("${TEMPLATES_DIR}/recovery.html").read()
email_change = open("${TEMPLATES_DIR}/email_change.html").read()

data = {
    # Invite user
    "mailer_invite_subject":      "Você foi convidado para o Consultin",
    "mailer_invite_content":      invite,

    # Password recovery
    "mailer_recovery_subject":    "Redefinição de senha — Consultin",
    "mailer_recovery_content":    recovery,

    # Email change confirmation
    "mailer_email_change_subject": "Confirme seu novo e-mail — Consultin",
    "mailer_email_change_content": email_change,
}

print(json.dumps(data))
PYEOF
)

# ── Patch auth config ──────────────────────────────────────────────────────────
http_code=$(curl -s -o /tmp/push_email_templates_resp.json -w "%{http_code}" \
  -X PATCH "${API}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${payload}"
)
body=$(cat /tmp/push_email_templates_resp.json)

if [[ "$http_code" == "200" ]]; then
  echo "✅ Templates publicados com sucesso!"
elif [[ "$http_code" == "201" ]]; then
  echo "✅ Templates publicados com sucesso!"
else
  echo "❌ Erro ao publicar templates (HTTP ${http_code}):"
  echo "$body" | python3 -m json.tool 2>/dev/null || echo "$body"
  exit 1
fi

echo ""
echo "Templates atualizados:"
echo "  • invite.html         → Convite de staff/profissional"
echo "  • recovery.html       → Redefinição de senha"
echo "  • email_change.html   → Confirmação de novo e-mail"
