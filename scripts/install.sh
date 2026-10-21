#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
extension_uuid="ytrawl@sakib.dev"
extension_dir="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$extension_uuid"

for path in extension.js prefs.js metadata.json stylesheet.css lib schemas LICENSE; do
    if [[ ! -e "$repo_dir/$path" ]]; then
        printf 'Required extension file is missing: %s\n' "$path" >&2
        exit 1
    fi
done

mkdir -p "$extension_dir"
cp "$repo_dir/extension.js" "$repo_dir/prefs.js" "$repo_dir/metadata.json" \
    "$repo_dir/stylesheet.css" "$repo_dir/LICENSE" "$extension_dir/"
mkdir -p "$extension_dir/lib" "$extension_dir/schemas"
cp -R "$repo_dir/lib/." "$extension_dir/lib/"
cp -R "$repo_dir/schemas/." "$extension_dir/schemas/"
glib-compile-schemas "$extension_dir/schemas"

printf 'Installed Ytrawl to %s\n' "$extension_dir"
printf 'Log out and back in, then enable it with:\n  gnome-extensions enable %s\n' "$extension_uuid"
