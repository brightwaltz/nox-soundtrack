"""build/plain/NN.m4a から曲ごとの音量の包絡線を作り、data/levels.json に書く。

再生中に 3D の水を音に合わせて動かすため。ブラウザの AudioContext は iOS の画面ロックで
音が止まるので使わず、ここで作った包絡線を再生位置で引く。

- 1/12 秒ごとの RMS（モノラル・8000Hz）
- 曲ごとに 95 パーセンタイルを 1.0 として割り、0〜1 に切ってから平方根（γ=0.5）
- 0〜35 に量子化し、base36 の 1 文字（0-9a-z）で並べた文字列にする

平文は読むだけ（消さない・書き換えない）。
実行：uv run python -I tools/make_levels.py（ffmpeg が要る）
"""

import json
import math
import subprocess
import sys
from array import array
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLAIN = ROOT / "build" / "plain"
TRACKS = ROOT / "data" / "tracks.json"
OUT = ROOT / "data" / "levels.json"

SR = 8000
RATE = 12
DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz"


def read_pcm(path: Path) -> array:
    raw = subprocess.run(
        ["ffmpeg", "-nostdin", "-v", "error", "-i", str(path),
         "-ac", "1", "-ar", str(SR), "-f", "s16le", "-acodec", "pcm_s16le", "-"],
        check=True, capture_output=True,
    ).stdout
    pcm = array("h")
    pcm.frombytes(raw)
    if sys.byteorder != "little":
        pcm.byteswap()
    return pcm


def rms_frames(pcm: array) -> list[float]:
    # 8000/12 は割り切れないので、区切りは毎回 round(i*SR/RATE) で出す（固定長だとずれが積もる）
    n = math.ceil(len(pcm) * RATE / SR)
    out = []
    for i in range(n):
        a = round(i * SR / RATE)
        b = min(round((i + 1) * SR / RATE), len(pcm))
        seg = pcm[a:b]
        out.append(math.sqrt(math.sumprod(seg, seg) / len(seg)) / 32768 if seg else 0.0)
    return out


def encode(rms: list[float]) -> str:
    p95 = sorted(rms)[round(0.95 * (len(rms) - 1))] if rms else 0.0
    if p95 <= 0:
        return "0" * len(rms)
    return "".join(DIGITS[round(min(1.0, r / p95) ** 0.5 * 35)] for r in rms)


def main() -> None:
    tracks = json.loads(TRACKS.read_text(encoding="utf-8"))
    levels = {}
    for t in tracks:
        path = PLAIN / f"{t['id']}.m4a"
        if not path.exists():
            sys.exit(f"{path.relative_to(ROOT)} が無い")
        levels[t["id"]] = encode(rms_frames(read_pcm(path)))

    OUT.write_text(json.dumps({"rate": RATE, "levels": levels}, indent=2) + "\n", encoding="utf-8")
    print(f"{len(levels)} 曲 -> {OUT.relative_to(ROOT)}")

    # 長さの検査：ceil(duration*12) との差が ±2 以内か
    bad = 0
    print("id   長さ  期待  差")
    for t in tracks:
        got = len(levels[t["id"]])
        want = math.ceil(t["duration"] * RATE)
        ok = abs(got - want) <= 2
        bad += not ok
        print(f"{t['id']}  {got:5d} {want:5d} {got - want:+3d}{'' if ok else '  NG'}")
    if bad:
        sys.exit(f"長さが合わない曲が {bad} 曲")
    print(f"全 {len(tracks)} 曲 OK")


if __name__ == "__main__":
    main()
