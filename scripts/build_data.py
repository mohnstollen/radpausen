#!/usr/bin/env python3
"""Ortsdaten für Radpausen: OSM-Auszug → kleine Kacheldateien.

Eingabe ist ein (am besten mit `osmium tags-filter` vorgefilterter) OSM-Auszug,
siehe .github/workflows/pages.yml. Ausgabe:

  OUT/meta.json        Datenstand, Kachelgröße, Liste der Kacheln, Anzahl je Kategorie
  OUT/t/<y>_<x>.json   Orte einer Kachel von 0,1° × 0,1° (ca. 11 × 7 km), Schlüssel
                       floor(lat·10)_floor(lon·10), z. B. 495_109 für Erlangen

Je Ort ein Array [Kategorie, lat, lon, Name, Öffnungszeiten, Zusatz] — hintere leere
Felder entfallen. Jede Kachel nennt außerdem Land und Bundesland ihres Mittelpunkts
(`cc`, `st`), damit die App Feiertage („PH off“) in den Öffnungszeiten auswerten kann.

Aufruf:  python3 build_data.py eingabe.osm.pbf ausgabeordner [--version 2026-11-01]
"""
import argparse
import datetime
import json
import math
import os
import shutil
import sys
from collections import Counter, defaultdict

import osmium

CELL = 0.1

# Reihenfolge = Vorrang, falls ein Objekt mehrere Kategorien erfüllt
CATS = ['bk', 'sm', 'ff', 'bs', 'rp', 'wa', 'fr', 'sh', 'pi', 'be']

# Bei diesen Kategorien sind Öffnungszeiten interessant
WITH_HOURS = {'bk', 'sm', 'ff', 'bs', 'wa', 'fr'}

SHELTER_NAMES = {
    'picnic_shelter': 'Picknickhütte', 'weather_shelter': 'Wetterschutz', 'basic_hut': 'Hütte',
    'lean_to': 'Unterstand', 'pavilion': 'Pavillon', 'rock_shelter': 'Felsdach',
}
# Keine Pause für Radfahrer: Bushaltestellen, Viehunterstände, Mülltonnenhäuschen …
SHELTER_SKIP = {'public_transport', 'field_shelter', 'sun_shelter', 'smoking_shelter', 'changing_rooms'}
WATER_SOURCES = {('amenity', 'fountain'), ('natural', 'spring'), ('man_made', 'water_well'), ('amenity', 'toilets')}


def classify(t):
    """Kategorie und Zusatztext zu den Tags eines Objekts, sonst (None, None)."""
    g = t.get
    shop, amenity = g('shop'), g('amenity')
    if shop in ('bakery', 'pastry'):
        return 'bk', None
    if shop in ('supermarket', 'convenience'):
        return 'sm', ('Dorfladen' if shop == 'convenience' else None)
    if amenity == 'fast_food':
        return 'ff', g('cuisine', '').replace(';', ', ').replace('_', ' ') or None
    if shop == 'bicycle':
        return 'bs', ('Reparatur' if g('service:bicycle:repair') == 'yes' else None)
    if amenity == 'bicycle_repair_station':
        tools = [x for x, k in (('Pumpe', 'service:bicycle:pump'), ('Werkzeug', 'service:bicycle:tools')) if g(k) == 'yes']
        return 'rp', ', '.join(tools) or None
    if g('drinking_water') != 'no':
        if amenity in ('drinking_water', 'water_point') or g('man_made') == 'water_tap':
            return 'wa', None
        if g('drinking_water') in ('yes', 'treated') and any(g(k) == v for k, v in WATER_SOURCES):
            return 'wa', {'fountain': 'Brunnen', 'toilets': 'an Toiletten'}.get(amenity) or \
                ('Quelle' if g('natural') == 'spring' else 'Brunnen')
    if g('landuse') == 'cemetery' or amenity == 'grave_yard':
        # Auf Friedhöfen gibt es fast immer einen Wasserhahn (meist Trinkwasser, nicht immer gekennzeichnet)
        dw = g('drinking_water')
        return 'fr', ('Trinkwasser' if dw == 'yes' else 'kein Trinkwasser' if dw == 'no' else None)
    if amenity == 'shelter' and g('shelter_type') not in SHELTER_SKIP:
        return 'sh', SHELTER_NAMES.get(g('shelter_type'))
    if g('tourism') == 'wilderness_hut':
        return 'sh', 'Hütte'
    if g('leisure') == 'picnic_table' or g('tourism') == 'picnic_site':
        return 'pi', ('Rastplatz' if g('tourism') == 'picnic_site' else None)
    if amenity == 'bench':
        return 'be', ('mit Lehne' if g('backrest') == 'yes' else None)
    return None, None


def tile_key(lat, lon):
    return f'{math.floor(lat / CELL + 1e-9)}_{math.floor(lon / CELL + 1e-9)}'


def ring_centroid(ring):
    """Flächenschwerpunkt eines Rings [(lon, lat), …] (flach gerechnet, für Friedhöfe genau genug)."""
    a = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
        f = x0 * y1 - x1 * y0
        a += f
        cx += (x0 + x1) * f
        cy += (y0 + y1) * f
    if abs(a) < 1e-15:
        return sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)
    return cx / (3 * a), cy / (3 * a)


