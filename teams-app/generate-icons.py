#!/usr/bin/env python3
"""Ícones do app Teams Credenciamento: color 192×192 + outline 32×32 (branco/transparente)."""
from PIL import Image, ImageDraw
import os

DIR = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(DIR, "logo-source.png")
# Fundo do logo (amostrado da arte)
NAVY = (19, 37, 58, 255)  # #13253A
WHITE = (255, 255, 255, 255)


def make_color() -> Image.Image:
    """Redimensiona a arte oficial para 192×192 (fundo navy sob transparência)."""
    size = 192
    src = Image.open(SOURCE).convert("RGBA")
    src = src.resize((size, size), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), NAVY)
    out.alpha_composite(src)
    return out


def make_outline() -> Image.Image:
    """Silhueta branca do crachá com W — outline 32×32 em fundo transparente."""
    # Desenha já em 32px com traços grossos (redimensionar de 256px borrava o W).
    size = 32
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Cartão
    draw.rounded_rectangle([7, 5, 25, 28], radius=3, outline=WHITE, width=2)

    # Clip
    draw.ellipse([13, 2, 19, 8], outline=WHITE, width=1)
    draw.rectangle([14, 7, 18, 9], fill=WHITE)

    # W geométrico (legível em 32px)
    draw.line([(10, 12), (12, 22), (16, 15), (20, 22), (22, 12)], fill=WHITE, width=2, joint="curve")

    # Uma linha sob o W
    draw.rounded_rectangle([10, 25, 22, 27], radius=1, fill=WHITE)

    return img


def main():
    if not os.path.isfile(SOURCE):
        raise SystemExit(f"Arte do logo não encontrada: {SOURCE}")

    color = make_color()
    outline = make_outline()
    color_path = os.path.join(DIR, "color.png")
    outline_path = os.path.join(DIR, "outline.png")
    color.save(color_path, "PNG")
    outline.save(outline_path, "PNG")

    preview = Image.new("RGBA", (420, 220), (30, 41, 59, 255))
    pdraw = ImageDraw.Draw(preview)
    pdraw.text((24, 16), "color.png 192", fill=WHITE)
    pdraw.text((240, 16), "outline.png 32", fill=WHITE)
    preview.paste(color, (24, 40), color)
    big = outline.resize((128, 128), Image.NEAREST)
    for y in range(40, 168):
        for x in range(240, 368):
            c = (51, 65, 85, 255) if ((x // 8) + (y // 8)) % 2 == 0 else (30, 41, 59, 255)
            preview.putpixel((x, y), c)
    preview.paste(big, (240, 40), big)
    preview_path = os.path.join(DIR, "icons-preview.png")
    preview.save(preview_path, "PNG")

    print(f"Gerado: {color_path}")
    print(f"Gerado: {outline_path}")
    print(f"Preview: {preview_path}")


if __name__ == "__main__":
    main()
