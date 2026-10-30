// Encrypted tracks: each audio/NN.bin is a 12-byte IV followed by AES-256-GCM ciphertext (tag at the end).
// The key arrives in the link after #k= and is kept in this browser, so a later visit plays too.
// One <audio> element plays decrypted Blob URLs; the next track is decrypted ahead so that `ended`
// can start it without waiting (iOS refuses play() that comes after an await outside a gesture).
const STORE = 'nox.k';

function b64urlDecode(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function keyFromLink() {
  const m = /(?:^#|&)k=([A-Za-z0-9_-]+)/.exec(location.hash);
  return m ? m[1] : null;
}
function stored() { try { return localStorage.getItem(STORE); } catch (e) { return null; } }
function store(k) { try { localStorage.setItem(STORE, k); } catch (e) { /* private mode: the link still works */ } }
function forget() { try { localStorage.removeItem(STORE); } catch (e) { /* nothing kept */ } }

function decrypt(key, buf) {
  const b = new Uint8Array(buf);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.subarray(0, 12) }, key, b.subarray(12));
}

// Resolves to a CryptoKey, or null when no key was given.
// Rejects with err.kind 'key' when the key does not open check.bin, 'net' when the check could not be fetched.
export async function unlock() {
  const fromLink = keyFromLink();
  const text = fromLink || stored();
  if (!text) return null;
  let res;
  try {
    res = await fetch('audio/check.bin');
    if (!res.ok) throw new Error(String(res.status));
  } catch (e) {
    throw Object.assign(new Error('check.bin unreachable'), { kind: 'net' });
  }
  const buf = await res.arrayBuffer();
  try {
    const key = await crypto.subtle.importKey('raw', b64urlDecode(text), 'AES-GCM', false, ['decrypt']);
    if (new TextDecoder().decode(await decrypt(key, buf)) !== 'nox-ok') throw new Error('mismatch');
    store(text);
    return key;
  } catch (e) {
    if (!fromLink) forget();
    throw Object.assign(new Error('wrong key'), { kind: 'key' });
  }
}

// A tiny silent WAV: played inside the first tap so the element is allowed to play later, after awaits.
function silentWav() {
  const n = 800, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

export function createPlayer({ tracks, key, audio, onChange }) {
  const pending = new Map(); // index -> Promise<blob url>
  const ready = new Map();   // index -> blob url
  let index = 0;
  let loading = false;
  let error = null;
  let started = false;
  let primed = false;
  let seq = 0;
  let shown = null; // the blob url the element holds now
  const silent = silentWav();
  const next = i => (i + 1) % tracks.length;

  function load(i) {
    if (!pending.has(i)) {
      const p = fetch(tracks[i].file)
        .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); })
        .then(buf => decrypt(key, buf))
        .then(plain => {
          const url = URL.createObjectURL(new Blob([plain], { type: 'audio/mp4' }));
          if (pending.get(i) === p) ready.set(i, url); else URL.revokeObjectURL(url);
          return url;
        });
      p.catch(() => { if (pending.get(i) === p) pending.delete(i); });
      pending.set(i, p);
    }
    return pending.get(i);
  }
  // keep only the current track and the one after it
  function trim() {
    for (const i of [...pending.keys()]) {
      if (i === index || i === next(index)) continue;
      pending.delete(i);
      const url = ready.get(i);
      if (url) { ready.delete(i); if (url !== shown) URL.revokeObjectURL(url); }
    }
  }
  function setSrc(u) {
    const old = shown;
    audio.src = u;
    shown = u;
    if (old && old !== u && old !== silent && ![...ready.values()].includes(old)) URL.revokeObjectURL(old);
  }
  const emit = () => onChange && onChange(state());
  function state() {
    const real = shown && shown !== silent;
    const duration = real && isFinite(audio.duration) ? audio.duration : tracks[index].duration;
    return { index, track: tracks[index], playing: real && !audio.paused && !loading, loading, error, started, time: real ? audio.currentTime : 0, duration };
  }

  // call from inside a tap/click before anything async
  function prime() {
    if (primed) return;
    primed = true;
    if (!shown) { setSrc(silent); audio.play().catch(() => {}); }
  }

  async function play(i = index) {
    const changing = i !== index || !ready.has(i) || shown !== ready.get(i);
    index = i;
    error = null;
    started = true;
    trim();
    const token = ++seq;
    if (changing) {
      const url = ready.get(i);
      if (url) {
        setSrc(url); // synchronous: keeps the gesture / the `ended` chain
      } else {
        loading = true;
        emit();
        try {
          const u = await load(i);
          if (token !== seq) return;
          setSrc(u);
        } catch (e) {
          if (token !== seq) return;
          loading = false;
          error = 'load';
          emit();
          return;
        }
        loading = false;
      }
    }
    try {
      await audio.play();
    } catch (e) {
      if (token !== seq) return;
    }
    emit();
    load(next(i)).catch(() => {});
  }

  function pause() { audio.pause(); emit(); }
  function toggle() {
    if (loading) { seq++; loading = false; pause(); return; }
    // the silent primer may be running; only a real track counts as playing
    if (shown && shown !== silent && !audio.paused) pause();
    else play();
  }
  function go(d) { play((index + d + tracks.length) % tracks.length); }
  function seek(t) {
    if (!shown || shown === silent) return;
    audio.currentTime = Math.max(0, Math.min(t, (audio.duration || tracks[index].duration) - 0.05));
    emit();
  }

  audio.addEventListener('ended', () => { if (shown !== silent) play(next(index)); });
  for (const ev of ['play', 'pause', 'timeupdate', 'seeked']) audio.addEventListener(ev, emit);

  load(0).catch(() => {});

  return {
    state, prime, play, pause, toggle, seek,
    next: () => go(1),
    prev: () => (audio.currentTime > 3 && started ? seek(0) : go(-1)),
  };
}
