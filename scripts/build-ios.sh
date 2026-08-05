#!/usr/bin/env bash
set -euo pipefail

# CocoaPods installs its bin into the Homebrew Ruby gems dir which is not on
# the default PATH when running headless (e.g. from a background process).
GEMS_BIN="/opt/homebrew/lib/ruby/gems/4.0.0/bin"
[[ -d "$GEMS_BIN" ]] && export PATH="$GEMS_BIN:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$ROOT_DIR/app"
WORKSPACE_DIR="$(cd "$ROOT_DIR/.." && pwd)"
PEDRIN_ENV_FILE="$WORKSPACE_DIR/pedrin/.env"
IOS_PROJECT_DIR="$APP_DIR/ios/App"
WORKSPACE_PATH="$IOS_PROJECT_DIR/App.xcworkspace"
EXPORT_OPTIONS_PATH="$IOS_PROJECT_DIR/ExportOptions-AppStore.plist"
BUILD_ROOT="$APP_DIR/.build/ios"
ARCHIVES_DIR="$BUILD_ROOT/archives"
EXPORTS_DIR="$BUILD_ROOT/exports"
BUILD_NUMBER_FILE="$APP_DIR/ios/build-number.txt"
SCHEME="App"

MODE="release"
SKIP_SYNC=false
OPEN_XCODE=false
CLEAN=false
DEVELOPMENT_TEAM="${APPLE_DEVELOPMENT_TEAM:-}"
UPLOAD_TO_TESTFLIGHT=false
APPLE_API_KEY_ID="${APPLE_API_KEY_ID:-}"
APPLE_API_ISSUER_ID="${APPLE_API_ISSUER_ID:-}"
APPLE_API_PRIVATE_KEY_PATH="${APPLE_API_PRIVATE_KEY_PATH:-}"

read_env_value() {
  local env_file="$1"
  local key="$2"
  local line

  [[ -f "$env_file" ]] || return 0

  line="$(grep -E "^${key}=" "$env_file" | tail -n 1 || true)"
  [[ -n "$line" ]] || return 0

  printf '%s\n' "${line#*=}"
}

hydrate_vite_env() {
  local app_env="$APP_DIR/.env"

  if [[ -z "${VITE_SUPABASE_URL:-}" ]]; then
    VITE_SUPABASE_URL="$(read_env_value "$app_env" "VITE_SUPABASE_URL")"
    export VITE_SUPABASE_URL
  fi

  if [[ -z "${VITE_SUPABASE_ANON_KEY:-}" ]]; then
    VITE_SUPABASE_ANON_KEY="$(read_env_value "$app_env" "VITE_SUPABASE_ANON_KEY")"
    export VITE_SUPABASE_ANON_KEY
  fi
}

require_vite_env() {
  if [[ -z "${VITE_SUPABASE_URL:-}" || -z "${VITE_SUPABASE_ANON_KEY:-}" ]]; then
    echo "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY for Consultin web build" >&2
    echo "Provide them in consultin/app/.env(.local) or pedrin/.env before building iOS." >&2
    exit 1
  fi
}

hydrate_vite_env

PEDRIN_APPLE_TEAM_ID="$(read_env_value "$PEDRIN_ENV_FILE" "APPLE_TEAM_ID")"
PEDRIN_APPLE_KEY_ID="$(read_env_value "$PEDRIN_ENV_FILE" "APPLE_KEY_ID")"
PEDRIN_APPLE_ISSUER_ID="$(read_env_value "$PEDRIN_ENV_FILE" "APPLE_ISSUER_ID")"
PEDRIN_APPLE_PRIVATE_KEY_PATH="$(read_env_value "$PEDRIN_ENV_FILE" "APPLE_PRIVATE_KEY_PATH")"

DEVELOPMENT_TEAM="${APPLE_DEVELOPMENT_TEAM:-${APPLE_TEAM_ID:-${PEDRIN_APPLE_TEAM_ID:-$DEVELOPMENT_TEAM}}}"
APPLE_API_KEY_ID="${APPLE_API_KEY_ID:-${APPLE_KEY_ID:-${PEDRIN_APPLE_KEY_ID:-$APPLE_API_KEY_ID}}}"
APPLE_API_ISSUER_ID="${APPLE_API_ISSUER_ID:-${APPLE_ISSUER_ID:-${PEDRIN_APPLE_ISSUER_ID:-$APPLE_API_ISSUER_ID}}}"
APPLE_API_PRIVATE_KEY_PATH="${APPLE_API_PRIVATE_KEY_PATH:-${APPLE_PRIVATE_KEY_PATH:-${PEDRIN_APPLE_PRIVATE_KEY_PATH:-}}}"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/build-ios.sh
  ./scripts/build-ios.sh --simulator
  ./scripts/build-ios.sh --open
  ./scripts/build-ios.sh --upload
  ./scripts/build-ios.sh --skip-sync
  ./scripts/build-ios.sh --clean
  ./scripts/build-ios.sh --team TEAMID

