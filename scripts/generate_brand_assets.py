from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parent.parent
ICONS_DIR = ROOT / "icons"
ANDROID_RES_DIR = ROOT / "android" / "app" / "src" / "main" / "res"

PALETTE = {
    "bg_top": (24, 17, 14, 255),
    "bg_bottom": (58, 38, 29, 255),
    "terracotta": (214, 93, 70, 255),
    "terracotta_soft": (236, 141, 106, 255),
    "gold": (225, 188, 122, 255),
    "gold_soft": (245, 225, 184, 255),
    "olive": (101, 131, 68, 255),
    "olive_dark": (69, 92, 45, 255),
    "cream": (248, 239, 223, 255),
    "cream_shadow": (227, 210, 178, 255),
    "ink": (43, 29, 24, 255),
}

LAUNCHER_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}


def lerp(start: int, end: int, amount: float) -> int:
    return round(start + ((end - start) * amount))


def mix(color_a: tuple[int, int, int, int], color_b: tuple[int, int, int, int], amount: float) -> tuple[int, int, int, int]:
    return tuple(lerp(a, b, amount) for a, b in zip(color_a, color_b))


def vertical_gradient(size: tuple[int, int], top: tuple[int, int, int, int], bottom: tuple[int, int, int, int]) -> Image.Image:
    width, height = size
    gradient = Image.new("RGBA", (1, height))
    pixels = []
    for y in range(height):
        ratio = y / max(1, height - 1)
        pixels.append(mix(top, bottom, ratio))
    gradient.putdata(pixels)
    return gradient.resize((width, height))


def draw_glow(image: Image.Image, box: tuple[float, float, float, float], color: tuple[int, int, int, int], blur_radius: int) -> None:
    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    draw.ellipse(box, fill=color)
    glow = glow.filter(ImageFilter.GaussianBlur(blur_radius))
    image.alpha_composite(glow)


