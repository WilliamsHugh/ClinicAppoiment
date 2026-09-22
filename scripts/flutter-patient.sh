#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/.." && pwd)
app_dir="$repo_root/apps/patient-app"

if [ -n "${FLUTTER_BIN:-}" ]; then
  flutter_bin=$FLUTTER_BIN
elif command -v flutter >/dev/null 2>&1; then
  flutter_bin=$(command -v flutter)
elif [ -x "$repo_root/.tools/flutter/bin/flutter" ]; then
  flutter_bin="$repo_root/.tools/flutter/bin/flutter"
else
  echo "Flutter was not found. Set FLUTTER_BIN or install Flutter on PATH." >&2
  exit 127
fi

command_name=${1:-run}
if [ "$#" -gt 0 ]; then
  shift
fi

api_base_url=${PATIENT_APP_API_BASE_URL:-http://10.0.2.2:8080}

configure_java() {
  if [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/javac" ]; then
    return
  fi

  if command -v javac >/dev/null 2>&1; then
    javac_bin=$(command -v javac)
    JAVA_HOME=$(CDPATH= cd -- "$(dirname -- "$javac_bin")/.." && pwd)
    export JAVA_HOME
    return
  fi

  for candidate in \
    "$repo_root/.tools/jdk-17" \
    "${HOME:-}/.local/opt/temurin-17" \
    "${HOME:-}/.local/share/JetBrains/Toolbox/apps/android-studio/jbr"
  do
    if [ -n "$candidate" ] && [ -x "$candidate/bin/javac" ]; then
      JAVA_HOME=$candidate
      export JAVA_HOME
      return
    fi
  done

  echo "A JDK with javac is required for Flutter Android builds." >&2
  echo "Set JAVA_HOME in .env or install JDK 17." >&2
  exit 127
}

case "$command_name" in
  run)
    configure_java
    device_id=${FLUTTER_DEVICE_ID:-}
    if [ "${1:-}" = "--device" ] || [ "${1:-}" = "-d" ]; then
      if [ "$#" -lt 2 ]; then
        echo "Missing device ID after $1." >&2
        exit 2
      fi
      device_id=$2
      shift 2
    fi
    if [ -z "$device_id" ]; then
      echo "Select a concrete Flutter device ID with --device <id> or FLUTTER_DEVICE_ID." >&2
      echo "Available devices:" >&2
      "$flutter_bin" devices >&2
      exit 2
    fi
    cd "$app_dir"
    exec "$flutter_bin" run -d "$device_id" \
      "--dart-define=API_BASE_URL=$api_base_url" "$@"
    ;;
  build)
    configure_java
    cd "$app_dir"
    exec "$flutter_bin" build apk \
      "--dart-define=API_BASE_URL=$api_base_url" "$@"
    ;;
  analyze)
    cd "$app_dir"
    exec "$flutter_bin" analyze "$@"
    ;;
  test)
    cd "$app_dir"
    exec "$flutter_bin" test "$@"
    ;;
  devices)
    exec "$flutter_bin" devices "$@"
    ;;
  *)
    echo "Usage: scripts/flutter-patient.sh {run|build|analyze|test|devices} [options]" >&2
    exit 2
    ;;
esac