Options:
  --simulator   Build the iOS simulator target without code signing.
  --open        Open the Xcode workspace after the build finishes.
  --upload      Upload the exported IPA to TestFlight with App Store Connect API credentials.
  --skip-sync   Skip `npm run native:sync` before building.
  --clean       Run `xcodebuild clean` first so the asset catalog (app icon) is
                recompiled from scratch instead of served from the build cache.
  --team ID     Override DEVELOPMENT_TEAM for archive/export builds.
  --help        Show this help text.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --simulator)
      MODE="simulator"
      shift
      ;;
    --open)
      OPEN_XCODE=true
      shift
      ;;
    --upload)
      UPLOAD_TO_TESTFLIGHT=true
      shift
      ;;
    --skip-sync)
      SKIP_SYNC=true
      shift
      ;;
    --clean)
      CLEAN=true
      shift
      ;;
    --team)
      [[ $# -lt 2 ]] && { echo "Missing value for --team" >&2; exit 1; }
      DEVELOPMENT_TEAM="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

clean_build() {
  local configuration="Release"
  [[ "$MODE" == "simulator" ]] && configuration="Debug"

  echo "• Cleaning Xcode build ($configuration) so the app icon is recompiled"
  xcodebuild \
    -workspace "$WORKSPACE_PATH" \
    -scheme "$SCHEME" \
    -configuration "$configuration" \
    clean
}

sync_web_shell() {
  require_vite_env

  if [[ "$SKIP_SYNC" == "true" ]]; then
    echo "• Skipping web sync"
    return
  fi

  echo "• Syncing web shell into Capacitor"
  (
    cd "$APP_DIR"
    npm run native:sync
  )
}

next_build_number() {
  local current next

  if [[ -f "$BUILD_NUMBER_FILE" ]]; then
    current="$(tr -d '[:space:]' < "$BUILD_NUMBER_FILE")"
  else
    current="1"
  fi

  [[ -z "$current" ]] && current="1"
  next=$((current + 1))
  printf '%s\n' "$next" > "$BUILD_NUMBER_FILE"
  printf '%s\n' "$next"
}

apply_build_number() {
  local build_number="$1"

  echo "• Setting iOS build number to $build_number"
  (
    cd "$IOS_PROJECT_DIR"
    xcrun agvtool new-version -all "$build_number" >/dev/null
  )
}

resolve_asc_key_file() {
  local key_file="${APPLE_API_PRIVATE_KEY_PATH:-$HOME/.private_keys/AuthKey_${APPLE_API_KEY_ID}.p8}"

  if [[ -n "$APPLE_API_PRIVATE_KEY_PATH" && "$key_file" != /* ]]; then
    if [[ -f "$WORKSPACE_DIR/pedrin/$key_file" ]]; then
      key_file="$WORKSPACE_DIR/pedrin/$key_file"
    elif [[ -f "$WORKSPACE_DIR/$key_file" ]]; then
      key_file="$WORKSPACE_DIR/$key_file"
    fi
  fi

  printf '%s\n' "$key_file"
}

patch_export_options_team() {
  [[ -n "$DEVELOPMENT_TEAM" ]] || return 0

  /usr/libexec/PlistBuddy -c "Set :teamID $DEVELOPMENT_TEAM" "$EXPORT_OPTIONS_PATH" 2>/dev/null || \
    /usr/libexec/PlistBuddy -c "Add :teamID string $DEVELOPMENT_TEAM" "$EXPORT_OPTIONS_PATH"
}

open_xcode_if_needed() {
  if [[ "$OPEN_XCODE" == "true" ]]; then
    echo "• Opening Xcode workspace"
    open "$WORKSPACE_PATH"
  fi
}

build_simulator() {
  echo "• Building Consultin for iOS simulator"
  xcodebuild \
    -workspace "$WORKSPACE_PATH" \
    -scheme "$SCHEME" \
    -configuration Debug \
    -sdk iphonesimulator \
    CODE_SIGNING_ALLOWED=NO \
    build
}

build_release() {
  local build_number archive_path export_path ipa_path asc_key_file
  local -a archive_cmd export_cmd auth_flags

  mkdir -p "$ARCHIVES_DIR" "$EXPORTS_DIR"

  build_number="$(next_build_number)"
  apply_build_number "$build_number"
  patch_export_options_team

  archive_path="$ARCHIVES_DIR/Consultin-$build_number.xcarchive"
  export_path="$EXPORTS_DIR/Consultin-$build_number"

  auth_flags=()
  if [[ -n "$APPLE_API_KEY_ID" && -n "$APPLE_API_ISSUER_ID" ]]; then
    asc_key_file="$(resolve_asc_key_file)"
    if [[ -f "$asc_key_file" ]]; then
      auth_flags=(
        -authenticationKeyPath "$asc_key_file"
        -authenticationKeyID "$APPLE_API_KEY_ID"
        -authenticationKeyIssuerID "$APPLE_API_ISSUER_ID"
      )
    fi
  fi

  archive_cmd=(
    xcodebuild
    -workspace "$WORKSPACE_PATH"
    -scheme "$SCHEME"
    -configuration Release
    -destination "generic/platform=iOS"
    -archivePath "$archive_path"
    -allowProvisioningUpdates
    "${auth_flags[@]}"
    archive
  )

  if [[ -n "$DEVELOPMENT_TEAM" ]]; then
    archive_cmd+=(DEVELOPMENT_TEAM="$DEVELOPMENT_TEAM")
  fi

  echo "• Archiving Consultin for iOS"
  "${archive_cmd[@]}"

  rm -rf "$export_path"
  export_cmd=(
    xcodebuild
    -exportArchive
    -archivePath "$archive_path"
    -exportPath "$export_path"
    -exportOptionsPlist "$EXPORT_OPTIONS_PATH"
    -allowProvisioningUpdates
    "${auth_flags[@]}"
  )

  if [[ -n "$DEVELOPMENT_TEAM" ]]; then
    export_cmd+=(DEVELOPMENT_TEAM="$DEVELOPMENT_TEAM")
  fi

  echo "• Exporting IPA"
  "${export_cmd[@]}"

  ipa_path="$(find "$export_path" -maxdepth 1 -name '*.ipa' -print -quit)"
  if [[ -z "$ipa_path" ]]; then
    echo "IPA export did not produce a .ipa file" >&2
    exit 1
  fi

  printf '%s\n' "$archive_path" > /tmp/.consultin_xcarchive
  printf '%s\n' "$ipa_path" > /tmp/.consultin_ipa

  echo ""
  echo "Archive: $archive_path"
  echo "IPA:     $ipa_path"
}

upload_to_testflight() {
  local ipa_path key_file

  ipa_path="$(cat /tmp/.consultin_ipa)"
  key_file="$(resolve_asc_key_file)"

  [[ -f "$ipa_path" ]] || {
    echo "Missing IPA for upload at $ipa_path" >&2
    exit 1
  }

  if [[ -z "$APPLE_API_KEY_ID" || -z "$APPLE_API_ISSUER_ID" ]]; then
    echo "Missing Apple API credentials for TestFlight upload" >&2
    echo "Set APPLE_API_KEY_ID and APPLE_API_ISSUER_ID in the environment or in consultin/.env.local" >&2
    exit 1
  fi

  [[ -f "$key_file" ]] || {
    echo "Missing App Store Connect key file at $key_file" >&2
    exit 1
  }

  echo "• Uploading IPA to TestFlight"
  xcrun altool \
    --upload-app \
    -f "$ipa_path" \
    -t ios \
    --apiKey "$APPLE_API_KEY_ID" \
    --apiIssuer "$APPLE_API_ISSUER_ID" \
    --verbose
}

require_command npm
require_command xcodebuild
require_command xcrun

[[ -d "$IOS_PROJECT_DIR" ]] || {
  echo "Missing iOS project at $IOS_PROJECT_DIR" >&2
  exit 1
}

[[ -d "$WORKSPACE_PATH" ]] || {
  echo "Missing Xcode workspace at $WORKSPACE_PATH" >&2
  exit 1
}

if [[ "$MODE" == "release" && ! -f "$EXPORT_OPTIONS_PATH" ]]; then
  echo "Missing export options plist at $EXPORT_OPTIONS_PATH" >&2
  exit 1
fi

if [[ "$MODE" == "release" && -z "$DEVELOPMENT_TEAM" ]]; then
  echo "Missing APPLE_DEVELOPMENT_TEAM for release builds" >&2
  exit 1
fi

echo ""
echo "╔════════════════════════════════════╗"
echo "║   Consultin  — iOS build          ║"
echo "╚════════════════════════════════════╝"
echo ""

if [[ "$CLEAN" == "true" ]]; then
  clean_build
fi

sync_web_shell

if [[ "$MODE" == "simulator" ]]; then
  build_simulator
else
  build_release
  if [[ "$UPLOAD_TO_TESTFLIGHT" == "true" ]]; then
    upload_to_testflight
  fi
fi

open_xcode_if_needed

echo ""
echo "✓ Consultin iOS flow finished"