def point_in_ring(x, y, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


class Region:
    """Bundesland (oder Land) aus einer Grenzrelation mit ISO3166-2-Code."""

    MAX_POINTS = 2000  # je Ring; für die Zuordnung von Kacheln reicht eine grobe Grenze

    def __init__(self, name, cc, rings):
        rings = [(r[::max(1, len(r) // self.MAX_POINTS)], outer) for r, outer in rings]
        self.name, self.cc, self.rings = name, cc, rings
        xs = [p[0] for r, _ in rings for p in r]
        ys = [p[1] for r, _ in rings for p in r]
        self.bbox = (min(xs), min(ys), max(xs), max(ys))

    def contains(self, x, y):
        b = self.bbox
        if not (b[0] <= x <= b[2] and b[1] <= y <= b[3]):
            return False
        inside = False
        for ring, outer in self.rings:
            if point_in_ring(x, y, ring):
                inside = outer  # innerer Ring (Loch) hebt den äußeren wieder auf
        return inside


def text(t, k):
    v = t.get(k)
    return v.strip() if v else ''


def collect(path):
    pois = {}      # (Typ, id) → Eintrag; Flächen aus Wegen und Relationen nur einmal
    regions = []
    fp = osmium.FileProcessor(path).with_locations().with_areas()
    for o in fp:
        if o.is_node():
            if not o.location.valid():
                continue
            t = dict(o.tags)
            if not t:
                continue
            cat, extra = classify(t)
            if cat:
                pois[('n', o.id)] = (cat, o.location.lat, o.location.lon, t, extra)
        elif o.is_area():
            t = dict(o.tags)
            iso = t.get('ISO3166-2', '')
            if t.get('boundary') == 'administrative' and t.get('admin_level') == '4' and '-' in iso:
                rings = []
                for outer in o.outer_rings():
                    rings.append(([(n.lon, n.lat) for n in outer if n.location.valid()], True))
                    for inner in o.inner_rings(outer):
                        rings.append(([(n.lon, n.lat) for n in inner if n.location.valid()], False))
                rings = [(r, f) for r, f in rings if len(r) >= 3]
                if rings:
                    regions.append(Region(t.get('name:de') or t.get('name', ''), iso.split('-')[0].lower(), rings))
                continue
            cat, extra = classify(t)
            if not cat:
                continue
            outers = [[(n.lon, n.lat) for n in r if n.location.valid()] for r in o.outer_rings()]
            outers = [r for r in outers if len(r) >= 3]
            if not outers:
                continue
            big = max(outers, key=len)
            lon, lat = ring_centroid(big)
            key = ('w' if o.from_way() else 'r', o.orig_id())
            pois[key] = (cat, lat, lon, t, extra)
    return pois, regions


def build(path, out, version):
    pois, regions = collect(path)
    tiles = defaultdict(list)
    counts = Counter()
    for cat, lat, lon, t, extra in pois.values():
        name = text(t, 'name') or text(t, 'brand')
        hours = text(t, 'opening_hours') if cat in WITH_HOURS else ''
        row = [cat, round(lat, 5), round(lon, 5), name, hours, extra or '']
        while row[-1] == '':
            row.pop()
        tiles[tile_key(lat, lon)].append(row)
        counts[cat] += 1

    tmp = out + '.tmp'
    shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(os.path.join(tmp, 't'))
    for key, rows in tiles.items():
        rows.sort(key=lambda r: (CATS.index(r[0]), r[1], r[2]))
        y, x = (int(v) for v in key.split('_'))
        cx, cy = (x + 0.5) * CELL, (y + 0.5) * CELL
        reg = next((r for r in regions if r.contains(cx, cy)), None)
        if reg is None and regions:
            # Kachelmitte im Ausland oder knapp außerhalb: Bundesland des ersten Orts der Kachel
            reg = next((r for r in regions for row in rows if r.contains(row[2], row[1])), None)
        doc = {'v': version, 'p': rows}
        if reg:
            doc['cc'], doc['st'] = reg.cc, reg.name
        with open(os.path.join(tmp, 't', key + '.json'), 'w', encoding='utf-8') as f:
            json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
    meta = {'v': version, 'cell': CELL, 'tiles': sorted(tiles), 'counts': {c: counts[c] for c in CATS},
            'regions': sorted({r.name for r in regions}),
            'source': '© OpenStreetMap-Mitwirkende, ODbL'}
    with open(os.path.join(tmp, 'meta.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, separators=(',', ':'))
    shutil.rmtree(out, ignore_errors=True)
    os.rename(tmp, out)
    return meta


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('input')
    ap.add_argument('out')
    ap.add_argument('--version', default=datetime.date.today().isoformat())
    a = ap.parse_args()
    meta = build(a.input, a.out, a.version)
    total = sum(meta['counts'].values())
    print(f"{total} Orte in {len(meta['tiles'])} Kacheln, {len(meta['regions'])} Regionen: {meta['counts']}", file=sys.stderr)
    if not total:
        sys.exit('Keine Orte gefunden – Eingabe prüfen')


if __name__ == '__main__':
    main()
