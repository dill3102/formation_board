"""アプリのアイコン (PWA / ホーム画面用) を作る

使い方: python tools/make_icons.py   (Pillow が必要: pip install pillow)
出力: assets/app-icon/ に icon-192.png / icon-512.png / maskable-512.png / apple-touch-icon.png / favicon-32.png

デザイン: 緑のコートに白いライン、青と赤の選手、青から伸びる白い矢印
maskable 用は、端が切り取られても大丈夫なように中央 80% に収める
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "assets" / "app-icon"
SCALE = 4  # 大きく描いてから縮小してなめらかにする

GREEN = (47, 143, 78)
GREEN_DARK = (37, 116, 62)
WHITE = (255, 255, 255)
BLUE = (31, 111, 235)
RED = (229, 57, 53)


def draw_icon(size: int, *, maskable: bool, rounded: bool) -> Image.Image:
    s = size * SCALE
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 背景
    radius = int(s * 0.22) if rounded else 0
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=radius, fill=GREEN)

    # 中身を置く範囲 (maskable は中央 80% の安全領域、通常は 86%)
    area = 0.72 if maskable else 0.86
    m = s * (1 - area) / 2
    left, top, right, bottom = m, m + s * area * 0.12, s - m, s - m - s * area * 0.12
    w = right - left
    h = bottom - top
    line = max(2, int(s * 0.022))

    # 芝の縞
    stripes = 6
    for i in range(0, stripes, 2):
        x0 = left + w * i / stripes
        d.rectangle([x0, top, x0 + w / stripes, bottom], fill=GREEN_DARK)

    # ライン
    d.rectangle([left, top, right, bottom], outline=WHITE, width=line)
    cx = (left + right) / 2
    cy = (top + bottom) / 2
    d.line([cx, top, cx, bottom], fill=WHITE, width=line)
    r = h * 0.2
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=WHITE, width=line)
    # ゴールエリア
    gh = h * 0.42
    gw = w * 0.1
    d.rectangle([left, cy - gh / 2, left + gw, cy + gh / 2], outline=WHITE, width=line)
    d.rectangle([right - gw, cy - gh / 2, right, cy + gh / 2], outline=WHITE, width=line)

    # 選手 (青・赤) と矢印
    pr = h * 0.13
    blue = (left + w * 0.27, cy + h * 0.16)
    red = (left + w * 0.73, cy - h * 0.16)
    arrow_end = (red[0] - pr * 1.6, red[1] + pr * 0.9)
    d.line([blue, arrow_end], fill=WHITE, width=int(line * 1.6))
    head = pr * 0.9
    ax, ay = arrow_end
    dx, dy = ax - blue[0], ay - blue[1]
    length = (dx ** 2 + dy ** 2) ** 0.5
    ux, uy = dx / length, dy / length
    px, py = -uy, ux
    d.polygon([
        (ax + ux * head * 0.6, ay + uy * head * 0.6),
        (ax - ux * head * 0.6 + px * head * 0.6, ay - uy * head * 0.6 + py * head * 0.6),
        (ax - ux * head * 0.6 - px * head * 0.6, ay - uy * head * 0.6 - py * head * 0.6),
    ], fill=WHITE)
    for (x, y), color in ((blue, BLUE), (red, RED)):
        d.ellipse([x - pr, y - pr, x + pr, y + pr], fill=color, outline=WHITE, width=int(line * 1.2))

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    outputs = {
        "icon-192.png": draw_icon(192, maskable=False, rounded=True),
        "icon-512.png": draw_icon(512, maskable=False, rounded=True),
        "maskable-512.png": draw_icon(512, maskable=True, rounded=False),
        # iOS は自動で角を丸めるので四角のまま (透明部分は黒くなるため不可)
        "apple-touch-icon.png": draw_icon(180, maskable=False, rounded=False),
        "favicon-32.png": draw_icon(32, maskable=False, rounded=True),
    }
    for name, img in outputs.items():
        img.save(OUT / name, optimize=True)
        print(OUT / name)


if __name__ == "__main__":
    main()
