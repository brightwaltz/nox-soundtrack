# 音源と曲データの作り方

実行の順番（リポジトリの直下で）：

1. 平文の抜き出しは済み（`build/plain/01.m4a`〜`25.m4a`。`build/` は git に入れない）。01〜24 は支援者向け動画の音声、25 は本編で使ったフリー BGM（Piano Improvisation 2020 Spring No.3、OpenTracks で公開中）を動画と同じ決まり（−16 LUFS・−1.5 dBTP までのゲインだけ）で AAC 192k にしたもの。画面の「ダウンロード」は OpenTracks の曲ページ（`make_tracks.py` の `EXTRA_LINK`）へ飛ぶ。2026-10-31 に 01 と 08 を入れ替えた（平文と .bin をそのまま入れ替えたので、暗号化し直していない）
2. 暗号化：`uv run --with cryptography python -I tools/encrypt_audio.py` → `audio/NN.bin` と `audio/check.bin`。1 曲だけなら番号を付ける（`… encrypt_audio.py 25`。ほかの .bin と check.bin は変わらない）
3. 曲データ：`uv run python -I tools/make_tracks.py` → `data/tracks.json`（ffprobe が要る）
4. 音量の包絡線：`uv run python -I tools/make_levels.py` → `data/levels.json`（ffmpeg が要る。1/12 秒ごと・曲ごとに正規化・base36 の 1 文字。最後に全曲の長さを `ceil(duration*12)` と照らす。平文を作り直したら tracks.json と一緒に作り直す）
5. テスト：`uv run --with cryptography python -I tools/test_roundtrip.py` と `node tools/test_webcrypto.mjs`

`audio/*.bin` は「12 バイトの IV ＋ 暗号文＋16 バイトのタグ」（AES-256-GCM、AAD なし）。

鍵は `secret/content_key.txt`（base64url・パディングなし・1 行。`secret/` は git に入れない）。
無ければ encrypt_audio.py が作り、あれば読む。鍵を作り直すと、全部の暗号文と、鍵を入れて配ったリンクがすべて変わる（古いリンクは使えなくなる）。

暗号化は毎回 IV を乱数で作るので、再実行すると鍵が同じでも `audio/*.bin` が全部変わり、コミットのたびに約 76MB が履歴に積もる。平文（音源）が変わったときだけ再実行する。
