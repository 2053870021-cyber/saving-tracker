"""生成「省钱记」PWA 图标（绿底 + 白色 ¥）。

用法： python tools/make_icons.py
输出： icons/icon-192.png, icons/icon-512.png, icons/icon-maskable-512.png,
       icons/apple-touch-icon-180.png
"""
import os
from PIL import Image, ImageDraw

SS = 4  # 超采样倍数，保证边缘平滑
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")

TOP = (62, 209, 106)     # #3ED16A
BOTTOM = (26, 152, 68)   # #1A9844
WHITE = (255, 255, 255, 255)


def gradient(size):
    """垂直渐变底色。"""
    strip = Image.new("RGB", (1, size))
    px = strip.load()
    for y in range(size):
        t = y / max(1, size - 1)
        px[0, y] = (
            round(TOP[0] + (BOTTOM[0] - TOP[0]) * t),
            round(TOP[1] + (BOTTOM[1] - TOP[1]) * t),
            round(TOP[2] + (BOTTOM[2] - TOP[2]) * t),
        )
    return strip.resize((size, size), Image.BILINEAR).convert("RGBA")


def stroke(draw, pts, width, color):
    """带圆头的折线。"""
    draw.line(pts, fill=color, width=width, joint="curve")
    r = width / 2.0
    for (x, y) in (pts[0], pts[-1]):
        draw.ellipse([x - r, y - r, x + r, y + r], fill=color)


def draw_yen(img, size, ratio):
    """在画布中央绘制白色 ¥ 符号。ratio = 字形宽度占画布比例。"""
    d = ImageDraw.Draw(img)
    cx = size / 2.0
    cy = size / 2.0
    w = size * ratio
    h = w * 1.12
    lw = max(2, int(round(size * 0.062)))
    ty = cy - h / 2.0
    mid = ty + h * 0.36
    bot = ty + h

    # 两条斜笔画
    stroke(d, [(cx - w / 2.0, ty), (cx, mid)], lw, WHITE)
    stroke(d, [(cx + w / 2.0, ty), (cx, mid)], lw, WHITE)
    # 竖笔画
    stroke(d, [(cx, mid - lw * 0.2), (cx, bot)], lw, WHITE)
    # 两条横杠
    half = w / 2.4
    stroke(d, [(cx - half, ty + h * 0.55), (cx + half, ty + h * 0.55)], lw, WHITE)
    stroke(d, [(cx - half, ty + h * 0.78), (cx + half, ty + h * 0.78)], lw, WHITE)


def build(size, ratio, rounded, path):
    big = size * SS
    img = gradient(big)
    draw_yen(img, big, ratio)

    if rounded:
        mask = Image.new("L", (big, big), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            [0, 0, big - 1, big - 1], radius=int(round(big * 0.2225)), fill=255
        )
        canvas = Image.new("RGBA", (big, big), (0, 0, 0, 0))
        canvas.paste(img, (0, 0), mask)
        img = canvas

    img = img.resize((size, size), Image.LANCZOS)
    img.save(path, "PNG", optimize=True)
    print("wrote", path, size)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    build(192, 0.56, True, os.path.join(OUT_DIR, "icon-192.png"))
    build(512, 0.56, True, os.path.join(OUT_DIR, "icon-512.png"))
    build(512, 0.44, False, os.path.join(OUT_DIR, "icon-maskable-512.png"))
    build(180, 0.58, False, os.path.join(OUT_DIR, "apple-touch-icon-180.png"))


if __name__ == "__main__":
    main()
