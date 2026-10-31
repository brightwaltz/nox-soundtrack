"""build/plain/NN.m4a を AES-256-GCM で暗号化して audio/NN.bin に書く。

形式：12 バイトの乱数 IV ＋ 暗号文＋16 バイトのタグ（AAD なし。WebCrypto の AES-GCM と同じ並び）。
鍵は secret/content_key.txt（base64url・パディングなし・1 行）。無ければ作り、あれば読む。
実行：uv run --with cryptography python -I tools/encrypt_audio.py [番号 ...]
番号（25 など）を付けるとその曲だけ暗号化し、check.bin は作り直さない（ほかの曲の .bin を変えないため）。
"""

import base64
import os
import sys
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ROOT = Path(__file__).resolve().parent.parent
PLAIN = ROOT / "build" / "plain"
AUDIO = ROOT / "audio"
KEY_FILE = ROOT / "secret" / "content_key.txt"
CHECK_PLAIN = b"nox-ok"


def b64url_decode(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def load_or_create_key() -> bytes:
    if KEY_FILE.exists():
        key = b64url_decode(KEY_FILE.read_text().strip())
        if len(key) != 32:
            sys.exit(f"{KEY_FILE} の鍵が 32 バイトではない（{len(key)} バイト）")
        return key
    key = os.urandom(32)
    KEY_FILE.parent.mkdir(exist_ok=True)
    text = base64.urlsafe_b64encode(key).rstrip(b"=").decode() + "\n"
    fd = os.open(KEY_FILE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(text)
    print(f"鍵を作った：{KEY_FILE}")
    return key


def encrypt(aes: AESGCM, data: bytes) -> bytes:
    iv = os.urandom(12)
    return iv + aes.encrypt(iv, data, None)


def main() -> None:
    ids = sys.argv[1:]
    sources = [PLAIN / f"{i}.m4a" for i in ids] if ids else sorted(PLAIN.glob("*.m4a"))
    missing = [p.name for p in sources if not p.exists()]
    if missing:
        sys.exit(f"平文が足りない：{', '.join(missing)}")

    aes = AESGCM(load_or_create_key())
    AUDIO.mkdir(exist_ok=True)
    for src in sources:
        out = AUDIO / f"{src.stem}.bin"
        out.write_bytes(encrypt(aes, src.read_bytes()))
        print(f"{src.name} -> audio/{out.name}")
    if not ids:
        (AUDIO / "check.bin").write_bytes(encrypt(aes, CHECK_PLAIN))
        print("check -> audio/check.bin")


if __name__ == "__main__":
    main()
