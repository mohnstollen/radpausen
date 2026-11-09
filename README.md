# Radpausen

GPX-Strecke laden und sehen, was am Weg liegt: Bäcker, Supermärkte, Fast Food, Trinkwasser,
Friedhöfe (meist mit Wasserhahn), Schutzhütten, Picknickplätze, Bänke, Fahrradläden und
Reparaturstationen – mit Kilometer, Abstand zur Strecke und ob bei deiner Ankunft geöffnet ist.

Eine Web-App (PWA) ohne Build-Schritt: `index.html` mit Leaflet, offline-fähig, auf Android
installierbar. Die Ortsdaten kommen aus OpenStreetMap und werden monatlich von GitHub Actions
aufbereitet; es gibt keine Abfragen an Overpass oder kostenpflichtige Dienste.

## Benutzung

- **GPX öffnen:** über 📂, per Ziehen und Ablegen (Desktop) oder auf Android nach der Installation
  („Zum Startbildschirm hinzufügen“) über *Teilen → Radpausen* aus Komoot, bikerouter, Dateien …
- **Liste:** Orte nach Kilometer, „100 m links · an 10:20 · offen bis 18:00“. Antippen zeigt den Ort
  auf der Karte, mit Link zur Navigation.
- **Chips oben:** Kategorien ein-/ausblenden (Bänke sind anfangs aus – es gibt sehr viele).
- **Warnungen:** lange Abschnitte ohne Essen oder ohne Wasser (Schwellen in den Einstellungen).
- **⚙️ Einstellungen:** Kategorien, Abstand zur Strecke (50–1000 m), Ø-Geschwindigkeit und Abfahrt
  (für die Ankunftszeiten), gespeicherte Touren, Export.
- **📍 Unterwegs:** verfolgt den eigenen Standort auf der Strecke; Ankunftszeiten rechnen dann ab jetzt,
  vorbeigefahrene Orte werden ausgegraut, oben steht der Abstand zum nächsten Ort je Kategorie.
- **Export:** Strecke plus angezeigte Orte als GPX-Wegpunkte, z. B. für den Radcomputer.

## Offline

- Die App selbst cacht der Service Worker.
- Ortsdaten liegen als Kacheln von 0,1° × 0,1° (ca. 11 × 7 km) unter `data/t/`. Beim Öffnen einer
  Strecke lädt die App nur die Kacheln entlang der Strecke und speichert sie; danach geht es ohne Netz.
- Kartenkacheln, die man sich angesehen hat, bleiben im Cache (bis 3.000 Stück). Ein gezieltes
  Vorladen der Karte entlang der Strecke gibt es noch nicht – die Kachelserver von OpenStreetMap
  erlauben das nicht, dafür braucht es einen anderen Kartenanbieter.

## Ortsdaten

`.github/workflows/pages.yml` lädt den Geofabrik-Auszug (Standard: Deutschland), filtert ihn mit
`osmium tags-filter` und baut mit `scripts/build_data.py` die Kacheln. Welche OSM-Tags in welche
Kategorie fallen, steht in `classify()` in diesem Skript. Jede Kachel nennt ihr Bundesland, damit
Feiertage in Öffnungszeiten (`PH off`) richtig ausgewertet werden.

Weitere Länder: in der Workflow-Variable `EXTRACTS` ergänzen, z. B. `europe/germany europe/austria`.

## Einrichten (einmalig)

1. *Settings → Pages → Build and deployment → Source:* **GitHub Actions**.
2. Workflow „Tests, Ortsdaten und Seite“ laufen lassen (läuft auch bei jedem Push auf den
   Standard-Branch und monatlich). Danach ist die App unter `https://<user>.github.io/radpausen/` erreichbar.

## Entwicklung

```bash
npm ci
npx playwright test
```

Die Tests laufen gegen `tests/fixtures/data`, gebaut aus `tests/fixtures/sample.osm`:

```bash
pip install -r scripts/requirements.txt
python3 scripts/build_data.py tests/fixtures/sample.osm tests/fixtures/data --version 2026-11-01
```

`scripts/vendor.sh` erzeugt `vendor/` neu (Leaflet, opening_hours.js), `scripts/make_icons.py` die Symbole.

## Daten und Lizenzen

- Orte und Karte: © [OpenStreetMap-Mitwirkende](https://www.openstreetmap.org/copyright), ODbL
- [Leaflet](https://leafletjs.com) (BSD-2-Clause), [opening_hours.js](https://github.com/opening-hours/opening_hours.js)
  (LGPL-3.0, gebündelt mit suncalc und i18next) – Lizenztexte in `vendor/`
