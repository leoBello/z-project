#!/usr/bin/env python3
"""Génère les favicons de `public/` à partir du logo LB.

Le logo est un visuel matriciel détouré (`scripts/logo-source.png`), pas un
tracé vectoriel : il n'y a donc pas de `favicon.svg`, seulement une série de
PNG rendus à chaque taille de destination. C'est le fichier source qui fait
foi — pour changer le favicon, on remplace `logo-source.png` et on relance.

    python scripts/make-icons.py

Dépendance : Pillow (`pip install Pillow`). Script manuel, hors build Vite.

Deux familles de sorties :
  - fond transparent, motif au ras du cadre — les favicons d'onglet, qui
    doivent tenir sur un chrome clair comme sombre ;
  - fond blanc opaque — l'icône iOS (un PNG transparent y serait composité
    sur du noir) et l'icône maskable Android, dont le motif doit rester dans
    la zone de sécurité parce que le système la recadre en cercle.
"""

from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, ImageMath

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "scripts" / "logo-source.png"
OUT = ROOT / "public"

WHITE = (255, 255, 255, 255)
LANCZOS = Image.Resampling.LANCZOS

# (fichier, côté en px, fond, part de la hauteur occupée par le motif)
TARGETS = [
    ("icon-16.png", 16, None, 0.98),
    ("icon-32.png", 32, None, 0.98),
    ("icon-48.png", 48, None, 0.98),
    ("icon-192.png", 192, None, 0.96),
    ("icon-512.png", 512, None, 0.96),
    ("apple-touch-icon.png", 180, WHITE, 0.84),
    ("icon-maskable-512.png", 512, WHITE, 0.60),
]


def resize_rgba(im, size):
    """Rééchantillonne en alpha prémultiplié.

    Redimensionner une RGBA telle quelle fait fuiter la couleur des pixels
    transparents dans les bords ; la prémultiplication l'évite.
    """
    r, g, b, a = im.split()
    premultiplied = Image.merge("RGBA", (*(ImageChops.multiply(c, a) for c in (r, g, b)), a))
    small = premultiplied.resize(size, LANCZOS)

    sr, sg, sb, sa = small.split()
    restored = [
        ImageMath.lambda_eval(
            lambda args: args["convert"](
                args["min"](args["c"] * 255 / args["max"](args["al"], 1), 255), "L"
            ),
            c=c,
            al=sa,
        )
        for c in (sr, sg, sb)
    ]
    return Image.merge("RGBA", (*restored, sa))


def build(mark, side, background, fill):
    height = round(side * fill)
    width = round(height * mark.width / mark.height)
    scaled = resize_rgba(mark, (width, height))

    # Sous 64 px, le rééchantillonnage émousse les arêtes des facettes : un
    # renforcement leur rend de la définition sans créer de halo. La dose monte
    # à 16 px, où les deux lettres ne se distinguent plus qu'à quelques pixels.
    if side <= 64:
        percent = 110 if side <= 24 else 55
        r, g, b, a = scaled.split()
        sharpened = Image.merge("RGB", (r, g, b)).filter(
            ImageFilter.UnsharpMask(radius=0.5, percent=percent, threshold=0)
        )
        scaled = Image.merge("RGBA", (*sharpened.split(), a))

    canvas = Image.new("RGBA", (side, side), background or (0, 0, 0, 0))
    canvas.alpha_composite(scaled, ((side - width) // 2, (side - height) // 2))

    # Le logo est fait d'aplats triangulaires : au-delà de 128 px une palette
    # de 256 couleurs les rend sans banding visible et divise le poids par six.
    if side > 128:
        return canvas.quantize(colors=256, method=Image.Quantize.FASTOCTREE)
    return canvas


def main():
    source = Image.open(SOURCE).convert("RGBA")
    mark = source.crop(source.split()[3].getbbox())
    print(f"source {source.size} -> motif {mark.size}")

    for name, side, background, fill in TARGETS:
        build(mark, side, background, fill).save(OUT / name, optimize=True)
        size_kb = (OUT / name).stat().st_size / 1024
        ground = "blanc" if background else "transparent"
        print(f"  {name:<24} {side:>3}px  {ground:<12} {size_kb:>6.1f} KB")


if __name__ == "__main__":
    main()
