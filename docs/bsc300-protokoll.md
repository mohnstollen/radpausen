# iGPSPORT BSC300: Strecke per Bluetooth senden

Grundlage für `bsc300.html`. Quellen: statische Analyse der iGPSPORT-App 8.06.28 (Android),
ein Bluetooth-Mitschnitt der App und ein erfolgreicher Versuch mit einem BSC300.
„Belegt“ heißt: im Mitschnitt gesehen oder am Gerät ausprobiert. Alles andere stammt nur aus dem
Code der App.

## Bluetooth-Kanäle

Vier serielle Kanäle nach dem Muster des Nordic UART Service, sie unterscheiden sich im letzten
Byte der UUID:

| Kanal | Dienst-UUID | Verwendung |
| --- | --- | --- |
| 1 | `6e400001-b5a3-f393-e0a9-e50e24dcca9e` | allgemeine Befehle (z. B. Gerätestatus) |
| 2 | `6e400001-b5a3-f393-e0a9-e50e24dcca8e` | Steuerkanal älterer Geräte |
| 3 | `6e400001-b5a3-f393-e0a9-e50e24dcca7e` | Aktivitäten abrufen |
| 4 | `6e400001-b5a3-f393-e0a9-e50e24dcca6e` | Strecken und Dateien |

Je Dienst: `6e400002-…` schreiben (ohne Antwort), `6e400003-…` Benachrichtigungen vom Gerät.
Das Gerät handelt MTU 247 aus; lange Nachrichten werden in Stücke zu 244 Bytes geteilt (belegt).

## Kopf (20 Bytes)

| Byte | Inhalt |
| --- | --- |
| 0 | `0x01` (Antworten auf Dateien: `0x02`) |
| 1 | Dienst |
| 2 | Unterdienst, sonst `0xFF` |
| 3 | `0xFF`, bei Dateiübertragung `0xAA` |
| 4 | Operation |
| 5 | Unteroperation, sonst `0xFF` |
| 6 | `0xFF` |
| 7–8 | Länge der Protobuf-Nachricht, Big Endian |
| 9 | CRC-8 über die Protobuf-Nachricht |
| 10 | `1` |
| 11–18 | `0xFF` |
| 19 | CRC-8 über Byte 0–18 |

CRC-8 Dallas/Maxim (Polynom `0x8C` gespiegelt, Startwert 0).
Dienste: Strecken = 7, Gerätestatus = 13, Dateien = 21. Operationen: SET 1, GET 2, ADD 3, DEL 4.

Beispiel, Gerätestatus abfragen auf Kanal 1 (belegt):
`010dffff01ffff0004be01ffffffffffffffffec` + Protobuf `080d1001`.

## Strecke senden (belegt)

Eine Nachricht auf Kanal 4:

```
[Kopf, 20 Bytes] [Länge der Protobuf-Nachricht, 4 Bytes Big Endian] [Protobuf] [Datei]
```

Der Kopf ist immer `0115ffaa03ffff00000001ffffffffffffffff57` (Dienst 21, Operation ADD, Länge 0).

Protobuf `general_file_operation`:

| Nr. | Feld | Wert |
| --- | --- | --- |
| 1 | service_type | 21 |
| 2 | operate_type | 3 (ADD) |
| 3 | file_type | 2 (Strecke) |
| 4 | file_size | Länge der Datei in Bytes |
| 5 | file_id | Zahl, kennzeichnet die Strecke |
| 6 | file_name | Name, höchstens 50 Bytes UTF-8 |
| 7 | file_extension | `cnx` |
| 10 | is_temp | 0 |
| 11 | extra_info | `{1: Distanz in cm, 2: Anstieg in cm, 3: 0}` |

Antwort auf Kanal 4: `0215ffff03ffff00…`, Byte 7 = 0 heißt angenommen.

Am BSC300 nötig waren (welches von beiden, ist nicht getrennt geprüft):
Benachrichtigungen auf allen vier Kanälen einschalten und etwa 12 ms Pause zwischen den Stücken.
Ohne beides kam keine Antwort. Eine Kopplung mit Konto ist nicht nötig.

## CNX-Datei (belegt)

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Route>
<Id>…</Id>
<Distance>12345.67</Distance>   <!-- Meter -->
<Ascent>236</Ascent>            <!-- Meter -->
<Descent>-236</Descent>
<Encode>2</Encode>
<Lang>0</Lang>
<TracksCount>3</TracksCount>
<Tracks>50.000000,10.000000,30000;1000,-200,25;-500,300,0;</Tracks>
<Navs />
<PointCount>0</PointCount>
<Points />
</Route>
```

`Tracks`: `Breite,Länge,Höhe` je Punkt, mit `;` abgeschlossen.

- Punkt 0: Grad mit sechs Nachkommastellen, Höhe in Zentimetern.
- Punkt 1: Differenz zu Punkt 0 in 10⁻⁷ Grad, Höhendifferenz in Zentimetern.
- Ab Punkt 2: zweite Differenz (`p[n] − 2·p[n−1] + p[n−2]`) in 10⁻⁷ Grad, Höhendifferenz in Zentimetern.

## Abbiegehinweise und Wegpunkte (nur aus dem Code, am Gerät nicht belegt)

Die App kennt für eine ältere Variante der Datei diese Einträge:

```xml
<Navs><Nav><Lat>…</Lat><Lng>…</Lng><Type>1</Type><Info>…</Info></Nav></Navs>
<Points><Point><Lat>…</Lat><Lng>…</Lng><Descr>Waypoint</Descr></Point></Points>
```

`Type`: 0 geradeaus, 1 links, 2 rechts, 5 Wenden links, 6 Wenden rechts.
`bsc300.html` schreibt Wegpunkte auf Wunsch als `<Point>` in die Datei. Ob der BSC300 sie anzeigt
und wie viele er verträgt, ist offen.
