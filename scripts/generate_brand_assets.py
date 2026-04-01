from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parent.parent
ICONS_DIR = ROOT / "icons"
BRANDING_DIR = ROOT / "branding"
ANDROID_RES_DIR = ROOT / "android" / "app" / "src" / "main" / "res"
SOURCE_LOGO_PATH = BRANDING_DIR / "dp.jpg"

PALETTE = {
    "paper_top": (247, 237, 223, 255),
    "paper_bottom": (233, 217, 196, 255),
    "ink": (26, 19, 16, 255),
    "ink_soft": (54, 40, 32, 255),
    "orange": (255, 155, 24, 255),
    "orange_soft": (255, 203, 87, 255),
    "green": (133, 154, 42, 255),
    "green_dark": (90, 116, 30, 255),
    "white": (255, 255, 255, 255),
}

LAUNCHER_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

SPLASH_SIZES = {
    "drawable-nodpi": (1080, 1920),
    "drawable-port-mdpi": (320, 480),
    "drawable-port-hdpi": (480, 720),
    "drawable-port-xhdpi": (640, 960),
    "drawable-port-xxhdpi": (960, 1440),
    "drawable-port-xxxhdpi": (1280, 1920),
    "drawable-land-mdpi": (480, 320),
    "drawable-land-hdpi": (720, 480),
    "drawable-land-xhdpi": (960, 640),
    "drawable-land-xxhdpi": (1440, 960),
    "drawable-land-xxxhdpi": (1920, 1280),
}


def lerp(start: int, end: int, amount: float) -> int:
    return round(start + ((end - start) * amount))


def mix(
    color_a: tuple[int, int, int, int],
    color_b: tuple[int, int, int, int],
    amount: float,
) -> tuple[int, int, int, int]:
    return tuple(lerp(a, b, amount) for a, b in zip(color_a, color_b))


def vertical_gradient(
    size: tuple[int, int],
    top: tuple[int, int, int, int],
    bottom: tuple[int, int, int, int],
) -> Image.Image:
    width, height = size
    gradient = Image.new("RGBA", (1, height))
    pixels = []
    for y in range(height):
        ratio = y / max(1, height - 1)
        pixels.append(mix(top, bottom, ratio))
    gradient.putdata(pixels)
    return gradient.resize((width, height))


def draw_glow(
    image: Image.Image,
    box: tuple[float, float, float, float],
    color: tuple[int, int, int, int],
    blur_radius: int,
) -> None:
    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    draw.ellipse(box, fill=color)
    glow = glow.filter(ImageFilter.GaussianBlur(blur_radius))
    image.alpha_composite(glow)


