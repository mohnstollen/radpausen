# CLAUDE.md

Radpausen: PWA, die zu einer GPX-Radstrecke Orte aus OpenStreetMap anzeigt (Bäcker, Supermarkt,
Fast Food, Wasser, Friedhof, Schutzhütte, Picknick, Bank, Fahrradladen, Reparaturstation).
Schwester-App von mohnstollen/spritpreise, gleicher Stil: eine `index.html` ohne Build, deutsche
Oberfläche und Kommentare.

## Aufbau

- `index.html` – die ganze App (Leaflet-Karte, Liste, Einstellungen-Dialog). Kategorien in `CAT`,
  Kürzel identisch mit `scripts/build_data.py`.
- `sw.js` – App-Cache, Cache angesehener OSM-Kacheln, Web Share Target (`POST ./share`).
- `data/` – wird nur im Workflow erzeugt (nicht eingecheckt): `meta.json` + `t/<y>_<x>.json`,
  Kachel = floor(lat·10)_floor(lon·10). Zeile: `[kat, lat, lon, name, opening_hours, zusatz]`,
  hintere leere Felder fehlen; je Kachel `cc`/`st` (Land/Bundesland für Feiertage).
- `scripts/build_data.py` – pyosmium, OSM → Kacheln. Kategorie-Regeln in `classify()`.
  Bei Änderungen `tests/fixtures/data` neu bauen (siehe README), CI vergleicht per `diff -r`.
- `vendor/` – Leaflet und gebündeltes opening_hours.js (`scripts/vendor.sh`), offline nutzbar.

## Tests

`npx playwright test` (Playwright 1.63, Chromium), ohne Netz: Daten aus `tests/fixtures/data`
über `tests/server.js`, Kartenkacheln nachgebildet, Uhr fest (Montag 9.11.2026).
