#!/usr/bin/env python3
"""Ícones do app Teams Credenciamento: color 192×192 + outline 32×32 (branco/transparente)."""
from PIL import Image, ImageDraw
import os

DIR = os.path.dirname(os.path.abspath(__file__))
ACCENT = (37, 99, 235, 255)  # #2563EB
WHITE = (255, 255, 255, 255)


def _line(draw, pts, fill, width):
    draw.line(pts, fill=fill, width=width, joint="curve")


def draw_credential(draw, size, *, ink, card_fill=None, seal_fill=None, check_ink=None):
    """Crachá com avatar, linhas e selo de aprovação."""
    s = float(size)
    w = max(2, size // 28)

    # Cartão
    card = [0.22 * s, 0.16 * s, 0.78 * s, 0.88 * s]
    radius = max(3, int(0.07 * s))
    if card_fill is not None:
        draw.rounded_rectangle(card, radius=radius, fill=card_fill, outline=ink, width=w)
    else:
        draw.rounded_rectangle(card, radius=radius, outline=ink, width=w)

    # Furo do clip
    hr = 0.035 * s
    cx, cy = 0.5 * s, 0.22 * s
    draw.ellipse([cx - hr, cy - hr, cx + hr, cy + hr], outline=ink, width=max(1, w - 1))

    # Avatar
    ar = 0.13 * s
    ax, ay = 0.5 * s, 0.40 * s
    draw.ellipse([ax - ar, ay - ar, ax + ar, ay + ar], outline=ink, width=w)
    head_r = ar * 0.36
    draw.ellipse(
        [ax - head_r, ay - ar * 0.55, ax + head_r, ay - ar * 0.55 + head_r * 2],
        outline=ink,
        width=max(1, w - 1),
    )
    draw.arc(
        [ax - ar * 0.75, ay - ar * 0.05, ax + ar * 0.75, ay + ar * 1.15],
        start=15,
        end=165,
        fill=ink,
        width=max(1, w - 1),
    )

    # Linhas de dados
    for y, half_w in ((0.60, 0.20), (0.68, 0.15), (0.76, 0.10)):
        x0 = (0.5 - half_w) * s
        x1 = (0.5 + half_w) * s
        yy = y * s
        h = max(2, size // 26)
        draw.rounded_rectangle([x0, yy, x1, yy + h], radius=h // 2, fill=ink)

    # Selo de aprovação
    br = 0.10 * s
    bx, by = 0.70 * s, 0.78 * s
    fill = seal_fill if seal_fill is not None else ink
    draw.ellipse([bx - br, by - br, bx + br, by + br], fill=fill)
    ck = check_ink if check_ink is not None else WHITE
    cw = max(2, size // 32)
    _line(
        draw,
        [
            (bx - br * 0.45, by + br * 0.02),
            (bx - br * 0.08, by + br * 0.40),
            (bx + br * 0.50, by - br * 0.35),
        ],
        ck,
        cw,
    )


def make_color() -> Image.Image:
    size = 192
    img = Image.new("RGBA", (size, size), ACCENT)
    draw = ImageDraw.Draw(img)
    # Camada suave do cartão
    draw_credential(
        draw,
        size,
        ink=WHITE,
        card_fill=(255, 255, 255, 32),
        seal_fill=WHITE,
        check_ink=ACCENT,
    )
    return img


def make_outline() -> Image.Image:
    """Desenha em alta resolução e reduz — outline branco em fundo transparente."""
    hi = 256
    img = Image.new("RGBA", (hi, hi), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw_credential(draw, hi, ink=WHITE, card_fill=None, seal_fill=WHITE, check_ink=(0, 0, 0, 0))

    # Check transparente (apaga traço no selo)
    s = float(hi)
    br = 0.10 * s
    bx, by = 0.70 * s, 0.78 * s
    px = img.load()
    pts = [
        (bx - br * 0.45, by + br * 0.02),
        (bx - br * 0.08, by + br * 0.40),
        (bx + br * 0.50, by - br * 0.35),
    ]
    thickness = max(4, hi // 28)
    for i in range(len(pts) - 1):
        x0, y0 = pts[i]
        x1, y1 = pts[i + 1]
        steps = int(max(abs(x1 - x0), abs(y1 - y0), 1))
        for t in range(steps + 1):
            u = t / steps
            x = int(x0 + (x1 - x0) * u)
            y = int(y0 + (y1 - y0) * u)
            for dx in range(-(thickness // 2), thickness // 2 + 1):
                for dy in range(-(thickness // 2), thickness // 2 + 1):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < hi and 0 <= yy < hi:
                        if (xx - bx) ** 2 + (yy - by) ** 2 <= (br * 0.92) ** 2:
                            px[xx, yy] = (0, 0, 0, 0)

    return img.resize((32, 32), Image.LANCZOS)


def main():
    color = make_color()
    outline = make_outline()
    color_path = os.path.join(DIR, "color.png")
    outline_path = os.path.join(DIR, "outline.png")
    color.save(color_path, "PNG")
    outline.save(outline_path, "PNG")

    # Preview lado a lado (útil no portal / README)
    preview = Image.new("RGBA", (420, 220), (30, 41, 59, 255))
    pdraw = ImageDraw.Draw(preview)
    pdraw.text((24, 16), "color.png 192", fill=WHITE)
    pdraw.text((240, 16), "outline.png 32", fill=WHITE)
    preview.paste(color, (24, 40), color)
    # Outline ampliado ×4 para visualizar
    big = outline.resize((128, 128), Image.NEAREST)
    # Fundo quadriculado sob o outline
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
