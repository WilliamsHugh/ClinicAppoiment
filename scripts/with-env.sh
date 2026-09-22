#!/usr/bin/env sh
set -eu

if [ "$#" -eq 0 ]; then
  echo "Usage: scripts/with-env.sh <command> [args...]" >&2
  exit 2
fi

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/.." && pwd)
env_file=${CLINIC_ENV_FILE:-$repo_root/.env}

# Node parses dotenv syntax without evaluating the file as shell code. The
# spawned process receives those values and keeps values already exported by
# the caller, matching Node's --env-file behavior.
exec node --env-file-if-exists="$env_file" -e '
  const { spawnSync } = require("node:child_process");
  const [command, ...args] = process.argv.slice(1);
  const result = spawnSync(command, args, { env: process.env, stdio: "inherit" });
  if (result.error) {
    console.error(result.error.message);
    process.exit(127);
  }
  if (result.signal) {
    console.error(`Command terminated by ${result.signal}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
' "$@"
