from PIL import Image, ImageDraw
import os

DIR = os.path.dirname(os.path.abspath(__file__))


def save(filename, size, fill):
    img = Image.new("RGBA", (size, size), fill)
    d = ImageDraw.Draw(img)
    margin = size // 8
    d.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=size // 6,
        fill=(255, 255, 255, 220),
    )
    img.save(os.path.join(DIR, filename), "PNG")


save("color.png", 192, (37, 99, 235, 255))
save("outline.png", 32, (37, 99, 235, 255))
print("Ícones gerados.")
