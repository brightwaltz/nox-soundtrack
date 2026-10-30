"""キービジュアル（監督提供、Web 使用は 10/30 に許諾済み）から、2D 版の背景と OG 画像、Media Session 用の正方形（art-512）を作る。輝度の目安も出す。"""
import sys
from pathlib import Path
from PIL import Image, ImageEnhance

SRC = str(Path.home() / "マイドライブ/music/Nox/Album/キービジュアル_監督提供_2000x1246.jpg")


def luma_stats(im):
    g = im.convert("L").resize((720, round(720 * im.size[1] / im.size[0])))
    px = list(g.getdata())
    n = len(px)
    return sum(px) / n, 100 * sum(p > 102 for p in px) / n, 100 * sum(p > 178 for p in px) / n


def main():
    im = Image.open(SRC).convert("RGB")
    w, h = im.size
    bg = im.resize((1600, round(1600 * h / w)), Image.LANCZOS)
    ImageEnhance.Brightness(bg).enhance(0.55).save("assets/keyvisual-dark.jpg", quality=82, optimize=True, progressive=True)
    th = round(w * 630 / 1200)
    top = (h - th) // 2
    im.crop((0, top, w, top + th)).resize((1200, 630), Image.LANCZOS).save("assets/og.jpg", quality=85, optimize=True, progressive=True)
    # Media Session 用の正方形。og と同じく中央で切り、明るさは keyvisual-dark と同じだけ落とす
    side = min(w, h)
    left, top = (w - side) // 2, (h - side) // 2
    art = im.crop((left, top, left + side, top + side)).resize((512, 512), Image.LANCZOS)
    ImageEnhance.Brightness(art).enhance(0.55).save("assets/art-512.jpg", quality=82, optimize=True, progressive=True)
    print("keyvisual  mean %.1f  >40%% %.1f%%  >70%% %.1f%%" % luma_stats(im))
    for p in sys.argv[1:]:
        print(p, " mean %.1f  >40%% %.1f%%  >70%% %.1f%%" % luma_stats(Image.open(p).convert("RGB")))


if __name__ == "__main__":
    main()
