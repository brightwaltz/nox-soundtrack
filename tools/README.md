# 音源と曲データの作り方

実行の順番（リポジトリの直下で）：

1. 平文の抜き出しは済み（`build/plain/01.m4a`〜`24.m4a`。`build/` は git に入れない）
2. 暗号化：`uv run --with cryptography python -I tools/encrypt_audio.py` → `audio/NN.bin` と `audio/check.bin`
3. 曲データ：`uv run python -I tools/make_tracks.py` → `data/tracks.json`（ffprobe が要る）
4. 音量の包絡線：`uv run python -I tools/make_levels.py` → `data/levels.json`（ffmpeg が要る。1/12 秒ごと・曲ごとに正規化・base36 の 1 文字。最後に全曲の長さを `ceil(duration*12)` と照らす。平文を作り直したら tracks.json と一緒に作り直す）
5. テスト：`uv run --with cryptography python -I tools/test_roundtrip.py` と `node tools/test_webcrypto.mjs`

`audio/*.bin` は「12 バイトの IV ＋ 暗号文＋16 バイトのタグ」（AES-256-GCM、AAD なし）。

鍵は `secret/content_key.txt`（base64url・パディングなし・1 行。`secret/` は git に入れない）。
無ければ encrypt_audio.py が作り、あれば読む。鍵を作り直すと、全部の暗号文と、鍵を入れて配ったリンクがすべて変わる（古いリンクは使えなくなる）。

暗号化は毎回 IV を乱数で作るので、再実行すると鍵が同じでも `audio/*.bin` が全部変わり、コミットのたびに約 76MB が履歴に積もる。平文（音源）が変わったときだけ再実行する。