def build_leaf(size: tuple[int, int], fill: tuple[int, int, int, int], vein: tuple[int, int, int, int], angle: float) -> Image.Image:
    width, height = size
    leaf = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(leaf)

    draw.ellipse((width * 0.04, height * 0.06, width * 0.96, height * 0.96), fill=fill)
    draw.ellipse((width * 0.10, height * 0.12, width * 0.90, height * 0.90), outline=(255, 255, 255, 18), width=max(1, width // 28))
    draw.line(
        [
            (width * 0.44, height * 0.88),
            (width * 0.48, height * 0.58),
            (width * 0.54, height * 0.24),
        ],
        fill=vein,
        width=max(3, width // 20),
        joint="curve",
    )
    draw.line(
        [
            (width * 0.52, height * 0.84),
            (width * 0.56, height * 0.58),
            (width * 0.62, height * 0.26),
        ],
        fill=(255, 255, 255, 34),
        width=max(2, width // 34),
        joint="curve",
    )

    return leaf.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)


def paste_center(base: Image.Image, overlay: Image.Image, position: tuple[float, float]) -> None:
    x = round(position[0] - (overlay.width / 2))
    y = round(position[1] - (overlay.height / 2))
    base.alpha_composite(overlay, (x, y))


def build_mark(canvas_size: int, plaque_fill: tuple[int, int, int, int], include_plaque: bool = True) -> Image.Image:
    mark = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    shadow = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    mark_draw = ImageDraw.Draw(mark)

    if include_plaque:
        plaque_box = (
            canvas_size * 0.12,
            canvas_size * 0.12,
            canvas_size * 0.88,
            canvas_size * 0.88,
        )
        shadow_draw.rounded_rectangle(
            (
                plaque_box[0] + canvas_size * 0.012,
                plaque_box[1] + canvas_size * 0.032,
                plaque_box[2] + canvas_size * 0.012,
                plaque_box[3] + canvas_size * 0.032,
            ),
            radius=round(canvas_size * 0.2),
            fill=(14, 10, 8, 70),
        )
        shadow = shadow.filter(ImageFilter.GaussianBlur(round(canvas_size * 0.032)))
        mark.alpha_composite(shadow)

        mark_draw.rounded_rectangle(plaque_box, radius=round(canvas_size * 0.2), fill=plaque_fill)
        mark_draw.rounded_rectangle(
            (
                plaque_box[0] + canvas_size * 0.012,
                plaque_box[1] + canvas_size * 0.012,
                plaque_box[2] - canvas_size * 0.012,
                plaque_box[3] - canvas_size * 0.012,
            ),
            radius=round(canvas_size * 0.17),
            outline=(255, 255, 255, 36),
            width=max(3, canvas_size // 80),
        )

    sprout = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    sprout_shadow = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    sprout_shadow_draw = ImageDraw.Draw(sprout_shadow)
    sprout_draw = ImageDraw.Draw(sprout)

    stem_points = [
        (canvas_size * 0.50, canvas_size * 0.77),
        (canvas_size * 0.47, canvas_size * 0.68),
        (canvas_size * 0.49, canvas_size * 0.58),
        (canvas_size * 0.50, canvas_size * 0.49),
        (canvas_size * 0.50, canvas_size * 0.44),
    ]
    branch_points = [
        (canvas_size * 0.31, canvas_size * 0.78),
        (canvas_size * 0.38, canvas_size * 0.74),
        (canvas_size * 0.45, canvas_size * 0.74),
    ]

    line_width = max(14, canvas_size // 18)
    shadow_offset = canvas_size * 0.012
    sprout_shadow_draw.line(
        [(x + shadow_offset, y + shadow_offset) for x, y in stem_points],
        fill=(18, 12, 9, 70),
        width=line_width,
        joint="curve",
    )
    sprout_shadow_draw.line(
        [(x + shadow_offset, y + shadow_offset) for x, y in branch_points],
        fill=(18, 12, 9, 55),
        width=max(10, canvas_size // 24),
        joint="curve",
    )
    sprout_shadow = sprout_shadow.filter(ImageFilter.GaussianBlur(round(canvas_size * 0.016)))
    sprout.alpha_composite(sprout_shadow)

    sprout_draw.line(stem_points, fill=PALETTE["olive_dark"], width=line_width, joint="curve")
    sprout_draw.line(branch_points, fill=PALETTE["olive_dark"], width=max(10, canvas_size // 24), joint="curve")
    sprout_draw.line(
        [
            (canvas_size * 0.50, canvas_size * 0.75),
            (canvas_size * 0.47, canvas_size * 0.67),
            (canvas_size * 0.49, canvas_size * 0.58),
            (canvas_size * 0.50, canvas_size * 0.49),
            (canvas_size * 0.50, canvas_size * 0.44),
        ],
        fill=(140, 170, 101, 210),
        width=max(5, canvas_size // 34),
        joint="curve",
    )

    leaves = [
        (build_leaf((round(canvas_size * 0.24), round(canvas_size * 0.34)), PALETTE["olive"], (244, 232, 211, 168), 35), (canvas_size * 0.38, canvas_size * 0.56)),
        (build_leaf((round(canvas_size * 0.24), round(canvas_size * 0.34)), PALETTE["olive"], (244, 232, 211, 168), -35), (canvas_size * 0.62, canvas_size * 0.56)),
        (build_leaf((round(canvas_size * 0.18), round(canvas_size * 0.24)), mix(PALETTE["olive"], PALETTE["gold"], 0.16), (244, 232, 211, 160), 24), (canvas_size * 0.44, canvas_size * 0.34)),
        (build_leaf((round(canvas_size * 0.18), round(canvas_size * 0.24)), mix(PALETTE["olive"], PALETTE["gold"], 0.16), (244, 232, 211, 160), -24), (canvas_size * 0.56, canvas_size * 0.34)),
    ]

    for leaf, position in leaves:
        shadow_leaf = Image.new("RGBA", leaf.size, (0, 0, 0, 0))
        shadow_leaf.alpha_composite(leaf)
        shadow_leaf = ImageOps.colorize(shadow_leaf.convert("L"), black=(0, 0, 0), white=(18, 12, 9)).convert("RGBA")
        shadow_leaf.putalpha(leaf.split()[-1].point(lambda alpha: int(alpha * 0.26)))
        shadow_leaf = shadow_leaf.filter(ImageFilter.GaussianBlur(round(canvas_size * 0.01)))
        paste_center(sprout, shadow_leaf, (position[0] + shadow_offset, position[1] + shadow_offset))
        paste_center(sprout, leaf, position)

    accent = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    accent_draw = ImageDraw.Draw(accent)
    accent_draw.ellipse(
        (
            canvas_size * 0.66,
            canvas_size * 0.20,
            canvas_size * 0.74,
            canvas_size * 0.28,
        ),
        fill=(255, 255, 255, 70),
    )
    accent = accent.filter(ImageFilter.GaussianBlur(round(canvas_size * 0.012)))
    sprout.alpha_composite(accent)

    mark.alpha_composite(sprout)
    return mark


def build_icon(size: int) -> Image.Image:
    icon = vertical_gradient((size, size), PALETTE["bg_top"], PALETTE["bg_bottom"])
    draw_glow(icon, (size * 0.10, size * 0.06, size * 0.76, size * 0.66), (214, 93, 70, 78), round(size * 0.08))
    draw_glow(icon, (size * 0.34, size * 0.40, size * 0.96, size * 0.96), (100, 131, 68, 82), round(size * 0.09))

    overlay = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    for offset in range(-size, size, max(18, size // 18)):
        overlay_draw.line((offset, 0, offset + size, size), fill=(255, 255, 255, 11), width=max(1, size // 220))
    overlay = overlay.filter(ImageFilter.GaussianBlur(round(size * 0.003)))
    icon.alpha_composite(overlay)

    border_mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(border_mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=round(size * 0.24), fill=255)
    icon.putalpha(border_mask)

    border = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(border).rounded_rectangle(
        (3, 3, size - 4, size - 4),
        radius=round(size * 0.24),
        outline=(255, 255, 255, 34),
        width=max(3, size // 128),
    )
    icon.alpha_composite(border)

    plaque = build_mark(size, plaque_fill=mix(PALETTE["cream"], PALETTE["gold_soft"], 0.18), include_plaque=True)
    icon.alpha_composite(plaque)
    return icon


def build_adaptive_foreground(size: int) -> Image.Image:
    foreground = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mark = build_mark(size, plaque_fill=mix(PALETTE["cream"], PALETTE["gold_soft"], 0.12), include_plaque=True)
    foreground.alpha_composite(mark)
    return foreground


def build_splash(size: tuple[int, int]) -> Image.Image:
    width, height = size
    splash = vertical_gradient(size, mix(PALETTE["bg_top"], PALETTE["ink"], 0.18), mix(PALETTE["bg_bottom"], PALETTE["terracotta"], 0.18))
    draw_glow(splash, (width * 0.06, height * 0.10, width * 0.56, height * 0.44), (214, 93, 70, 72), round(min(size) * 0.12))
    draw_glow(splash, (width * 0.48, height * 0.48, width * 0.94, height * 0.92), (101, 131, 68, 88), round(min(size) * 0.12))

    line_layer = Image.new("RGBA", size, (0, 0, 0, 0))
    line_draw = ImageDraw.Draw(line_layer)
    line_step = max(28, min(size) // 10)
    for offset in range(-height, width, line_step):
        line_draw.line((offset, 0, offset + height, height), fill=(255, 255, 255, 12), width=max(1, min(size) // 280))
    line_layer = line_layer.filter(ImageFilter.GaussianBlur(round(min(size) * 0.004)))
    splash.alpha_composite(line_layer)

    mark_size = round(min(size) * 0.42)
    mark = build_mark(mark_size, plaque_fill=mix(PALETTE["cream"], PALETTE["gold_soft"], 0.16), include_plaque=True)
    paste_center(splash, mark, (width / 2, height * 0.42))

    try:
        title_font = ImageFont.truetype(r"C:\Windows\Fonts\georgiab.ttf", max(20, round(min(size) * 0.095)))
        subtitle_font = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", max(12, round(min(size) * 0.04)))
    except OSError:
        title_font = ImageFont.load_default()
        subtitle_font = ImageFont.load_default()

    draw = ImageDraw.Draw(splash)
    title = "DapoerMuda"
    subtitle = "POS • cepat, hangat, rapi"

    title_bbox = draw.textbbox((0, 0), title, font=title_font)
    subtitle_bbox = draw.textbbox((0, 0), subtitle, font=subtitle_font)
    title_x = (width - (title_bbox[2] - title_bbox[0])) / 2
    title_y = height * 0.70
    subtitle_x = (width - (subtitle_bbox[2] - subtitle_bbox[0])) / 2
    subtitle_y = title_y + (title_bbox[3] - title_bbox[1]) + min(size) * 0.02

    draw.text((title_x, title_y + max(2, min(size) * 0.006)), title, font=title_font, fill=(15, 10, 8, 100))
    draw.text((title_x, title_y), title, font=title_font, fill=PALETTE["cream"])
    draw.text((subtitle_x, subtitle_y), subtitle, font=subtitle_font, fill=(247, 234, 214, 220))
    return splash


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True)


def main() -> None:
    icon_1024 = build_icon(1024)
    save_png(icon_1024.resize((512, 512), Image.Resampling.LANCZOS), ICONS_DIR / "icon-512.png")
    save_png(icon_1024.resize((192, 192), Image.Resampling.LANCZOS), ICONS_DIR / "icon-192.png")
    save_png(icon_1024.resize((512, 512), Image.Resampling.LANCZOS), ICONS_DIR / "icon-maskable-512.png")

    for folder, size in LAUNCHER_SIZES.items():
        icon = icon_1024.resize((size, size), Image.Resampling.LANCZOS)
        foreground = build_adaptive_foreground(size).resize((size, size), Image.Resampling.LANCZOS)
        save_png(icon, ANDROID_RES_DIR / folder / "ic_launcher.png")
        save_png(icon, ANDROID_RES_DIR / folder / "ic_launcher_round.png")
        save_png(foreground, ANDROID_RES_DIR / folder / "ic_launcher_foreground.png")

    for splash_path in ANDROID_RES_DIR.glob("drawable*/splash.png"):
        with Image.open(splash_path) as current:
            generated = build_splash(current.size)
        save_png(generated, splash_path)


if __name__ == "__main__":
    main()
