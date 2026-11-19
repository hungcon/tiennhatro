#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${ADMIN_PASSWORD:-}" ]]; then
  exec npx --yes wrangler@4.165.0 deploy "$@"
fi

secret_file="$(mktemp "${TMPDIR:-/tmp}/tiennhatro-worker-secrets.XXXXXXXXXX")"
trap 'rm -f -- "$secret_file"' EXIT

node -e 'process.stdout.write(JSON.stringify({ ADMIN_PASSWORD: process.env.ADMIN_PASSWORD }));' > "$secret_file"
unset ADMIN_PASSWORD
npx --yes wrangler@4.165.0 deploy --secrets-file "$secret_file" "$@"
