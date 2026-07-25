#!/usr/bin/env bash
# deploy-mobile.sh — Build + submit consultin iOS para TestFlight via EAS
#
# Uso:
#   bash consultin/scripts/deploy-mobile.sh
#   bash consultin/scripts/deploy-mobile.sh --profile production
#   bash consultin/scripts/deploy-mobile.sh --skip-build   # só submete o último build

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$SCRIPT_DIR/../mobile"
PEDRIN_DIR="$SCRIPT_DIR/../../pedrin"
PEDRIN_ENV="$PEDRIN_DIR/.env"

# ── Parse args ──────────────────────────────────────────────────────────────
PROFILE="preview"
SKIP_BUILD=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="$2"; shift 2 ;;
    --skip-build) SKIP_BUILD=true; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# ── Load pedrin credentials ─────────────────────────────────────────────────
if [[ ! -f "$PEDRIN_ENV" ]]; then
  echo "ERROR: pedrin/.env not found at $PEDRIN_ENV" >&2
  exit 1
fi
set -a
# shellcheck source=/dev/null
source "$PEDRIN_ENV"
set +a

# ── Validate required vars ───────────────────────────────────────────────────
: "${APPLE_TEAM_ID:?APPLE_TEAM_ID missing in pedrin/.env}"
: "${APPLE_ISSUER_ID:?APPLE_ISSUER_ID missing in pedrin/.env}"
: "${APPLE_KEY_ID:?APPLE_KEY_ID missing in pedrin/.env}"

ASC_KEY_PATH="$PEDRIN_DIR/secrets/apple/AuthKey_${APPLE_KEY_ID}.p8"
if [[ ! -f "$ASC_KEY_PATH" ]]; then
  echo "ERROR: ASC private key not found: $ASC_KEY_PATH" >&2
  exit 1
fi

# EAS reads these env vars for ASC API auth
export EXPO_ASC_API_KEY_ID="$APPLE_KEY_ID"
export EXPO_ASC_API_KEY_ISSUER_ID="$APPLE_ISSUER_ID"
export EXPO_ASC_API_KEY_PATH="$ASC_KEY_PATH"
export EXPO_APPLE_TEAM_ID="$APPLE_TEAM_ID"

# GitHub Packages token for @pvsmartinez/shared
export GITHUB_TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
if [[ -z "$GITHUB_TOKEN" ]]; then
  echo "WARNING: GITHUB_TOKEN not set — @pvsmartinez/shared may fail to install" >&2
fi

cd "$MOBILE_DIR"

# ── Install deps ─────────────────────────────────────────────────────────────
if [[ ! -d node_modules ]]; then
  echo "==> Installing dependencies..."
  npm install
fi

# ── Ensure EAS CLI available ─────────────────────────────────────────────────
if ! command -v eas &>/dev/null && ! npx eas-cli --version &>/dev/null 2>&1; then
  echo "==> Installing EAS CLI..."
  npm install -g eas-cli
fi
EAS="npx eas-cli"

# ── Create .env if missing ────────────────────────────────────────────────────
if [[ ! -f .env ]]; then
  echo "==> Creating .env from pedrin credentials..."
  ANON_KEY="${SUPABASE_ANON_KEY:-sb_publishable_hXdLHGFae86XehzBS49T9A_XejOUKfA}"
  cat > .env << EOF
EXPO_PUBLIC_SUPABASE_URL=https://nxztzehgnkdmluogxehi.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}
EOF
  echo "    .env created"
fi

# ── Check EAS project link ─────────────────────────────────────────────────
if ! grep -q '"projectId"' app.json 2>/dev/null; then
  echo ""
  echo "⚠️  EAS project not linked. Run first:"
  echo "     cd $MOBILE_DIR && $EAS init"
  echo ""
  echo "Continuando mesmo assim (o EAS pode pedir o projectId durante o build)..."
fi

# ── Build ─────────────────────────────────────────────────────────────────────
if [[ "$SKIP_BUILD" == false ]]; then
  echo ""
  echo "==> Building iOS (profile: $PROFILE) on EAS Cloud..."
  $EAS build \
    --platform ios \
    --profile "$PROFILE" \
    --non-interactive
  echo "    Build enviado para EAS Cloud!"
fi

# ── Submit to TestFlight ───────────────────────────────────────────────────────
echo ""
echo "==> Submetendo para TestFlight..."
$EAS submit \
  --platform ios \
  --latest \
  --non-interactive \
  --apple-team-id "$APPLE_TEAM_ID" \
  --asc-key-path "$ASC_KEY_PATH" \
  --asc-issuer-id "$APPLE_ISSUER_ID" \
  --asc-key-id "$APPLE_KEY_ID"

echo ""
echo "✓ consultin mobile submetido para TestFlight!"
echo "  Acompanhe: https://appstoreconnect.apple.com/apps"
