// Page wiring: the water, the key check, the track list and the player.
// Without a key the page shows the world, the credits and the list, but nothing plays.
// ?capture drives the scene frame by frame from outside (for recording a preview video).
// The key check and the list come first; three.js and the water load alongside and start after them.
import { unlock, createPlayer } from './player.js';

const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const params = new URLSearchParams(location.search);
const capture = params.has('capture');

const dataReady = Promise.all([
  fetch('data/tracks.json').then(r => r.json()),
  fetch('data/levels.json').then(r => (r.ok ? r.json() : null)).catch(() => null),
]);
const keyReady = unlock().then(key => ({ key }), error => ({ error }));
const sceneModule = import('./scene.js');

const $ = s => document.querySelector(s);
const fmt = s => {
  s = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const [tracks, levels] = await dataReady;

// ---- track list
function renderList(open) {
  const list = $('#list');
  list.textContent = '';
  const total = tracks.reduce((a, t) => a + t.duration, 0);
  $('#tracks-total').textContent = `${tracks.length} 曲　${Math.round(total / 60)} 分`;
  const sections = [];
  for (const [i, t] of tracks.entries()) {
    let sec = sections.at(-1);
    if (!sec || sec.key !== t.section) sections.push((sec = { key: t.section, title: t.sectionTitle, groups: [] }));
    let g = sec.groups.at(-1);
    if (!g || g.key !== t.group) sec.groups.push((g = { key: t.group, note: t.sectionNote, items: [] }));
    g.items.push([i, t]);
  }
  for (const sec of sections) {
    const el = document.createElement('section');
    el.className = 'sec';
    el.setAttribute('aria-labelledby', `sec-${sec.key}`);
    const head = document.createElement('div');
    head.className = 'sec-head';
    head.innerHTML = '<p class="sec-num" aria-hidden="true"></p><h3 class="sec-title"></h3><p class="sec-note"></p>';
    head.querySelector('.sec-num').textContent = sec.key;
    const h = head.querySelector('.sec-title');
    h.id = `sec-${sec.key}`;
    h.textContent = sec.title;
    // a section with sub-groups names them above each list instead
    const many = sec.groups.length > 1;
    head.querySelector('.sec-note').textContent = many ? '' : sec.groups[0].note;
    el.append(head);
    const body = document.createElement('div');
    body.className = 'sec-body';
    for (const g of sec.groups) {
      if (many) {
        const sub = document.createElement('p');
        sub.className = 'sub-head';
        sub.textContent = g.note;
        body.append(sub);
      }
      const ol = document.createElement('ol');
      ol.className = 'sec-list';
      for (const [i, t] of g.items) {
        const li = document.createElement('li');
        const row = document.createElement(open ? 'button' : 'div');
        row.className = 'trk';
        if (open) { row.type = 'button'; row.dataset.i = i; }
        row.innerHTML = '<span class="trk-n tnum"></span><span class="trk-t"></span><span class="trk-d tnum"></span>';
        row.children[0].textContent = t.id;
        row.children[1].textContent = t.title;
        row.children[2].textContent = fmt(t.duration);
        li.append(row);
        ol.append(li);
      }
      body.append(ol);
    }
    el.append(body);
    list.append(el);
  }
}

// ---- key
const { key = null, error } = await keyReady;
if (error) {
  const err = $('#key-err');
  err.textContent = error.kind === 'net'
    ? '音源を確かめられませんでした。通信の状態を確かめて、ページを開き直してください。'
    : 'リンクの鍵を確かめられませんでした。お知らせのリンクを、もう一度そのまま開いてください。';
  err.hidden = false;
}
root.classList.toggle('open', !!key);
root.classList.remove('checking');
root.classList.toggle('locked', !key);
renderList(!!key);
performance.mark('nox-ready');

// ---- the water: after the list has been painted, since building the shader can hold the page for a moment
await new Promise(r => requestAnimationFrame(() => setTimeout(r)));
const { createScene } = await sceneModule;
const scene = createScene(document.getElementById('water'), { reduced, capture });
if (!scene) root.classList.add('no-webgl');
if (scene && capture) window.__nox = { step: scene.step, pointerAt: scene.pointerAt, setPlaying: on => scene.setGather(on) };

const xrBtn = $('#xr-btn');
if (params.has('xr')) xrBtn.hidden = false; // preview where the button sits
if (scene) {
  scene.xrSupported().then(ok => {
    if (!ok) return;
    xrBtn.hidden = false;
    xrBtn.addEventListener('click', () => { scene.enterXR().catch(() => {}); });
  });
}

if (key) {
  const audio = $('#audio');
  const playBtns = [$('#play'), $('#dock-play')];
  const seekEl = $('#seek');
  const dock = $('#dock');
  let lastIndex = -1;

  const levelAt = t => {
    const s = levels && levels.levels[tracks[player.state().index].id];
    if (!s) return 0.4;
    const x = t * levels.rate;
    const i = Math.floor(x);
    const a = parseInt(s[i] || '0', 36) / 35, b = parseInt(s[i + 1] || '0', 36) / 35;
    return a + (b - a) * (x - i);
  };

  function paint(st) {
    const t = st.track;
    for (const b of playBtns) {
      b.setAttribute('aria-pressed', String(st.playing || st.loading));
      b.setAttribute('aria-label', st.playing || st.loading ? '一時停止' : '再生');
      b.classList.toggle('is-loading', st.loading);
    }
    if (st.index !== lastIndex) {
      lastIndex = st.index;
      $('.now-n').textContent = t.id;
      $('.now-name').textContent = t.title;
      $('.now-sec').textContent = `${t.section}. ${t.sectionTitle}${t.group !== t.section ? `　${t.sectionNote}` : ''}`;
      $('.dock-n').textContent = t.id;
      $('.dock-name').textContent = t.title;
      for (const r of document.querySelectorAll('.trk')) {
        if (+r.dataset.i === st.index) r.setAttribute('aria-current', 'true');
        else r.removeAttribute('aria-current');
      }
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: t.title,
          artist: 'brightwaltz',
          album: 'Nox — Original Soundtrack',
          artwork: [{ src: new URL('assets/art-512.jpg', location.href).href, sizes: '512x512', type: 'image/jpeg' }],
        });
      }
      if (scene) scene.setLabel(`${t.id}   ${t.title}`);
    }
    for (const r of document.querySelectorAll('.trk[aria-current]')) r.classList.toggle('is-playing', st.playing);
    const time = st.error ? '読み込めませんでした。もう一度押してください' : st.loading ? '読み込み中…' : `${fmt(st.time)} / ${fmt(st.duration)}`;
    $('.now-time').textContent = time;
    $('.dock-time').textContent = st.loading ? '…' : fmt(st.time);
    seekEl.setAttribute('aria-valuemax', String(Math.round(st.duration)));
    seekEl.setAttribute('aria-valuenow', String(Math.round(st.time)));
    seekEl.setAttribute('aria-valuetext', `${fmt(st.time)} / ${fmt(st.duration)}`);
    if (scene) {
      scene.setGather(st.playing);
      scene.setLevelSource(st.playing ? () => levelAt(audio.currentTime) : null);
    }
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = st.playing ? 'playing' : 'paused';
      if (st.playing && navigator.mediaSession.setPositionState && isFinite(st.duration)) {
        try { navigator.mediaSession.setPositionState({ duration: st.duration, position: Math.min(st.time, st.duration), playbackRate: 1 }); } catch (e) { /* not supported */ }
      }
    }
    document.title = st.started ? `${t.title} — Nox` : 'Nox — Original Soundtrack';
    showDock();
  }

  const player = createPlayer({ tracks, key, audio, onChange: paint });

  // progress bars follow the audio clock every frame while playing
  const bars = [document.querySelector('.progress span'), document.querySelector('.dock-progress span')];
  (function tick() {
    const st = player.state();
    const p = st.duration ? Math.min(1, st.time / st.duration) : 0;
    for (const b of bars) b.style.transform = `scaleX(${p})`;
    requestAnimationFrame(tick);
  })();

  for (const b of playBtns) b.addEventListener('click', () => { player.prime(); player.toggle(); });
  $('#list').addEventListener('click', e => {
    const row = e.target.closest('.trk[data-i]');
    if (!row) return;
    player.prime();
    const i = +row.dataset.i;
    if (i === player.state().index && player.state().started) player.toggle();
    else player.play(i);
  });

  // seeking on the hero bar
  const seekTo = x => {
    const r = seekEl.getBoundingClientRect();
    player.seek(((x - r.left) / r.width) * player.state().duration);
  };
  seekEl.addEventListener('pointerdown', e => {
    seekEl.setPointerCapture(e.pointerId);
    seekTo(e.clientX);
    const move = ev => seekTo(ev.clientX);
    seekEl.addEventListener('pointermove', move);
    seekEl.addEventListener('pointerup', () => seekEl.removeEventListener('pointermove', move), { once: true });
  });
  seekEl.addEventListener('keydown', e => {
    const st = player.state();
    const d = { ArrowLeft: -5, ArrowRight: 5, PageDown: -30, PageUp: 30 }[e.key];
    if (d) player.seek(st.time + d);
    else if (e.key === 'Home') player.seek(0);
    else if (e.key === 'End') player.seek(st.duration - 1);
    else return;
    e.preventDefault();
  });

  if ('mediaSession' in navigator) {
    const set = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch (e) { /* unsupported action */ } };
    set('play', () => player.play());
    set('pause', () => player.pause());
    set('previoustrack', () => player.prev());
    set('nexttrack', () => player.next());
    set('seekto', d => player.seek(d.seekTime));
    set('seekbackward', d => player.seek(player.state().time - (d.seekOffset || 10)));
    set('seekforward', d => player.seek(player.state().time + (d.seekOffset || 10)));
  }

  // the small player at the bottom shows once the hero's controls are out of view
  let heroVisible = true;
  function showDock() { dock.hidden = heroVisible || !player.state().started; }
  new IntersectionObserver(([en]) => { heroVisible = en.isIntersecting; showDock(); }).observe($('#now'));

  // in the headset: trigger / pinch plays and pauses, grip goes to the next track
  if (scene) scene.onXRInput({ select: () => player.toggle(), squeeze: () => player.next() });

  paint(player.state());
}
