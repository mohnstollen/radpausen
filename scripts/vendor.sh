#!/usr/bin/env bash
# Erzeugt vendor/ neu: Leaflet (Karte) und opening_hours.js (Öffnungszeiten auswerten) als lokale
# Dateien, damit die App ohne Netz startet. opening_hours.js braucht suncalc und i18next und wird
# deshalb mit esbuild zu einer Datei gebündelt (globale Funktion `opening_hours`).
set -euo pipefail
cd "$(dirname "$0")/.."
LEAFLET=1.9.4 OH=3.8.0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
(cd "$tmp" && npm init -y >/dev/null && npm install --silent --no-audit --no-fund "leaflet@$LEAFLET" "opening_hours@$OH" esbuild@0.25.10)
rm -rf vendor && mkdir -p vendor/leaflet
cp "$tmp/node_modules/leaflet/dist/leaflet.js" "$tmp/node_modules/leaflet/dist/leaflet.css" vendor/leaflet/
cp -r "$tmp/node_modules/leaflet/dist/images" vendor/leaflet/
cp "$tmp/node_modules/leaflet/LICENSE" vendor/leaflet/LICENSE
echo "module.exports=require('opening_hours');" > "$tmp/entry.js"
"$tmp/node_modules/.bin/esbuild" "$tmp/entry.js" --bundle --minify --format=iife --global-name=opening_hours \
  --legal-comments=eof --outfile=vendor/opening_hours.min.js --log-level=warning
cp -r "$tmp/node_modules/opening_hours/LICENSES" vendor/opening_hours-LICENSES
printf 'leaflet %s\nopening_hours %s (LGPL-3.0, gebündelt mit suncalc und i18next)\n' "$LEAFLET" "$OH" > vendor/VERSIONS
ls -l vendor vendor/leaflet
