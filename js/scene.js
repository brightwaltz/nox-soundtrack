// Zero-gravity water, after the last scene of Nox: glossy cyan masses with bright veins inside,
// ring droplets and small satellites drifting in the dark. The pointer is a hand that tears the
// water apart; it closes again when the hand leaves. Ray-marched per eye on a box mesh, so the
// same scene works in WebXR stereo.
import * as THREE from 'three';

function makeFrag(NB) {
  return /* glsl */ `
precision highp float;
#define NB ${NB}
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform vec4 uBalls[NB];
uniform vec4 uTor[2];
uniform vec4 uTorAxis[2];
uniform vec4 uHand;
uniform float uHandR;
uniform float uTime;
uniform float uLevel;
uniform float uK;
uniform int uSteps;
varying vec3 vWorld;

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float smax(float a, float b, float k) { return -smin(-a, -b, k); }

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
                 mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
                 mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return s;
}
// marbled light inside the water: domain-warped ridged noise
float veins(vec3 p) {
  vec3 w = vec3(fbm(p * 1.1 + uTime * 0.04), fbm(p * 1.1 + vec3(4.1, 1.3, 7.7) - uTime * 0.035), fbm(p * 1.1 + vec3(8.3, 2.9, 0.4)));
  float f = fbm(p * 2.3 + w * 2.4);
  return pow(1.0 - abs(2.0 * f - 1.0), 6.0);
}

float torus(vec3 p, vec4 c, vec4 ax) {
  vec3 q = p - c.xyz;
  float h = dot(q, ax.xyz);
  vec3 radial = q - ax.xyz * h;
  return length(vec2(length(radial) - c.w, h)) - ax.w;
}

float map(vec3 p) {
  vec3 q = p;
  q += 0.13 * vec3(sin(p.y * 1.6 + uTime * 0.21), sin(p.z * 1.8 - uTime * 0.17), sin(p.x * 1.4 + uTime * 0.19));
  q += 0.045 * vec3(sin(q.z * 3.9 + uTime * 0.38), sin(q.x * 3.3 - uTime * 0.31), sin(q.y * 3.5 + uTime * 0.35));
  float d = 1e3;
  for (int i = 0; i < NB; i++) {
    vec4 b = uBalls[i];
    d = smin(d, length(q - b.xyz) - b.w, uK);
  }
  d = smin(d, torus(q, uTor[0], uTorAxis[0]), 0.06);
  d = smin(d, torus(q, uTor[1], uTorAxis[1]), 0.06);
  // the hand parts the water
  float hd = length(p - uHand.xyz) - uHand.w * uHandR + (1.0 - uHand.w) * 3.0;
  d = smax(d, -hd, 0.12);
  return d;
}
vec3 calcNormal(vec3 p) {
  const float h = 0.003;
  const vec2 k = vec2(1.0, -1.0);
  return normalize(k.xyy * map(p + k.xyy * h) + k.yyx * map(p + k.yyx * h) +
                   k.yxy * map(p + k.yxy * h) + k.xxx * map(p + k.xxx * h));
}
vec2 boxHit(vec3 ro, vec3 rd) {
  vec3 inv = 1.0 / rd;
  vec3 t0 = (uBoxMin - ro) * inv;
  vec3 t1 = (uBoxMax - ro) * inv;
  vec3 tn = min(t0, t1);
  vec3 tf = max(t0, t1);
  return vec2(max(max(tn.x, tn.y), tn.z), min(min(tf.x, tf.y), tf.z));
}

// widest the surface can reach beyond a drop: the domain warp, the smooth union and a margin
const float PAD = 0.42;

void main() {
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorld - ro);
  vec2 tb = boxHit(ro, rd);
  // most rays pass between the drops: march only where some drop could be
  float t0 = 1e9, t1 = -1e9;
  for (int i = 0; i < NB; i++) {
    vec3 oc = ro - uBalls[i].xyz;
    float r = uBalls[i].w + PAD + uK * 0.25;
    float b = dot(oc, rd);
    float h = b * b - dot(oc, oc) + r * r;
    if (h > 0.0) { h = sqrt(h); t0 = min(t0, -b - h); t1 = max(t1, -b + h); }
  }
  for (int i = 0; i < 2; i++) {
    vec3 oc = ro - uTor[i].xyz;
    float r = uTor[i].w + uTorAxis[i].w + PAD;
    float b = dot(oc, rd);
    float h = b * b - dot(oc, oc) + r * r;
    if (h > 0.0) { h = sqrt(h); t0 = min(t0, -b - h); t1 = max(t1, -b + h); }
  }
  float tEnd = min(tb.y, t1);
  float t = max(max(tb.x, t0), 0.0);
  if (t >= tEnd) discard;
  bool hit = false;
  for (int i = 0; i < uSteps; i++) {
    float d = map(ro + rd * t);
    if (d < 0.0015) { hit = true; break; }
    t += d * 0.72;
    if (t > tEnd) break;
  }
  if (!hit) discard;

  vec3 p = ro + rd * t;
  vec3 n = calcNormal(p);
  float ndv = clamp(dot(n, -rd), 0.0, 1.0);

  // how much water the ray crosses, and the far wall's rim
  vec3 rr = refract(rd, n, 0.75);
  float t2 = 0.03;
  float back = 0.0;
  bool exits = false;
  for (int i = 0; i < 32; i++) {
    float d = -map(p + rr * t2);
    if (d < 0.002) { exits = true; break; }
    t2 += max(d * 0.75, 0.012);
    if (t2 > 2.4) break;
  }
  if (exits) back = pow(1.0 - clamp(abs(dot(calcNormal(p + rr * t2), rr)), 0.0, 1.0), 2.0);
  float thick = clamp(t2 / 1.1, 0.0, 1.0);

  // light inside, sampled along the refracted ray
  float v = 0.0;
  v += veins(p + rr * 0.06);
  v += veins(p + rr * (0.06 + 0.35 * thick));
  v *= 0.5;

  vec3 navy = vec3(0.002, 0.025, 0.075);
  vec3 cyan = vec3(0.0, 0.6, 1.0);
  vec3 ice = vec3(0.55, 0.93, 1.0);

  float fres = pow(1.0 - ndv, 2.4);
  vec3 col = mix(navy, cyan * 0.3, smoothstep(0.1, 1.0, thick));
  col += cyan * v * (0.8 + 0.7 * thick);
  col += ice * pow(v, 2.0) * 0.7;
  col += cyan * fres * 1.0 + ice * pow(fres, 6.0) * 0.6;
  col += cyan * back * 0.32;
  vec3 L = normalize(vec3(-0.45, 0.75, 0.55));
  float spec = pow(max(dot(reflect(rd, n), L), 0.0), 140.0);
  col += vec3(0.8, 0.96, 1.0) * spec * 0.45;

  col *= 0.9 + 0.3 * uLevel;
  col = 1.0 - exp(-col * 1.4);
  gl_FragColor = vec4(col, 1.0);
}`;
}

const VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const DUST_VERT = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uPx;
varying float vA;
void main() {
  vec3 p = position;
  p.x += sin(uTime * 0.05 + aSeed * 6.28) * 0.25;
  p.y += cos(uTime * 0.04 + aSeed * 4.0) * 0.2;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uPx * (0.6 + aSeed) * (3.0 / -mv.z);
  vA = 0.25 + 0.5 * fract(aSeed * 7.3);
}`;

const DUST_FRAG = /* glsl */ `
precision mediump float;
uniform vec3 uColor;
uniform float uAlpha;
varying float vA;
void main() {
  float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * vA * uAlpha;
  gl_FragColor = vec4(uColor, a);
}`;

function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// relative layout: a mass with necks, and satellites
const MASS = [
  [-0.6, 0.35, 0.0, 0.42], [-0.1, 0.55, 0.15, 0.38], [0.35, 0.35, -0.1, 0.34],
  [0.55, -0.05, 0.1, 0.3], [0.25, -0.35, -0.05, 0.26], [-0.25, -0.15, 0.2, 0.22],
];
const SATS = [
  [1.1, 0.7, 0.2, 0.09], [-1.15, -0.4, 0.3, 0.12], [0.95, -0.7, -0.2, 0.1], [-0.4, -0.85, 0.35, 0.1],
  [-0.9, 0.85, -0.3, 0.08], [1.35, 0.1, 0.4, 0.07], [0.05, 0.95, -0.4, 0.06], [-1.35, 0.25, -0.1, 0.07],
];
const TORI = [
  { c: [0.98, 0.32, 0.38], R: 0.16, r: 0.045, ax: [0.3, 0.5, 0.8] },
  { c: [-0.88, -0.62, 0.12], R: 0.12, r: 0.035, ax: [-0.6, 0.3, 0.7] },
];

export function createScene(canvas, { reduced = false, capture = false } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: capture });
  } catch (e) {
    return null;
  }
  if (!renderer.getContext()) return null;

  const coarse = matchMedia('(pointer: coarse)').matches;
  const hq = capture || new URLSearchParams(location.search).has('hq');
  const pxCap = hq ? 2 : 1.5;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pxCap));
  renderer.setClearColor(0x010306, 1);
  renderer.xr.enabled = true;
  // a headset renders two large eyes: march a little less finely there
  renderer.xr.setFramebufferScaleFactor(0.8);
  renderer.xr.setFoveation(1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 60);
  camera.position.set(0, 0, 5);

  const sats = coarse && !hq ? SATS.slice(0, 4) : SATS;
  const NB = MASS.length + sats.length;
  const drops = [...MASS, ...sats].map(([x, y, z, r], i) => ({ x, y, z, r, sat: i >= MASS.length, sx: 0, sy: 0, ox: 0, oy: 0 }));
  const rr = rand(23);
  for (const d of drops) {
    d.ph = rr() * Math.PI * 2;
    // where it goes when the water gathers
    const a = rr() * Math.PI * 2;
    d.gx = d.x * 0.35 + Math.cos(a) * 0.08;
    d.gy = d.y * 0.35 + Math.sin(a) * 0.08;
    d.gz = d.z * 0.35;
  }

  const balls = Array.from({ length: NB }, () => new THREE.Vector4());
  const tor = [new THREE.Vector4(), new THREE.Vector4()];
  const torAxis = [new THREE.Vector4(), new THREE.Vector4()];
  const uniforms = {
    uBoxMin: { value: new THREE.Vector3() },
    uBoxMax: { value: new THREE.Vector3() },
    uBalls: { value: balls },
    uTor: { value: tor },
    uTorAxis: { value: torAxis },
    uHand: { value: new THREE.Vector4(0, 0, 0, 0) },
    uHandR: { value: 0.3 },
    uTime: { value: 0 },
    uLevel: { value: 0 },
    uK: { value: 0.22 },
    uSteps: { value: coarse && !hq ? 60 : 88 },
  };
  const water = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: makeFrag(NB), uniforms, side: THREE.BackSide, depthWrite: false })
  );
  water.renderOrder = 2;
  scene.add(water);

  // floating credit, drawn behind the water
  const credit = makeCredit('Music by brightwaltz');
  credit.renderOrder = 1;
  scene.add(credit);

  function makeDust(count, spread, color, alpha) {
    const r = rand(count * 7 + 1);
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (r() - 0.5) * spread[0];
      pos[i * 3 + 1] = (r() - 0.5) * spread[1];
      pos[i * 3 + 2] = (r() - 0.5) * spread[2];
      seed[i] = r();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const u = { uTime: { value: 0 }, uPx: { value: 1.8 * renderer.getPixelRatio() }, uColor: { value: new THREE.Color(color) }, uAlpha: { value: alpha } };
    const pts = new THREE.Points(g, new THREE.ShaderMaterial({
      vertexShader: DUST_VERT, fragmentShader: DUST_FRAG, uniforms: u,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    pts.renderOrder = 3;
    return { pts, u };
  }
  const dust = makeDust(coarse ? 260 : 520, [12, 8, 9], 0x3aa6d8, 0.8);
  dust.pts.position.z = -2;
  scene.add(dust.pts);
  // specks that follow the hand, like the starry hands in the film
  const specks = makeDust(70, [0.5, 0.5, 0.3], 0x7fd8ff, 0);
  scene.add(specks.pts);

  // in the headset: the track title floats under the water, with the two controls
  const label = makeLabel();
  label.mesh.visible = false;
  scene.add(label.mesh);
  // controllers or tracked hands: their grip is the hand that tears the water
  const xrInput = {};
  const grips = [0, 1].map(i => { const g = renderer.xr.getControllerGrip(i); scene.add(g); return g; });
  for (const i of [0, 1]) {
    const c = renderer.xr.getController(i);
    c.addEventListener('selectstart', () => xrInput.select && xrInput.select());
    c.addEventListener('squeezestart', () => xrInput.squeeze && xrInput.squeeze());
    scene.add(c);
  }
  const gripPos = new THREE.Vector3();
  const center = new THREE.Vector3();

  const layout = { cx: 0, cy: 0, cz: 0, s: 1 };
  const xrLayout = { cx: 0, cy: 1.35, cz: -1.3, s: 0.5 };
  let inXR = false;
  let W = 1, H = 1;

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    const visH = 2 * 5 * Math.tan(THREE.MathUtils.degToRad(17.5));
    const visW = visH * camera.aspect;
    if (camera.aspect >= 1) {
      layout.s = 1.18;
      layout.cx = visW * 0.2;
      layout.cy = 0.12;
    } else {
      layout.s = THREE.MathUtils.clamp(camera.aspect * 1.5, 0.6, 1);
      layout.cx = 0.06;
      layout.cy = visH * 0.17;
    }
  }
  resize();
  window.addEventListener('resize', resize);

  // pointer as a hand
  const ndc = new THREE.Vector2(0, 0);
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const handTarget = new THREE.Vector3();
  const hand = uniforms.uHand.value;
  let lastMove = -1e9;
  let haveHand = false;
  let now = 0; // seconds, scene clock
  function pointerAt(x, y) {
    ndc.set((x / W) * 2 - 1, -(y / H) * 2 + 1);
    lastMove = now;
    haveHand = true;
  }
  if (!capture) {
    const onPointer = e => pointerAt(e.clientX, e.clientY);
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('pointerdown', onPointer, { passive: true });
  }

  let gather = 0, gatherTarget = 0, level = 0, levelSource = null;
  const cam = new THREE.Vector2();
  const tmp = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const rot = new THREE.Euler();
  const mat = new THREE.Matrix4();

  function step(dt) {
    now += dt;
    const t = now * (reduced ? 0.3 : 1);
    const L = inXR ? xrLayout : layout;

    gather += (gatherTarget - gather) * (reduced ? 1 : 1 - Math.exp(-dt / 2.6));
    const g = gather * gather * (3 - 2 * gather);
    const lv = levelSource ? levelSource(now) : 0;
    level += (lv - level) * (1 - Math.exp(-dt / 0.15));
    uniforms.uLevel.value = level;
    uniforms.uTime.value = t;
    dust.u.uTime.value = t;
    specks.u.uTime.value = t * 3;
    uniforms.uK.value = 0.22 + 0.16 * g;

    // the whole body turns slowly
    rot.set(0.18 * Math.sin(t * 0.05), t * 0.045, 0.08 * Math.sin(t * 0.037));
    mat.makeRotationFromEuler(rot);

    const half = 1.7 * L.s;
    if (!inXR && haveHand) {
      ray.setFromCamera(ndc, camera);
      plane.constant = -L.cz;
      if (ray.ray.intersectPlane(plane, handTarget)) {
        const k = 1 - Math.exp(-dt / 0.16);
        hand.x += (handTarget.x - hand.x) * k;
        hand.y += (handTarget.y - hand.y) * k;
        hand.z = L.cz + 0.1 * L.s;
      }
    }
    let handOn = now - lastMove < 2.2 && !reduced ? 1 : 0;
    if (inXR) {
      // the nearest controller within reach of the water
      center.set(L.cx, L.cy, L.cz);
      let best = Infinity;
      for (const g of grips) {
        if (!g.visible) continue;
        g.getWorldPosition(tmp);
        const dd = tmp.distanceTo(center);
        if (dd < best) { best = dd; gripPos.copy(tmp); }
      }
      handOn = best < 0.75 ? 1 : 0;
      if (handOn) {
        const k = 1 - Math.exp(-dt / 0.08);
        hand.x += (gripPos.x - hand.x) * k;
        hand.y += (gripPos.y - hand.y) * k;
        hand.z += (gripPos.z - hand.z) * k;
      }
    }
    hand.w += (handOn - hand.w) * (1 - Math.exp(-dt / (handOn ? 0.45 : 1.8)));
    const handR = 0.34 * L.s;
    uniforms.uHandR.value = handR * 0.85;

    for (let i = 0; i < NB; i++) {
      const d = drops[i];
      const drift = reduced ? 0 : 1;
      tmp.set(
        THREE.MathUtils.lerp(d.x, d.gx, g) + drift * 0.06 * Math.sin(t * 0.21 + d.ph),
        THREE.MathUtils.lerp(d.y, d.gy, g) + drift * 0.05 * Math.cos(t * 0.17 + d.ph * 1.3),
        THREE.MathUtils.lerp(d.z, d.gz, g) + drift * 0.05 * Math.sin(t * 0.13 + d.ph * 0.7)
      ).applyMatrix4(mat);
      let x = L.cx + tmp.x * L.s, y = L.cy + tmp.y * L.s;
      const z = L.cz + tmp.z * L.s;
      // torn by the hand: pushed away while it is there, drifting back after.
      // Two smoothing stages, so the water starts to move softly instead of jumping.
      let px = 0, py = 0;
      if (hand.w > 0.01) {
        const dx = x - hand.x, dy = y - hand.y;
        // on screen the hand is a cursor over the water; in the headset it is in the water
        const dist = Math.hypot(dx, dy, inXR ? z - hand.z : 0) + 1e-4;
        const reach = handR + d.r * L.s * 0.9 + 0.12 * L.s;
        if (dist < reach) {
          const f = (reach - dist) * 0.9 * hand.w;
          px = (dx / dist) * f; py = (dy / dist) * f;
        }
      }
      const k = 1 - Math.exp(-dt / (px || py ? 0.26 : 1.0));
      d.sx += (px - d.sx) * k; d.sy += (py - d.sy) * k;
      d.ox += (d.sx - d.ox) * k; d.oy += (d.sy - d.oy) * k;
      x += d.ox; y += d.oy;
      const rad = d.r * (1 + (d.sat ? 0.15 : 0.25) * g) * (1 + 0.05 * level * Math.sin(t * 2.0 + d.ph));
      balls[i].set(x, y, z, rad * L.s);
    }
    TORI.forEach((T, i) => {
      tmp.set(T.c[0] * (1 - 0.55 * g), T.c[1] * (1 - 0.55 * g), T.c[2]).applyMatrix4(mat);
      tor[i].set(L.cx + tmp.x * L.s, L.cy + tmp.y * L.s, L.cz + tmp.z * L.s, T.R * L.s);
      axis.set(T.ax[0], T.ax[1], T.ax[2]).normalize().applyMatrix4(mat).normalize();
      torAxis[i].set(axis.x, axis.y, axis.z, T.r * L.s);
    });

    uniforms.uBoxMin.value.set(L.cx - half * 1.15, L.cy - half, L.cz - half);
    uniforms.uBoxMax.value.set(L.cx + half * 1.15, L.cy + half, L.cz + half);
    water.position.set(L.cx, L.cy, L.cz);
    water.scale.set(half * 2.3, half * 2, half * 2);

    credit.visible = inXR || camera.aspect >= 1;
    credit.position.set(L.cx - 0.75 * L.s + 0.05 * Math.sin(t * 0.1), L.cy + 0.92 * L.s + 0.04 * Math.cos(t * 0.13), L.cz - 0.9 * L.s);
    credit.rotation.set(0.1, 0.5 + 0.05 * Math.sin(t * 0.07), -0.03);
    credit.scale.setScalar(L.s * 0.62);

    label.mesh.visible = inXR;
    if (inXR) label.mesh.position.set(L.cx, L.cy - 0.62, L.cz + 0.25);

    specks.pts.position.set(hand.x, hand.y, hand.z + 0.05);
    specks.u.uAlpha.value = hand.w * 0.9;

    if (!inXR) {
      const tx = reduced ? 0 : ndc.x * 0.16 + 0.12 * Math.sin(t * 0.06);
      const ty = reduced ? 0 : ndc.y * 0.1 + 0.08 * Math.cos(t * 0.05);
      cam.x += (tx - cam.x) * (1 - Math.exp(-dt / 1.4));
      cam.y += (ty - cam.y) * (1 - Math.exp(-dt / 1.4));
      camera.position.set(cam.x, cam.y, 5 - 0.12 * Math.sin(t * 0.045));
      camera.lookAt(cam.x * 0.4, cam.y * 0.4, 0);
    }
    renderer.render(scene, camera);
  }

  let last = performance.now();
  let frames = 0, acc = 0;
  // compile the water in the background so the page stays responsive while it builds
  const loop = () => renderer.setAnimationLoop(() => {
    const nowMs = performance.now();
    const dt = Math.min((nowMs - last) / 1000, 0.05);
    last = nowMs;
    step(dt);
    frames++; acc += dt;
    if (frames === 90) {
      if (!hq && !inXR && acc / frames > 0.024 && renderer.getPixelRatio() > 0.75) {
        renderer.setPixelRatio(Math.max(0.75, renderer.getPixelRatio() - 0.25));
        dust.u.uPx.value = 1.8 * renderer.getPixelRatio();
      }
      frames = 0; acc = 0;
    }
  });
  if (!capture) renderer.compileAsync(scene, camera).then(loop, loop);

  renderer.xr.addEventListener('sessionstart', () => { inXR = true; hand.w = 0; uniforms.uSteps.value = 64; });
  renderer.xr.addEventListener('sessionend', () => { inXR = false; uniforms.uSteps.value = coarse && !hq ? 60 : 88; resize(); });

  return {
    renderer,
    step,
    pointerAt,
    setGather(on) { gatherTarget = on ? 1 : 0; },
    setLevelSource(fn) { levelSource = fn; },
    setLabel(text) { label.draw(text); },
    onXRInput({ select, squeeze }) { xrInput.select = select; xrInput.squeeze = squeeze; },
    async xrSupported() {
      try { return !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-vr')); } catch (e) { return false; }
    },
    async enterXR() {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'hand-tracking'] });
      renderer.xr.setReferenceSpaceType('local-floor');
      await renderer.xr.setSession(session);
      return session;
    },
  };
}

function makeCredit(text) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 160;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.font = '500 84px "Zen Kaku Gothic New", "Hiragino Sans", sans-serif';
    ctx.fillStyle = 'rgba(140, 210, 245, 0.6)';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 12, 82);
    tex.needsUpdate = true;
  };
  draw();
  if (document.fonts) document.fonts.load('500 84px "Zen Kaku Gothic New"').then(draw).catch(() => {});
  return new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.5 * 160 / 1024),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
}

function makeLabel() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  let text = '';
  const draw = t => {
    if (t !== undefined) text = t;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(201, 213, 222, 0.92)';
    ctx.font = 'italic 400 64px "Bodoni Moda", "Didot", serif';
    ctx.fillText(text, 512, 92);
    ctx.fillStyle = 'rgba(125, 144, 159, 0.9)';
    ctx.font = '400 34px "Zen Kaku Gothic New", "Hiragino Sans", sans-serif';
    ctx.fillText('トリガー：再生・一時停止　　グリップ：次の曲', 512, 190);
    tex.needsUpdate = true;
  };
  draw('');
  if (document.fonts) Promise.all([document.fonts.load('italic 64px "Bodoni Moda"'), document.fonts.load('34px "Zen Kaku Gothic New"')]).then(() => draw()).catch(() => {});
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  mesh.renderOrder = 4;
  return { mesh, draw };
}
