"""audio/*.bin を復号し、平文 build/plain/NN.m4a の sha256 と一致するか確かめる。

実行：uv run --with cryptography python -I tools/test_roundtrip.py
"""

import base64
import hashlib
import sys
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ROOT = Path(__file__).resolve().parent.parent
PLAIN = ROOT / "build" / "plain"
AUDIO = ROOT / "audio"
KEY_FILE = ROOT / "secret" / "content_key.txt"


def decrypt(aes: AESGCM, blob: bytes) -> bytes:
    return aes.decrypt(blob[:12], blob[12:], None)


def main() -> int:
    s = KEY_FILE.read_text().strip()
    aes = AESGCM(base64.urlsafe_b64decode(s + "=" * (-len(s) % 4)))
    failed = 0
    for plain in sorted(PLAIN.glob("*.m4a")):
        nid = plain.stem
        want = hashlib.sha256(plain.read_bytes()).hexdigest()
        got = hashlib.sha256(decrypt(aes, (AUDIO / f"{nid}.bin").read_bytes())).hexdigest()
        ok = want == got
        failed += not ok
        print(f"{'OK ' if ok else 'NG '} {nid} {got[:16]}")
    check = decrypt(aes, (AUDIO / "check.bin").read_bytes())
    ok = check == b"nox-ok"
    failed += not ok
    print(f"{'OK ' if ok else 'NG '} check {check!r}")
    print("すべて一致" if failed == 0 else f"不一致 {failed} 件")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
