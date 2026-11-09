#!/usr/bin/env python3
"""Zeichnet die App-Symbole (Fahrrad mit Brezel-Sprechblase) – Aufruf aus dem Repository-Wurzelordner."""
from PIL import Image, ImageDraw

GREEN, WHITE, GOLD = (31, 111, 74), (255, 255, 255), (240, 194, 123)


def draw(size, scale, rounded):
    s = 4  # Supersampling für glatte Kanten
    W = size * s
    im = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if rounded:
        d.rounded_rectangle((0, 0, W - 1, W - 1), radius=int(W * 0.22), fill=GREEN)
    else:
        d.rectangle((0, 0, W, W), fill=GREEN)
    u = W * scale / 10000  # Zeichenfläche 100 × 100, mittig, scale = Anteil in Prozent

    def P(x, y):
        o = (W - 100 * u) / 2
        return (o + x * u, o + y * u)

    lw = max(1, int(5.5 * u))
    r = 15
    for cx in (27, 73):  # Räder
        x, y = P(cx, 66)
        d.ellipse((x - r * u, y - r * u, x + r * u, y + r * u), outline=WHITE, width=lw)
    frame = [P(27, 66), P(43, 42), P(64, 42), P(50, 66), P(27, 66)]
    d.line(frame, fill=WHITE, width=lw, joint='curve')
    d.line([P(50, 66), P(41, 36)], fill=WHITE, width=lw)        # Sattelrohr
    d.line([P(36, 35), P(47, 35)], fill=WHITE, width=lw)        # Sattel
    d.line([P(73, 66), P(62, 34), P(70, 30)], fill=WHITE, width=lw, joint='curve')  # Gabel, Lenker
    # Pausen-Punkt: goldene Sprechblase oben rechts
    x, y = P(78, 20)
    d.ellipse((x - 11 * u, y - 11 * u, x + 11 * u, y + 11 * u), fill=GOLD)
    d.polygon([P(70, 27), P(66, 35), P(75, 30)], fill=GOLD)
    return im.resize((size, size), Image.LANCZOS)


draw(192, 78, True).save('icon-192.png')
draw(512, 78, True).save('icon-512.png')
draw(512, 58, False).save('icon-maskable-512.png')
Image.new('RGB', (256, 256), (232, 236, 228)).save('tests/fixtures/tile.png')
