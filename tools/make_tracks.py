"""nox-release/tracks.py と build/plain/NN.m4a の長さから data/tracks.json を作る。

tracks.py は import せず、ast で SECTIONS・TRACKS・EXTRAS の値だけ読む。
EXTRAS（本編で使ったフリー BGM）は 25 番以降のファイルに置き、画面では番号を出さない（"extra": true）。
実行：uv run python -I tools/make_tracks.py（ffprobe が要る）
"""

import ast
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLAIN = ROOT / "build" / "plain"
OUT = ROOT / "data" / "tracks.json"
TRACKS_PY = Path.home() / "dev/nox-release/tracks.py"

SECTION_TITLES = {
    "I": "本編曲",
    "II": "Another Stories",
    "III": "Concept Sketches",
    "IV": "AI 再解釈（Suno）",
    "EX": "本編曲（フリー BGM）",
}
EXTRA_NOTE = "OpenTracks（旧 DOVA-SYNDROME）で公開中"


def read_tracks_py() -> tuple[dict, list, list]:
    tree = ast.parse(TRACKS_PY.read_text(encoding="utf-8"))
    values = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            name = getattr(node.targets[0], "id", None)
            if name in ("SECTIONS", "TRACKS", "EXTRAS"):
                values[name] = ast.literal_eval(node.value)
    return values["SECTIONS"], values["TRACKS"], values.get("EXTRAS", [])


def duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        check=True, capture_output=True, text=True,
    ).stdout.strip()
    return round(float(out), 2)


def main() -> None:
    sections, tracks, extras = read_tracks_py()
    if len(tracks) != 24:
        sys.exit(f"TRACKS が 24 曲ではない（{len(tracks)} 曲）")

    items = []
    for n, (group, title, _src) in enumerate(tracks + extras, start=1):
        nid = f"{n:02d}"
        section = group.split("-")[0]
        extra = n > len(tracks)
        items.append({
            "n": n,
            "id": nid,
            "title": title,
            "section": section,
            "sectionTitle": SECTION_TITLES[section],
            "sectionNote": EXTRA_NOTE if extra else sections[group][1],
            "group": group,
            "ai": section == "IV",
            "extra": extra,
            "file": f"audio/{nid}.bin",
            "duration": duration(PLAIN / f"{nid}.m4a"),
        })

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(items)} 曲 -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