def is_edge_background(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    return alpha > 0 and red <= 26 and green <= 26 and blue <= 26


def strip_edge_background(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    width, height = image.size
    pixels = image.load()
    visited = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def visit(x: int, y: int) -> None:
        index = (y * width) + x
        if visited[index]:
            return
        visited[index] = 1
        if is_edge_background(pixels[x, y]):
            queue.append((x, y))

    for x in range(width):
        visit(x, 0)
        visit(x, height - 1)
    for y in range(height):
        visit(0, y)
        visit(width - 1, y)

    while queue:
        x, y = queue.popleft()
        pixels[x, y] = (0, 0, 0, 0)
        for next_x, next_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= next_x < width and 0 <= next_y < height:
                visit(next_x, next_y)

    return image


def add_drop_shadow(
    image: Image.Image,
    blur_radius: int,
    opacity: int,
    offset: tuple[int, int],
) -> Image.Image:
    shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    alpha = image.split()[-1]
    shadow.putalpha(alpha.point(lambda value: min(opacity, value)))
    shadow = ImageOps.colorize(shadow.convert("L"), black=(0, 0, 0), white=(0, 0, 0)).convert("RGBA")
    shadow.putalpha(alpha.point(lambda value: min(opacity, value)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur_radius))

    canvas = Image.new("RGBA", image.size, (0, 0, 0, 0))
    canvas.alpha_composite(shadow, offset)
    canvas.alpha_composite(image)
    return canvas


def load_brand_mark() -> Image.Image:
    if not SOURCE_LOGO_PATH.exists():
        raise FileNotFoundError(f"Logo source not found: {SOURCE_LOGO_PATH}")

    with Image.open(SOURCE_LOGO_PATH) as raw_image:
        image = ImageOps.exif_transpose(raw_image).convert("RGBA")

    image = strip_edge_background(image)
    bbox = image.getbbox()
    if bbox is None:
        raise RuntimeError("Source logo became empty after background cleanup.")

    image = image.crop(bbox)
    image = image.filter(ImageFilter.UnsharpMask(radius=1.4, percent=165, threshold=2))
    return image


def fit_mark(mark: Image.Image, size: int, padding_ratio: float, include_shadow: bool = True) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    usable = max(1, round(size * (1 - (padding_ratio * 2))))
    resized = ImageOps.contain(mark, (usable, usable), Image.Resampling.LANCZOS)

    position = ((size - resized.width) // 2, (size - resized.height) // 2)
    if include_shadow:
        shadow_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        shadow_layer.alpha_composite(resized, position)
        shadow_layer = add_drop_shadow(
            shadow_layer,
            blur_radius=max(4, size // 54),
            opacity=92,
            offset=(max(2, size // 120), max(4, size // 72)),
        )
        canvas.alpha_composite(shadow_layer)

    canvas.alpha_composite(resized, position)
    return canvas


def apply_rounded_mask(image: Image.Image, radius_ratio: float) -> Image.Image:
    width, height = image.size
    mask = Image.new("L", image.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle(
        (0, 0, width - 1, height - 1),
        radius=round(min(width, height) * radius_ratio),
        fill=255,
    )
    image.putalpha(mask)
    return image


def build_launcher_icon(size: int, mark: Image.Image) -> Image.Image:
    icon = vertical_gradient(
        (size, size),
        PALETTE["paper_top"],
        PALETTE["paper_bottom"],
    )
    draw_glow(
        icon,
        (size * 0.06, size * 0.06, size * 0.74, size * 0.58),
        mix(PALETTE["orange_soft"], PALETTE["white"], 0.12),
        round(size * 0.08),
    )
    draw_glow(
        icon,
        (size * 0.34, size * 0.48, size * 0.98, size * 0.98),
        mix(PALETTE["green"], PALETTE["white"], 0.08),
        round(size * 0.09),
    )

    stripe_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    stripe_draw = ImageDraw.Draw(stripe_layer)
    stripe_step = max(18, size // 18)
    for offset in range(-size, size, stripe_step):
        stripe_draw.line(
            (offset, 0, offset + size, size),
            fill=(255, 255, 255, 14),
            width=max(1, size // 220),
        )
    stripe_layer = stripe_layer.filter(ImageFilter.GaussianBlur(max(1, size // 300)))
    icon.alpha_composite(stripe_layer)

    card_margin = round(size * 0.08)
    card = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    card_draw = ImageDraw.Draw(card)
    card_draw.rounded_rectangle(
        (card_margin, card_margin, size - card_margin, size - card_margin),
        radius=round(size * 0.18),
        fill=(255, 255, 255, 124),
        outline=(255, 255, 255, 156),
        width=max(3, size // 96),
    )
    card = card.filter(ImageFilter.GaussianBlur(max(1, size // 256)))
    icon.alpha_composite(card)

    mark_layer = fit_mark(mark, size, padding_ratio=0.14)
    icon.alpha_composite(mark_layer)

    border = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(border).rounded_rectangle(
        (3, 3, size - 4, size - 4),
        radius=round(size * 0.23),
        outline=(255, 255, 255, 48),
        width=max(3, size // 110),
    )
    icon.alpha_composite(border)
    return apply_rounded_mask(icon, radius_ratio=0.24)


def build_adaptive_foreground(size: int, mark: Image.Image) -> Image.Image:
    return fit_mark(mark, size, padding_ratio=0.18)


def build_monochrome_foreground(size: int, mark: Image.Image) -> Image.Image:
    foreground = fit_mark(mark, size, padding_ratio=0.18, include_shadow=False)
    alpha = foreground.getchannel("A")
    monochrome = Image.new("RGBA", (size, size), PALETTE["white"])
    monochrome.putalpha(alpha)
    return monochrome


def build_ui_mark(size: int, mark: Image.Image) -> Image.Image:
    return fit_mark(mark, size, padding_ratio=0.0)


def build_splash(size: tuple[int, int], mark: Image.Image) -> Image.Image:
    width, height = size
    splash = vertical_gradient(
        size,
        mix(PALETTE["ink"], PALETTE["orange"], 0.08),
        mix(PALETTE["ink"], PALETTE["green_dark"], 0.16),
    )
    draw_glow(
        splash,
        (width * 0.08, height * 0.12, width * 0.48, height * 0.40),
        (255, 165, 34, 74),
        round(min(size) * 0.12),
    )
    draw_glow(
        splash,
        (width * 0.52, height * 0.50, width * 0.94, height * 0.92),
        (138, 162, 58, 88),
        round(min(size) * 0.12),
    )

    mark_size = round(min(size) * 0.46)
    mark_layer = fit_mark(mark, mark_size, padding_ratio=0.06)
    mark_shell = Image.new("RGBA", (mark_size, mark_size), (0, 0, 0, 0))
    shell_draw = ImageDraw.Draw(mark_shell)
    shell_draw.rounded_rectangle(
        (round(mark_size * 0.08), round(mark_size * 0.08), round(mark_size * 0.92), round(mark_size * 0.92)),
        radius=round(mark_size * 0.2),
        fill=(255, 255, 255, 18),
        outline=(255, 255, 255, 34),
        width=max(2, mark_size // 120),
    )
    mark_shell = mark_shell.filter(ImageFilter.GaussianBlur(max(1, mark_size // 180)))
    splash.alpha_composite(mark_shell, ((width - mark_size) // 2, round(height * 0.14)))
    splash.alpha_composite(mark_layer, ((width - mark_size) // 2, round(height * 0.14)))

    try:
        title_font = ImageFont.truetype(r"C:\Windows\Fonts\georgiab.ttf", max(24, round(min(size) * 0.09)))
        subtitle_font = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", max(14, round(min(size) * 0.036)))
    except OSError:
        title_font = ImageFont.load_default()
        subtitle_font = ImageFont.load_default()

    draw = ImageDraw.Draw(splash)
    title = "DapoerMuda"
    subtitle = "POS | cepat, hangat, rapi"

    title_bbox = draw.textbbox((0, 0), title, font=title_font)
    subtitle_bbox = draw.textbbox((0, 0), subtitle, font=subtitle_font)
    title_x = (width - (title_bbox[2] - title_bbox[0])) / 2
    title_y = height * 0.70
    subtitle_x = (width - (subtitle_bbox[2] - subtitle_bbox[0])) / 2
    subtitle_y = title_y + (title_bbox[3] - title_bbox[1]) + min(size) * 0.02

    draw.text((title_x, title_y + max(2, round(min(size) * 0.006))), title, font=title_font, fill=(0, 0, 0, 112))
    draw.text((title_x, title_y), title, font=title_font, fill=PALETTE["white"])
    draw.text((subtitle_x, subtitle_y), subtitle, font=subtitle_font, fill=(247, 236, 221, 230))
    return splash


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True)


def main() -> None:
    mark = load_brand_mark()

    brand_mark = build_ui_mark(1024, mark)
    save_png(brand_mark, ICONS_DIR / "brand-mark.png")

    icon_1024 = build_launcher_icon(1024, mark)
    save_png(icon_1024.resize((512, 512), Image.Resampling.LANCZOS), ICONS_DIR / "icon-512.png")
    save_png(icon_1024.resize((192, 192), Image.Resampling.LANCZOS), ICONS_DIR / "icon-192.png")
    save_png(icon_1024.resize((512, 512), Image.Resampling.LANCZOS), ICONS_DIR / "icon-maskable-512.png")

    adaptive_foreground = build_adaptive_foreground(1024, mark)
    monochrome_foreground = build_monochrome_foreground(1024, mark)
    for folder, size in LAUNCHER_SIZES.items():
        icon = icon_1024.resize((size, size), Image.Resampling.LANCZOS)
        foreground = adaptive_foreground.resize((size, size), Image.Resampling.LANCZOS)
        monochrome = monochrome_foreground.resize((size, size), Image.Resampling.LANCZOS)
        save_png(icon, ANDROID_RES_DIR / folder / "ic_launcher.png")
        save_png(foreground, ANDROID_RES_DIR / folder / "ic_launcher_foreground.png")
        save_png(monochrome, ANDROID_RES_DIR / folder / "ic_launcher_monochrome.png")

    for folder, size in SPLASH_SIZES.items():
        generated = build_splash(size, mark)
        save_png(generated, ANDROID_RES_DIR / folder / "splash.png")


if __name__ == "__main__":
    main()
