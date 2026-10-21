#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
output_dir="${1:-$repo_dir/dist}"
archive="$output_dir/ytrawl.zip"

command -v zip >/dev/null 2>&1 || {
    printf 'The zip command is required to package Ytrawl.\n' >&2
    exit 1
}

cd "$repo_dir"
glib-compile-schemas --strict schemas
mkdir -p "$output_dir"
rm -f "$archive"
zip -qr "$archive" extension.js prefs.js metadata.json stylesheet.css lib schemas LICENSE
printf 'Created %s\n' "$archive"
