import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as pdfjs from 'pdfjs-dist/build/pdf.min.mjs';
import JSZip from 'jszip';

pdfjs.GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs';

const PANELS = window.PANELS; // dimensioni reali dei pannelli (m)
const $ = (s) => document.querySelector(s);

// ---------------- stato ----------------
const state = {
  brand: '', tagline: '',
  colors: { primary: '#1d1d1b', secondary: '#c9a686', accent: '#e85d2a', neutral: '#f4f2ee' },
  logo: null,          // HTMLImageElement / canvas
  hero: null,          // immagine per i banchi laterali
  walls: 'bianco',     // bianco | tinta
  crate: 'naturale',   // naturale | tinta
  bannerBg: 'auto',    // auto | primary | bianco
  products: true,
  candidates: [],      // {img, name, kind}
};

// ---------------- scena ----------------
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#efeeea');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
camera.position.set(3.6, 3.1, 6.4);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.05, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 1.5; controls.maxDistance = 14;

const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(3, 6, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 20 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c8, 0.6));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.16 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas.parentElement);

// ---------------- materiali ----------------
function noiseTex(size = 256, amp = 18) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); const d = g.createImageData(size, size);
  for (let i = 0; i < d.data.length; i += 4) { const v = 128 + (Math.random() - 0.5) * amp * 2; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); return t;
}
const bump = noiseTex();
const M = {
  pareti: new THREE.MeshStandardMaterial({ color: '#ecebe6', roughness: 0.92, bumpMap: bump, bumpScale: 0.4 }),
  bordo: new THREE.MeshStandardMaterial({ color: '#e9e7e1', roughness: 0.95 }),
  sgabelli: new THREE.MeshStandardMaterial({ color: '#e6e3dc', roughness: 0.9 }),
  ruote: new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.6 }),
  cassa: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.75 }),
  prodotti: new THREE.MeshStandardMaterial({ color: '#cccccc', roughness: 0.5 }),
};
const panelMats = {}; // name -> material with CanvasTexture

const _wood = new Map();
function woodTexture(tint) {
  const key = tint || 'naturale'; if (_wood.has(key)) return _wood.get(key);
  const R = rng(42), _rnd = Math.random; Math.random = R; // venatura sempre uguale
  try { const t = _woodTexture(tint); _wood.set(key, t); return t; } finally { Math.random = _rnd; }
}
function _woodTexture(tint) {
  const W = 1024, H = 1024, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const base = tint ? mix(tint, '#7a5a3a', 0.06) : '#c49a68'; // cassa verniciata nel colore: la venatura resta appena visibile
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  // doghe orizzontali con venature
  const plank = 128;
  for (let y = 0; y < H; y += plank) {
    const sh = (Math.random() - 0.5) * 0.12;
    g.fillStyle = shade(base, sh); g.fillRect(0, y, W, plank);
    for (let k = 0; k < 40; k++) {
      g.strokeStyle = `rgba(70,40,15,${0.04 + Math.random() * 0.08})`;
      g.lineWidth = 0.6 + Math.random() * 2;
      g.beginPath();
      const yy = y + Math.random() * plank; let x = 0; g.moveTo(0, yy);
      while (x < W) { x += 40; g.lineTo(x, yy + Math.sin(x * 0.01 + k) * 3 * Math.random()); }
      g.stroke();
    }
    g.fillStyle = 'rgba(40,20,5,0.35)'; g.fillRect(0, y, W, 2);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.2, 1.2); t.anisotropy = 8;
  return t;
}

// ---------------- caricamento modello ----------------
let model;
new GLTFLoader().load('./stand.glb', (gltf) => {
  model = gltf.scene;
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const n = o.name.replace(/_\d+$/, '') === o.name ? o.name : o.name;
    const key = o.name;
    if (key.endsWith('_bordo')) o.material = M.bordo;
    else if (PANELS[key]) {
      const m = new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide });
      panelMats[key] = m; o.material = m;
    } else if (M[key]) o.material = M[key];
    if (key === 'prodotti') o.castShadow = false;
  });
  const pw = model.getObjectByName('pareti'); if (pw && pw.isMesh) projectWallUV(pw); else if (pw) pw.traverse(o => o.isMesh && projectWallUV(o));
  scene.add(model);
  $('#loading').remove();
  applyAll();
}, undefined, (e) => { $('#loading').textContent = 'Errore nel caricamento del modello'; console.error(e); });

// ---------------- pareti stampate (premium) ----------------
// UV proiettate: parete di fondo vista da davanti, pareti laterali viste da fuori.
// Atlante: [0,0.5) fondo · [0.5,0.75) sinistra · [0.75,1] destra; v = quota.
const WALL = { w: 3.04, h: 2.56 };
function projectWallUV(mesh) {
  mesh.updateMatrixWorld(true);
  const g = mesh.geometry, p = g.attributes.position, uv = new Float32Array(p.count * 2), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
    const y = Math.min(1, Math.max(0, v.y / WALL.h));
    let u;
    if (v.z < -0.95) u = 0.5 * (v.x + WALL.w / 2) / WALL.w;
    else if (v.x < 0) u = 0.5 + 0.25 * (v.z + WALL.w / 2) / WALL.w;
    else u = 0.75 + 0.25 * (WALL.w / 2 - v.z) / WALL.w;
    uv[i * 2] = Math.min(0.999, Math.max(0, u)); uv[i * 2 + 1] = y;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
function wallArt(kind) {
  // disegno in proporzioni reali (3,04 x 2,56 m), poi stirato nell'atlante.
  // Solo campiture di colore: sui pannelli a zig-zag foto, loghi e scritte si deformano.
  const c = document.createElement('canvas'); c.width = 1520; c.height = 1280; const g = c.getContext('2d');
  const D = computeDesign(), W = c.width, H = c.height, style = D.pareti.style, [p0, p1, p2] = D.pareti.c;
  // p0 = colore delle pareti, p1 = secondo colore (laterali, sfumatura, fascia bassa)
  const lato = kind !== 'fondo';
  const chiaro = (h) => lum(h) < 0.03 ? '#e4e2dd' : mix(h, '#ffffff', 0.82); // tinta chiara del colore (per il nero: grigio cartone)
  const grad = (y0, y1, c0, c1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.fillStyle = gr; g.fillRect(0, y0, W, y1 - y0); };
  const fascia = H * 0.2; // fascia chiara in alto: alleggerisce la massa di colore e stacca il banner
  if (style === 'sf-chiaro') grad(0, H, p0, chiaro(p0));                       // colore in alto, sfuma al chiaro in basso
  else if (style === 'sf-base') grad(0, H, chiaro(p0), p0);                    // chiaro in alto, colore pieno alla base
  else if (style === 'sf-due') grad(0, H, p0, p1);                             // dal primo al secondo colore
  else if (style === 'fascia-sf') { g.fillStyle = chiaro(p0); g.fillRect(0, 0, W, fascia); grad(fascia, H, p0, p1); }
  else if (style === 'fascia-base') { g.fillStyle = chiaro(p0); g.fillRect(0, 0, W, fascia); grad(fascia, H, mix(p0, '#ffffff', 0.35), p0); }
  else if (style === 'fondo-sf') { if (lato) { g.fillStyle = chiaro(p0); g.fillRect(0, 0, W, H); } else grad(0, H, p0, chiaro(p0)); } // solo il fondo sfumato, laterali chiari
  else { g.fillStyle = p0; g.fillRect(0, 0, W, H); }
  return c;
}
function wallTexture() {
  const A = document.createElement('canvas'); A.width = 4096; A.height = 1536; const g = A.getContext('2d');
  g.drawImage(wallArt('fondo'), 0, 0, 2048, 1536);
  g.drawImage(wallArt('sinistra'), 2048, 0, 1024, 1536);
  g.drawImage(wallArt('destra'), 3072, 0, 1024, 1536);
  const t = new THREE.CanvasTexture(A); t.colorSpace = THREE.SRGBColorSpace; t.flipY = true; t.anisotropy = 8; return t;
}

// ---------------- composizione texture ----------------
const PX = 900; // pixel per metro
function panelCanvas(name, max = 2048) {
  const p = PANELS[name]; let w = p.w * PX, h = p.h * PX;
  const s = Math.min(1, max / Math.max(w, h)); w = Math.round(w * s); h = Math.round(h * s);
  const c = document.createElement('canvas'); c.width = Math.max(8, w); c.height = Math.max(8, h); return c;
}
function setPanel(name, c) {
  const m = panelMats[name]; if (!m) return;
  if (m.map) m.map.dispose();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = 8;
  m.map = t; m.color.set('#ffffff'); m.needsUpdate = true;
}
function drawContain(g, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const s = Math.min(w / iw, h / ih); const dw = iw * s, dh = ih * s;
  g.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
function drawCover(g, img, w, h) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const s = Math.max(w / iw, h / ih); g.drawImage(img, (w - iw * s) / 2, (h - ih * s) / 2, iw * s, ih * s);
}
function fitText(g, text, maxW, maxH, weight = 600, family) {
  family = family || state.font || 'DM Sans';
  let size = maxH; g.font = `${weight} ${size}px "${family}", system-ui, sans-serif`;
  while (g.measureText(text).width > maxW && size > 6) { size *= 0.94; g.font = `${weight} ${size}px "${family}", system-ui, sans-serif`; }
  return size;
}
function brandWord(g, x, y, w, h, color) {
  const t = state.brand || 'Il tuo brand';
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  fitText(g, t, w, h * 0.6, 700); g.fillText(t, x + w / 2, y + h / 2);
}

// ---------------- motore delle grafiche: aree, semi, blocchi ----------------
// Ogni area ha un seme: 0 = proposta di partenza. ↻ cambia il seme di un'area,
// Rigenera cambia quelli delle aree non bloccate scegliendo la combinazione migliore.
function rng(seed) { let a = (seed * 2654435761) >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const AREAS = [
  { id: 'colori', nome: 'Colori', regen: true },
  { id: 'logo', nome: 'Logo', regen: false },
  { id: 'banner', nome: 'Banner', regen: true },
  { id: 'cassa', nome: 'Fronte cassa', regen: true },
  { id: 'alzate', nome: 'Banchi laterali', regen: true },
  { id: 'nicchie', nome: 'Nicchie', regen: true },
  { id: 'pareti', nome: 'Pareti stampate', regen: true },
];
// motivi pensati per i pannelli a zig-zag: campiture orizzontali, sfumature verticali, niente diagonali
// dal più semplice: tutte le pareti in un colore, fondo e laterali diversi, sfumatura dall'alto, due fasce larghe
const WALL_STYLES = ['fascia-sf', 'sf-chiaro', 'sf-base', 'fondo-sf', 'fascia-base', 'sf-due'];
state.seeds = { colori: 0, logo: 0, banner: 0, cassa: 0, alzate: 0, nicchie: 0, pareti: 0 };
state.locks = { colori: false, logo: false, banner: false, cassa: false, alzate: false, nicchie: false, pareti: false };
state.history = []; state.seen = new Set();

// palette armonica: se il sito dà pochi colori, li ricavo dal primario
function hsl2hex(h, s, l) { h = ((h % 360) + 360) % 360; const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return rgbToHex([f(0) * 255, f(8) * 255, f(4) * 255]); }
function hexToHsl(hex) { let [r, g, b] = hexToRgb(hex).map(v => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; let h = 0; const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)); if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; }
function harmony(P) {
  const [h, s, l] = hexToHsl(P), sat = Math.max(0.35, s);
  const out = [];
  if (s < 0.15) out.push('#e8e2d6', '#c9a686', '#d9442b', '#2f4b3a'); // primario neutro (nero, grigio): neutro caldo, cartone, un rosso, un verde
  else out.push(hsl2hex(h, sat * 0.9, Math.min(0.92, l + 0.35)), hsl2hex(h, sat, Math.max(0.14, l - 0.25)), hsl2hex(h + 180, sat * 0.85, 0.5), hsl2hex(h + 35, sat * 0.8, 0.55), '#efe9df');
  return out;
}
// colori del brand prima di tutto; quelli armonici solo per completare una palette povera
function colorPool() {
  const C = state.colors, add = (list, h) => { if (h && list.every(x => dist(hexToRgb(x), hexToRgb(h)) > 45)) list.push(h); };
  const brand = []; for (const h of [C.primary, C.secondary, C.accent, ...(state.palette || [])]) add(brand, h);
  const pool = brand.slice(0, 6);
  if (pool.length < 4) for (const h of harmony(C.primary)) { add(pool, h); if (pool.length >= 4) break; }
  return pool;
}
function pickRoles(seed) {
  const C = state.colors;
  if (state.locks.colori || seed === 0) return { P: C.primary, S: C.secondary, A: C.accent };
  const r = rng(seed * 7 + 3), pool = colorPool();
  const take = (list) => list[Math.floor(r() * list.length)];
  const P = r() < 0.5 ? C.primary : take(pool.slice(0, 3)); // il primario del brand resta protagonista
  const S = take(pool.filter(h => dist(hexToRgb(h), hexToRgb(P)) > 60)) || C.secondary;
  const A = take(pool.filter(h => dist(hexToRgb(h), hexToRgb(P)) > 60 && dist(hexToRgb(h), hexToRgb(S)) > 60)) || C.accent;
  return { P, S, A };
}
const opt = (list, seed) => list[((seed % list.length) + list.length) % list.length];
function computeDesign(seeds = state.seeds) {
  const R = pickRoles(seeds.colori);
  const colorful = state.logo && logoInfo(state.logo).colorful;
  const col = (k) => k === 'bianco' ? '#ffffff' : k === 'scuro' ? mix(R.P, '#000000', 0.55) : R[k];
  const bannerList = colorful ? ['bianco', 'P', 'S', 'scuro', 'A'] : ['P', 'bianco', 'scuro', 'S', 'A'];
  const cassaList = [['bianco', 'A'], ['P', 'A'], ['bianco', 'P'], ['S', 'P'], ['bianco', null]];
  const nPh = (state.photos || []).length;
  // niente scritte o loghi sopra le foto: le foto del sito hanno spesso già grafiche dentro
  const alzStyles = state.userPhotos ? ['foto-piena'] : nPh >= 1 ? ['galleria', 'testo', 'logo', 'blocchi'] : ['testo', 'logo', 'blocchi'];
  const [cBg, cStripe] = opt(cassaList, seeds.cassa);
  const r = rng(seeds.pareti * 13 + 1), rolesW = [R.P, R.S, R.A];
  const pairs = [[R.P, R.S], [R.P, R.A], [R.S, R.P], [R.A, R.P], [R.S, R.A]];
  const pr = opt(pairs, Math.floor(seeds.pareti / WALL_STYLES.length)); const wr = [pr[0], pr[1], R.A];
  return {
    R,
    banner: col(opt(bannerList, seeds.banner)),
    cassa: { bg: col(cBg), stripe: cStripe ? R[cStripe] : null, legno: { P: R.P, S: R.S, A: R.A }[state.crate] || null },
    alzate: { foto: seeds.alzate, style: opt(alzStyles, seeds.alzate), bg: opt([R.S, R.P, R.A], Math.floor(seeds.alzate / alzStyles.length)), piani: opt([R.P, R.S, '#2a2a2a'], Math.floor(seeds.alzate / 2)) },
    nicchie: opt(['alterne', 'sfumate', 'una', 'duo'], seeds.nicchie),
    pareti: { style: opt(WALL_STYLES, seeds.pareti), c: wr, band: R.P },
  };
}
// punteggio di una combinazione: leggibilità, varietà, niente superfici che si confondono
function scoreDesign(D) {
  let s = 0;
  const near = (a, b) => dist(hexToRgb(a), hexToRgb(b)) < 40;
  if (state.walls === 'stampa' && near(D.banner, D.pareti.band)) s -= 3;
  if (near(D.alzate.piani, D.alzate.bg)) s -= 1.5;
  if (near(D.cassa.bg, '#c49a68')) s -= 2; // cassa che sparisce nel legno
  const surf = [D.banner, D.cassa.bg, D.alzate.bg, D.alzate.piani, ...(state.walls === 'stampa' ? D.pareti.c : [])];
  const dark = surf.filter(h => lum(h) < 0.05).length / surf.length;
  if (dark > 0.6) s -= 2.5;
  const uniq = []; for (const h of surf) if (uniq.every(u => !near(u, h))) uniq.push(h);
  if (uniq.length < 2) s -= 1; else if (uniq.length <= 4) s += 1; else s -= 1;
  if (state.logo) { const L = logoInfo(state.logo); if (legibility(L, D.banner) >= 0.6) s += 1; } // logo originale leggibile sul banner
  return s;
}
const sig = (seeds) => AREAS.map(a => a.id + seeds[a.id]).join('|');
function rigeneraTutto() {
  state.history.push({ ...state.seeds }); state.seen.add(sig(state.seeds));
  let best = null, bestS = -1e9;
  for (let i = 0; i < 24; i++) {
    const s2 = { ...state.seeds };
    for (const a of AREAS) if (a.regen && !state.locks[a.id]) s2[a.id] = 1 + Math.floor(Math.random() * 997);
    if (state.seen.has(sig(s2))) continue;
    const sc = scoreDesign(computeDesign(s2)) + Math.random() * 0.3;
    if (sc > bestS) { bestS = sc; best = s2; }
  }
  if (best) state.seeds = best;
  applyAll();
}
function rigeneraArea(id) {
  if (id === 'logo') { const n = (state.logoList || []).length; if (n > 1) { state.seeds.logo = (state.seeds.logo + 1) % n; useLogo(state.logoList[state.seeds.logo]); } return; }
  state.history.push({ ...state.seeds });
  let best = null, bestS = -1e9; const cur = JSON.stringify(computeDesign()[id === 'colori' ? 'R' : id]);
  for (let i = 0; i < 12; i++) {
    const s2 = { ...state.seeds, [id]: 1 + Math.floor(Math.random() * 997) };
    const D = computeDesign(s2); if (JSON.stringify(D[id === 'colori' ? 'R' : id]) === cur) continue;
    const sc = scoreDesign(D) + Math.random() * 0.5; if (sc > bestS) { bestS = sc; best = s2; }
  }
  if (best) state.seeds = best;
  applyAll();
}
function indietro() { const p = state.history.pop(); if (p) { state.seeds = p; applyAll(); } }
function resetDesign() { state.seeds = { colori: 0, logo: 0, banner: 0, cassa: 0, alzate: 0, nicchie: 0, pareti: 0 }; state.history = []; state.seen = new Set(); }

// ---------------- leggibilità del logo ----------------
// campiono i pixel opachi del logo: luminanza e saturazione; versioni monocrome per i fondi difficili
const _logoCache = new WeakMap();
function logoInfo(img) {
  let L = _logoCache.get(img); if (L) return L;
  const W = img.width || img.naturalWidth, H = img.height || img.naturalHeight, k = 160 / Math.max(W, H);
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(W * k)); c.height = Math.max(1, Math.round(H * k));
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height); const d = g.getImageData(0, 0, c.width, c.height).data;
  const lums = []; let sat = 0;
  for (let i = 0; i < d.length; i += 8) { if (d[i + 3] < 100) continue; lums.push(lum(rgbToHex([d[i], d[i + 1], d[i + 2]]))); const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]); sat += (mx - mn) / 255; }
  const mono = (hex) => { const o = document.createElement('canvas'); o.width = W; o.height = H; const og = o.getContext('2d'); og.drawImage(img, 0, 0); og.globalCompositeOperation = 'source-in'; og.fillStyle = hex; og.fillRect(0, 0, W, H); return o; };
  const dk = lums.filter(l => l < 0.12).length / Math.max(1, lums.length), lt = lums.filter(l => l > 0.5).length / Math.max(1, lums.length);
  // quanto del logo è di un solo colore: se quasi tutto, si può ricolorare; altrimenti va su placca
  const bins = new Map(); let nOp = 0;
  for (let i = 0; i < d.length; i += 8) { if (d[i + 3] < 100) continue; nOp++; const k2 = (d[i] >> 5) << 6 | (d[i + 1] >> 5) << 3 | (d[i + 2] >> 5); bins.set(k2, (bins.get(k2) || 0) + 1); }
  const top = Math.max(0, ...bins.values()) / Math.max(1, nOp);
  // bollino: logo che riempie quasi tutto il suo riquadro (ha già un fondo proprio, es. De Cecco)
  let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0, op = 0;
  for (let yy = 0; yy < c.height; yy++) for (let xx = 0; xx < c.width; xx++) if (d[(yy * c.width + xx) * 4 + 3] > 100) { op++; if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
  const fillRatio = op / Math.max(1, (x1 - x0 + 1) * (y1 - y0 + 1));
  L = { lums, colorful: lums.length ? sat / lums.length > 0.25 : false, twoTone: dk > 0.12 && lt > 0.12, monoOk: top >= 0.8, badge: fillRatio > 0.72, ar: W / H, white: mono('#ffffff'), black: mono('#161616') };
  _logoCache.set(img, L); return L;
}
function legibility(L, bg) { const b = lum(bg); if (!L.lums.length) return 0; let ok = 0; for (const l of L.lums) if (contrast(l, b) >= 3) ok++; return ok / L.lums.length; }
// disegna il logo su un fondo garantendo la lettura:
// originale se si legge; se monocolore lo ricoloro bianco o nero; se a due toni (es. BMW) gli metto dietro una placca
function drawLogo(g, bg, x, y, w, h, onPhoto = false) {
  if (!state.logo) return false;
  const L = logoInfo(state.logo);
  if (L.badge || (!onPhoto && legibility(L, bg) >= 0.7)) { drawContain(g, state.logo, x, y, w, h); return true; }
  if (L.monoOk && !L.twoTone) { const m = onPhoto || contrast(lum(bg), 1) >= contrast(lum(bg), lum('#161616')) ? L.white : L.black; drawContain(g, m, x, y, w, h); return true; }
  // placca chiara o scura, quella su cui il logo originale si legge meglio e che si stacca dal fondo
  const plate = legibility(L, '#ffffff') + (contrast(lum(bg), 1) > 1.4 ? 0.15 : 0) >= legibility(L, '#161616') ? '#ffffff' : '#161616';
  const iw = state.logo.width || state.logo.naturalWidth, ih = state.logo.height || state.logo.naturalHeight;
  const k = Math.min(w / iw, h / ih) * 0.82, dw = iw * k, dh = ih * k, cx = x + w / 2, cy = y + h / 2, pad = Math.min(dw, dh) * 0.14;
  g.fillStyle = plate; g.beginPath();
  if (L.ar > 0.85 && L.ar < 1.18) g.arc(cx, cy, Math.max(dw, dh) / 2 + pad, 0, Math.PI * 2);
  else { const rw = dw + pad * 2, rh = dh + pad * 2, r = Math.min(rw, rh) * 0.2; g.roundRect(cx - rw / 2, cy - rh / 2, rw, rh, r); }
  g.fill(); g.drawImage(state.logo, cx - dw / 2, cy - dh / 2, dw, dh); return true;
}
// il logo da usare su un certo fondo: originale se si legge, altrimenti bianco o nero
function logoOn(bg) {
  if (!state.logo) return null; const L = logoInfo(state.logo);
  if (legibility(L, bg) >= 0.7) return state.logo;
  return contrast(lum(bg), 1) >= contrast(lum(bg), lum('#161616')) ? L.white : L.black;
}

let _raf = 0;
function applyAll() { if (_raf) return; _raf = setTimeout(() => { _raf = 0; render(); }, 0); }
function render() {
  if (!model) return;
  const D = computeDesign(); state.design = D; const R = D.R;
  // banner in alto (logo_3)
  {
    const c = panelCanvas('logo_3'), g = c.getContext('2d');
    g.fillStyle = D.banner; g.fillRect(0, 0, c.width, c.height);
    if (!drawLogo(g, D.banner, c.width * 0.08, c.height * 0.16, c.width * 0.84, c.height * 0.68)) brandWord(g, c.width * 0.08, 0, c.width * 0.84, c.height, readable(D.banner));
    setPanel('logo_3', c);
  }
  // fronte cassa (logo_1)
  {
    const c = panelCanvas('logo_1'), g = c.getContext('2d'), bg = D.cassa.bg;
    g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
    const tagH = state.tagline ? c.height * 0.16 : 0;
    if (!drawLogo(g, bg, c.width * 0.14, c.height * 0.14, c.width * 0.72, c.height * 0.62 - tagH * 0.3)) brandWord(g, c.width * 0.1, c.height * 0.1, c.width * 0.8, c.height * 0.6, readable(bg));
    if (state.tagline) {
      const ink = bg === '#ffffff' && contrast(lum(R.P), lum(bg)) >= 3 ? R.P : readable(bg);
      g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
      fitText(g, state.tagline, c.width * 0.84, tagH * 0.75, 600, state.font); g.fillText(state.tagline, c.width / 2, c.height * 0.84);
    }
    if (D.cassa.stripe) { g.fillStyle = D.cassa.stripe; g.fillRect(0, c.height * 0.965, c.width, c.height * 0.035); }
    setPanel('logo_1', c);
  }
  // bordo superiore cassa e piani dei banchi
  for (const n of ['logo_2', 'banco_1', 'banco_3']) {
    const c = panelCanvas(n, 64), g = c.getContext('2d'); g.fillStyle = n === 'logo_2' ? (D.cassa.stripe || R.P) : D.alzate.piani; g.fillRect(0, 0, c.width, c.height); setPanel(n, c);
  }
  // alzate dei banchi laterali: pannelli piani, qui foto e scritte reggono
  for (const n of ['banco_2', 'banco_4']) {
    const c = panelCanvas(n), g = c.getContext('2d'); const W = c.width, H = c.height;
    const msg = (state.tagline || state.brand || '').toUpperCase();
    const { style, bg } = D.alzate;
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    let ink = readable(bg);
    if (style === 'foto' && state.hero) { drawCover(g, state.hero, W, H); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, W, H); ink = '#ffffff'; }
    if (style === 'foto-piena') {
      // foto caricata dall'utente: a tutto banner, niente sopra. Il ↻ cambia foto (se più d'una) e inquadratura
      const up = state.userPhotos, k = D.alzate.foto, img = up[(k + (n === 'banco_4' ? 1 : 0)) % up.length];
      const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, sc = Math.max(W / iw, H / ih), dh = ih * sc, dw = iw * sc;
      const fy = [0.5, 0.3, 0.7][Math.floor(k / Math.max(1, up.length)) % 3];
      g.drawImage(img, (W - dw) / 2, -(dh - H) * fy, dw, dh);
      setPanel(n, c); continue;
    }
    if (style === 'galleria') {
      // riquadro col logo nel colore del brand + sequenza di foto del sito; ogni ↻ cambia l'ordine delle foto
      const ph = state.photos, side = n === 'banco_4' ? 1 : 0, gap = Math.round(H * 0.06), logoW = Math.round(H * 2.2);
      const cells = Math.max(2, Math.min(4, Math.floor((W - logoW) / (H * 1.6))));
      const cw = (W - logoW - gap * cells) / cells;
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      drawLogo(g, bg, H * 0.25, H * 0.15, logoW - H * 0.5, H * 0.7) || brandWord(g, 0, 0, logoW, H, readable(bg));
      for (let i = 0; i < cells; i++) {
        const img = ph[(D.alzate.foto + side * cells + i) % ph.length], x = logoW + gap + i * (cw + gap);
        g.save(); g.beginPath(); g.rect(x, 0, cw, H); g.clip(); g.translate(x, 0); drawCover(g, img, cw, H); g.restore();
      }
      setPanel(n, c); continue;
    }
    g.textBaseline = 'middle'; g.textAlign = 'left';
    const onPhoto = style === 'foto' && state.hero;
    if (style === 'blocchi') {
      const cols = [bg, R.A === bg ? R.P : R.A], nb = Math.max(1, Math.round(W / (H * 4))), bw = W / nb;
      for (let i = 0; i < nb; i++) { const cc = cols[i % 2]; g.fillStyle = cc; g.fillRect(i * bw, 0, bw + 1, H); if (msg) { g.fillStyle = readable(cc); g.textAlign = 'center'; fitText(g, msg, bw * 0.86, H * 0.4, 700); g.fillText(msg, i * bw + bw / 2, H / 2); } }
      g.textAlign = 'left';
    } else if (style === 'logo' && state.logo) {
      const uw = H * 2.4, nl = Math.max(1, Math.floor((W - H * 0.4) / uw)), off = (W - nl * uw) / 2;
      for (let i = 0; i < nl; i++) drawLogo(g, bg, off + i * uw + H * 0.3, H * 0.18, H * 1.8, H * 0.64);
    } else if (msg) {
      // sequenza testo · logo · testo … di unità intere, centrata sul pannello
      fitText(g, msg, W * 0.42, H * 0.42, 700);
      const tw = g.measureText(msg).width, gap = H * 0.9, lw = state.logo ? H * 1.3 : 0, units = [];
      let used = 0;
      for (let i = 0; ; i++) {
        const isLogo = lw && i % 2 === 1, uw2 = isLogo ? lw : tw;
        const need = used + (units.length ? gap : 0) + uw2;
        if (need > W - H * 0.6) break;
        units.push({ isLogo, w: uw2 }); used = need;
      }
      if (units.length && units[units.length - 1].isLogo && units.length > 1) { used -= units.pop().w + gap; }
      let x = (W - used) / 2;
      for (const u of units) {
        if (u.isLogo) drawLogo(g, bg, x, H * 0.2, u.w, H * 0.6, onPhoto);
        else { g.fillStyle = ink; g.fillText(msg, x, H / 2); }
        x += u.w + gap;
      }
    }
    setPanel(n, c);
  }
  // nicchie
  const pal = D.nicchie === 'una' ? [R.A] : D.nicchie === 'sfumate' ? [R.P, mix(R.P, R.S, 0.5), R.S] : D.nicchie === 'duo' ? [R.P, R.S] : [R.P, R.A, R.S];
  for (let i = 1; i <= 9; i++) { const n = 'nicchia_' + i; const c = panelCanvas(n, 64), g = c.getContext('2d'); g.fillStyle = pal[(i - 1) % pal.length]; g.fillRect(0, 0, c.width, c.height); setPanel(n, c); }
  // pareti: cartone bianco, tinta o stampa premium
  if (M.pareti.map) { M.pareti.map.dispose(); M.pareti.map = null; }
  if (state.walls === 'stampa') { M.pareti.map = wallTexture(); M.pareti.color.set('#ffffff'); M.bordo.color.set(mix(D.pareti.band, '#ffffff', 0.1)); }
  else { M.pareti.color.set(state.walls === 'tinta' ? mix(R.P, '#ffffff', 0.85) : '#ecebe6'); M.bordo.color.set(M.pareti.color); }
  M.pareti.needsUpdate = true;
  // cassa in legno (in cache) e prodotti
  M.cassa.map = woodTexture(D.cassa.legno); M.cassa.needsUpdate = true;
  M.prodotti.color.set(R.A);
  model.getObjectByName('prodotti') && (model.getObjectByName('prodotti').visible = state.products);
  syncUI();
}

// ---------------- colore ----------------
function hexToRgb(h) { h = h.replace('#', ''); if (h.length === 3) h = [...h].map(x => x + x).join(''); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function rgbToHex([r, g, b]) { return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
function lum(hex) { const [r, g, b] = hexToRgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
function contrast(a, b) { const [x, y] = a > b ? [a, b] : [b, a]; return (x + 0.05) / (y + 0.05); }
function readable(bg) { return contrast(lum(bg), 1) > contrast(lum(bg), 0.01) ? '#ffffff' : '#161616'; }
function mix(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A.map((v, i) => v + (B[i] - v) * t)); }
function shade(hex, t) { return mix(hex, t > 0 ? '#ffffff' : '#000000', Math.abs(t)); }
function imageLuminance(img) {
  const c = document.createElement('canvas'); c.width = c.height = 48; const g = c.getContext('2d');
  g.drawImage(img, 0, 0, 48, 48); const d = g.getImageData(0, 0, 48, 48).data; let s = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 128) continue; const hx = rgbToHex([d[i], d[i + 1], d[i + 2]]); s += lum(hx); n++; }
  return n ? s / n : 0.5;
}
function rgbToHsl([r, g, b]) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const l = (mx + mn) / 2; const d = mx - mn; const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)); return [s, l]; }
// palette: quantizzazione su istogramma 4 bit per canale
function extractPalette(imgs) {
  const bins = new Map();
  for (const img of imgs) {
    const c = document.createElement('canvas'); const S = 120; c.width = S; c.height = S; const g = c.getContext('2d');
    g.drawImage(img, 0, 0, S, S); const d = g.getImageData(0, 0, S, S).data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 200) continue;
      const k = (d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4);
      const b = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 }; b.n++; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2]; bins.set(k, b);
    }
  }
  const cols = [...bins.values()].map(b => ({ n: b.n, rgb: [b.r / b.n, b.g / b.n, b.b / b.n] }));
  cols.forEach(c => { const [s, l] = rgbToHsl(c.rgb); c.s = s; c.l = l; c.score = c.n * (0.25 + s) * (l > 0.93 || l < 0.06 ? 0.08 : 1); });
  cols.sort((a, b) => b.score - a.score);
  const out = [];
  for (const c of cols) { if (out.every(o => dist(o.rgb, c.rgb) > 60)) out.push(c); if (out.length >= 6) break; }
  return out.map(o => rgbToHex(o.rgb));
}
function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
// sfondo bianco -> trasparente (loghi su jpg)
function knockoutWhite(img) {
  const c = document.createElement('canvas'); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0); const id = g.getImageData(0, 0, c.width, c.height); const d = id.data;
  // solo se i bordi sono chiari
  let edge = 0, en = 0; for (let x = 0; x < c.width; x += 4) for (const y of [0, c.height - 1]) { const i = (y * c.width + x) * 4; edge += d[i] + d[i + 1] + d[i + 2]; en++; }
  if (edge / en / 3 < 235) return c;
  for (let i = 0; i < d.length; i += 4) { const m = Math.min(d[i], d[i + 1], d[i + 2]); if (m > 238) d[i + 3] = 0; else if (m > 215) d[i + 3] = Math.min(d[i + 3], (238 - m) * 11); }
  g.putImageData(id, 0, 0); return trim(c);
}
function trim(c) {
  const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 <= x0 || y1 <= y0) return c;
  const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1; o.getContext('2d').drawImage(c, -x0, -y0); return o;
}

// ---------------- import press kit ----------------
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
async function blobToImg(blob, name = '') {
  if (name.toLowerCase().endsWith('.svg') && blob.type !== 'image/svg+xml') blob = new Blob([await blob.text()], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob); const img = await loadImg(url);
  if (blob.type === 'image/svg+xml' || name.toLowerCase().endsWith('.svg')) { // rasterizza SVG ad alta risoluzione
    const w = img.naturalWidth || 800, h = img.naturalHeight || 400, s = 1600 / Math.max(w, h);
    const c = document.createElement('canvas'); c.width = w * s; c.height = h * s; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c;
  }
  return img;
}
let pdfText = '';
async function ingestPdf(buf, name) {
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const n = Math.min(doc.numPages, 10);
  for (let p = 1; p <= n; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 }); const s = 1400 / Math.max(vp.width, vp.height);
    const v2 = page.getViewport({ scale: s }); const c = document.createElement('canvas'); c.width = v2.width; c.height = v2.height;
    await page.render({ canvasContext: c.getContext('2d'), viewport: v2 }).promise;
    addCandidate(c, `${name} · p.${p}`, 'pagina');
    const tc = await page.getTextContent(); pdfText += ' ' + tc.items.map(i => i.str).join(' ');
  }
}
async function ingestFile(file) {
  const name = file.name, low = name.toLowerCase();
  if (low.endsWith('.zip')) {
    const zip = await JSZip.loadAsync(file);
    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir || path.includes('__MACOSX')) continue;
      const l = path.toLowerCase();
      if (/\.(png|jpe?g|webp|svg)$/.test(l)) { const b = await entry.async('blob'); try { addCandidate(await blobToImg(b, l), path.split('/').pop(), /logo|marchio|brand/.test(l) ? 'logo' : 'immagine'); } catch { } }
      else if (l.endsWith('.pdf')) await ingestPdf(await entry.async('arraybuffer'), path.split('/').pop());
    }
  } else if (low.endsWith('.pdf')) await ingestPdf(await file.arrayBuffer(), name);
  else if (/\.(png|jpe?g|webp|svg)$/.test(low)) addCandidate(await blobToImg(file, low), name, /logo|marchio|brand/.test(low) ? 'logo' : 'immagine');
}
function addCandidate(img, name, kind) { state.candidates.push({ img, name, kind }); }

function autoPick() {
  const cs = state.candidates; if (!cs.length) return;
  const isTransp = (img) => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 32, 32); const d = g.getImageData(0, 0, 32, 32).data; let t = 0; for (let i = 3; i < d.length; i += 4) if (d[i] < 50) t++; return t > 80; };
  let logo = cs.find(c => c.kind === 'logo') || cs.find(c => c.kind === 'immagine' && isTransp(c.img));
  if (logo) state.logo = knockoutWhite(logo.img);
  const photos = cs.filter(c => c !== logo && c.kind !== 'logo');
  const big = photos.filter(c => c.kind === 'immagine').sort((a, b) => (b.img.width * b.img.height) - (a.img.width * a.img.height))[0];
  state.hero = big ? big.img : null;
  const lp = logo ? extractPalette([state.logo]) : [];
  const op = extractPalette(cs.filter(c => c !== logo).slice(0, 6).map(c => c.img));
  const pal = [...lp, ...op.filter(h => lp.every(l => dist(hexToRgb(l), hexToRgb(h)) > 60))];
  const hexInText = [...new Set((pdfText.match(/#[0-9a-f]{6}\b/gi) || []).map(s => s.toLowerCase()))];
  const P = hexInText.length >= 2 ? hexInText.concat(pal) : pal;
  if (P[0]) state.colors.primary = P[0];
  if (P[1]) state.colors.accent = P[1];
  if (P[2]) state.colors.secondary = P[2]; else state.colors.secondary = mix(state.colors.primary, '#ffffff', 0.7);
  // il logo ha un solo colore: accento e secondario dalle immagini, il primario resta quello del logo
  state.colors.neutral = mix(state.colors.primary, '#ffffff', 0.85);
  state.palette = [...new Set(P)].slice(0, 8);
}

// ---------------- analisi sito (Cloudflare Worker) ----------------
const WORKER = (window.CONFIG && window.CONFIG.worker || '').replace(/\/$/, '');
const viaProxy = (u) => `${WORKER}/img?u=${encodeURIComponent(u)}`;
async function proxImg(u) {
  const r = await fetch(viaProxy(u)); if (!r.ok) throw new Error('img ' + r.status);
  const b = await r.blob(); return blobToImg(b, new URL(u).pathname);
}
function svgToImg(svg) {
  svg = svg.replace(/\sviewbox=/i, ' viewBox=').replace(/\spreserveaspectratio=/i, ' preserveAspectRatio=');
  const vb = svg.match(/viewBox="([\d.\s-]+)"/);
  if (vb && !/<svg[^>]*\swidth=/i.test(svg)) { const [, , w, h] = vb[1].trim().split(/\s+/).map(Number); if (w && h) { const k = 1600 / Math.max(w, h); svg = svg.replace('<svg', `<svg width="${w * k}" height="${h * k}"`); } }
  return blobToImg(new Blob([svg], { type: 'image/svg+xml' }), 'logo.svg');
}
// palette di default di WordPress e Gutenberg: non sono colori del brand
const WP_DEFAULT = new Set(['#007cba', '#006ba1', '#005a87', '#000000', '#ffffff', '#abb8c3', '#f78da7', '#cf2e2e', '#ff6900', '#fcb900', '#7bdcb5', '#00d084', '#8ed1fc', '#0693e3', '#9b51e0', '#7a00df', '#dddddd', '#32373c', '#dc3232', '#2271b1', '#3858e9', '#1e1e1e', '#757575', '#cccccc', '#00a0d2']);
const WP_DEFAULT_NAMES = /^(black|white|cyan-bluish-gray|pale-pink|vivid-red|luminous-vivid-orange|luminous-vivid-amber|light-green-cyan|vivid-green-cyan|pale-cyan-blue|vivid-cyan-blue|vivid-purple)$/;
function brandColors(d) {
  const ok = (h) => { const [s, l] = rgbToHsl(hexToRgb(h)); return s > 0.18 && l > 0.08 && l < 0.9; };
  const vars = d.cssVars || [];
  const themeVars = vars.filter(v => { const m = v.name.match(/^--wp--preset--color--(.+)$/); return m ? !WP_DEFAULT_NAMES.test(m[1]) : !/^--wp/.test(v.name) && /primary|brand|accent|main|secondary|highlight|theme|corporate|color/.test(v.name); }).map(v => v.hex);
  const counted = (d.colors || []).map(c => c.hex).filter(h => !WP_DEFAULT.has(h));
  return [...new Set([...themeVars, ...counted])].filter(ok);
}
const FRAMEWORK_COLORS = new Set(('#007aff #007bff #0d6efd #6610f2 #6f42c1 #d63384 #dc3545 #fd7e14 #ffc107 #198754 #28a745 #20c997 #0dcaf0 #17a2b8 #6c757d #343a40 #212529 #f8f9fa #337ab7 #5cb85c #5bc0de #f0ad4e #d9534f ' +
  '#2563eb #3b82f6 #1d4ed8 #60a5fa #93c5fd #bfdbfe #dbeafe #ec4899 #6366f1 #4f46e5 #8b5cf6 #10b981 #ef4444 #f59e0b #1f2937 #111827 #374151 #4b5563 #6b7280 #9ca3af #d1d5db #e5e7eb #f3f4f6 #99c2ff ' +
  '#a5dc86 #f27474 #f8bb86 #3fc3ee #87adbd #c9dae1 #3085d6 #7066e0 #2b333f #73859f ' +
  '#2196f3 #4caf50 #f44336 #ff9800 #9c27b0 #e91e63 #3f51b5 #00bcd4 #009688 #ffeb3b #795548 #607d8b ' +
  '#3b5998 #1877f2 #1da1f2 #55acee #e1306c #c13584 #0077b5 #0a66c2 #bd081c #25d366 #ffb3c7 #003087 #009cde #0070ba #ffc439 #0073ce #1863dc #68b631 #4285f4 #34a853 #fbbc05 #ea4335 #ff0000').split(' '));
function cleanName(name, host) {
  const raw = (name || '').trim();
  let n = raw.replace(/\s*[\(\[][^\)\]]*[\)\]]\s*/g, ' ')
    .replace(/\b(s\.?\s?p\.?\s?a\.?|s\.?r\.?l\.?s?|ab|gmbh|ag|inc|ltd|llc|plc|b\.?v\.?|s\.?a\.?s?)\b\.?/gi, ' ')
    .replace(/\b(uk|us|usa|eu|europe|international|official( site| website)?|sito ufficiale|online shop|shop online|store|homepage|home)\b/gi, ' ')
    .replace(/\s{2,}/g, ' ').replace(/^[\s\-–|,:·]+|[\s\-–|,:·]+$/g, '').trim();
  const label = (host || '').replace(/^www\./, '').split('.')[0].replace(/[-_]+/g, ' ');
  // se nel nome c'è la parola del dominio (BMW, Ferrari), vince quella
  const lw = label.split(' ')[0];
  const hit = raw.match(new RegExp('\\b' + lw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'));
  if (hit && n.toLowerCase() !== hit[0].toLowerCase() && (n.split(/\s+/).length > 1 && /^(il|lo|la|i|gli|le|del|della|di|da|the|of|by|le|la|der|die|das)\b/i.test(n) || n.split(/\s+/).length > 3)) return hit[0];
  if (!n || n.split(/\s+/).length > 3) {
    const first = label.split(' ')[0];
    const m = raw.match(new RegExp('\\b' + first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'));
    n = m ? m[0] : label.replace(/\b\w/g, c => c.toUpperCase());
  }
  return n;
}
function taglineIdeas(d, brand) {
  const out = [], seen = new Set(), b = (brand || '').toLowerCase();
  const push = (t) => {
    t = (t || '').replace(/\s+/g, ' ').replace(/^[\s\-–|,:·"“]+|[\s\-–|,:·"”.]+$/g, '').trim();
    const w = t.split(/\s+/).length; const k = t.toLowerCase();
    if (!t || w < 2 || w > 7 || seen.has(k) || k === b || /cookie|javascript|browser|homepage|benvenut|welcome|shop online|sito ufficiale|official|acquista|compra|shop now|buy now|scopri di più|learn more|read more|leggi|iscriviti|subscribe|newsletter|carrello|cart/i.test(t)) return;
    if (!/^[A-ZÀ-Ý0-9“"«]/.test(t)) return; // frammenti in minuscolo: congiunzioni, elenchi
    if (b && k.startsWith(b) && w <= 3) return; // tipo 'Patagonia UK'
    seen.add(k); out.push(t);
  };
  for (const src of [d.description, d.title]) for (const part of String(src || '').split(/[.!?;|–—•·]|\s-\s/)) {
    push(part); for (const sub of part.split(',')) push(sub);
  }
  return out.slice(0, 4);
}
function logoQuality(img) {
  const W = img.width || img.naturalWidth, H = img.height || img.naturalHeight; if (!W || !H) return { ok: false };
  const k = 128 / Math.max(W, H), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(W * k)); c.height = Math.max(1, Math.round(H * k));
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height).data; let op = 0, lo = 1, hi = 0, n = 0, sat = 0;
  for (let i = 0; i < d.length; i += 16) { n++; if (d[i + 3] < 40) continue; op++; const l = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255; lo = Math.min(lo, l); hi = Math.max(hi, l); const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]); sat += (mx - mn) / 255; }
  const fill = op / n, contrast = hi - lo, ar = W / H;
  // vuoto, oppure un riquadro pieno e piatto: non è un logo usabile
  const ok = fill > 0.02 && !(fill > 0.96 && contrast < 0.12);
  return { ok, fill, ar, contrast, photo: fill > 0.96 && contrast > 0.5 && sat / Math.max(1, op) > 0.25 };
}
function decidePalette(logoCols, cssCols, tc) {
  const satOk = (h) => { const [s2, l2] = rgbToHsl(hexToRgb(h)); return s2 > 0.25 && l2 > 0.1 && l2 < 0.88; };
  const darkOk = (h) => { const [, l2] = rgbToHsl(hexToRgb(h)); return l2 < 0.25; };
  const logoSat = logoCols.filter(satOk), logoDark = logoCols.filter(darkOk);
  const pool = [...logoSat, ...(tc && satOk(tc) ? [tc] : []), ...cssCols];
  const primary = logoSat[0] || (tc && satOk(tc) ? tc : null) || logoDark[0] || cssCols[0] || '#1d1d1b';
  const distinct = [primary];
  for (const h of pool) if (distinct.every(x => dist(hexToRgb(x), hexToRgb(h)) > 60)) distinct.push(h);
  return distinct;
}
async function analyzeSite() {
  let url = $('#url').value.trim(); if (!url) { setStatus('Scrivi l\'indirizzo del sito.'); return; }
  if (!WORKER) { setStatus('Servizio di lettura dei siti non configurato.'); return; }
  busy(true); resetDesign(); state.locks.colori = false; state.locks.logo = false; setStatus('Leggo il sito…'); $('#go').disabled = true;
  try {
    const r = await fetch(`${WORKER}/brand?url=${encodeURIComponent(url)}`, { cache: 'no-cache' });
    const d = await r.json(); if (!r.ok) throw new Error(d.error || r.status);
    const host = new URL(d.url).hostname;
    const ta = document.createElement('textarea'); const dec = (x) => { ta.innerHTML = x || ''; return ta.value; };
    d.name = dec(d.name); d.title = dec(d.title); d.description = dec(d.description);
    state.candidates = state.candidates.filter(c => c.src !== 'sito');
    const jobs = [], seenU = new Set(), logoC = [];
    const add = (p, name, kind, u, score = 0) => { if (u) { if (seenU.has(u)) return; seenU.add(u); } jobs.push(p.then(img => { const cd = { img, name, kind, src: 'sito', score, w: img.width || img.naturalWidth }; state.candidates.push(cd); if (kind !== 'immagine') logoC.push(cd); }).catch(() => { })); };
    if (Array.isArray(d.logos)) d.logos.forEach((l, i) => l.type === 'svg' ? add(svgToImg(l.svg), 'logo SVG', 'logo', 'svg' + i, l.score) : add(proxImg(l.url), l.alt || 'logo', 'logo', l.url, l.score));
    else { [...new Set(d.logo.svg)].forEach((s2, i) => add(svgToImg(s2), 'logo SVG', 'logo', null, 60)); d.logo.img.forEach((l) => add(proxImg(l.url), l.alt || 'logo', 'logo', l.url, 50)); if (d.logo.jsonLd) add(proxImg(d.logo.jsonLd), 'logo (dati strutturati)', 'logo', d.logo.jsonLd, 55); }
    const icons = (d.logo.icons || []).filter(i => /apple-touch|mask-icon/.test(i.rel) || /(\d{3})/.test(i.sizes || '') || /\.svg/i.test(i.url));
    icons.slice(0, 2).forEach(i => add(proxImg(i.url), 'icona del sito', 'icona', i.url, 5));
    if (d.images.og) add(proxImg(d.images.og), 'immagine di condivisione', 'immagine', d.images.og);
    d.images.photos.slice(0, 8).forEach(p => add(proxImg(p.url), p.alt || 'foto', 'immagine', p.url));
    setStatus(`Scarico logo e immagini da ${host}…`);
    await Promise.all(jobs);
    setStatus('Compongo lo stand…');
    // logo: punteggio del Worker, poi verifica visiva (vuoto, riquadro pieno, foto)
    // a parità di punteggio meglio un logo scuro e orizzontale: quelli bianchi spariscono sui pannelli chiari
    const pts = (x) => x.c.score + (x.q.ar > 1.6 ? 10 : 0) + (x.c.kind === 'icona' ? -40 : 0) - (imageLuminance(x.c.img) > 0.8 ? 25 : 0);
    const ranked = logoC.map(c => ({ c, q: logoQuality(c.img) })).filter(x => x.q.ok && !x.q.photo).sort((a, b) => pts(b) - pts(a));
    const best = ranked[0] ? ranked[0].c : null;
    state.logoList = ranked.map(x => x.c); state.seeds.logo = 0;
    state.logo = best ? knockoutWhite(best.img) : null; state.logoFrom = best;
    const photos = state.candidates.filter(c => c.src === 'sito' && c.kind === 'immagine' && (c.img.width || c.img.naturalWidth) >= 400)
      .sort((a, b) => (b.img.width * b.img.height) - (a.img.width * a.img.height));
    state.hero = photos[0] ? photos[0].img : null; state.heroFrom = photos[0] || null;
    state.photos = photos.slice(0, 8).map(c => c.img);
    // colori: prima il logo, poi theme-color e CSS senza i colori dei framework
    const cssCols = brandColors(d).filter(h => !FRAMEWORK_COLORS.has(h));
    const logoCols = state.logo ? extractPalette([state.logo]) : [];
    const tc = d.themeColor && /^#/.test(d.themeColor) ? toHex6(d.themeColor) : null;
    const distinct = decidePalette(logoCols, cssCols, tc);
    state.colors.primary = distinct[0];
    state.colors.accent = distinct[1] || mix(distinct[0], '#000000', 0.35);
    state.colors.secondary = distinct[2] || mix(distinct[0], '#ffffff', 0.65);
    state.colors.neutral = mix(state.colors.primary, '#ffffff', 0.85);
    state.palette = [...new Set([...distinct, ...logoCols, ...cssCols])].slice(0, 10);
    state.brand = cleanName(d.name, host) || state.brand;
    state.ideas = taglineIdeas(d, state.brand);
    state.tagline = state.ideas.find(t => t.split(/\s+/).length <= 6) || '';
    const gf = (d.fonts && d.fonts.google && d.fonts.google[0]) || (d.fonts && d.fonts.css && d.fonts.css[0]);
    state.font = null; if (gf) await loadGoogleFont(gf);
    applyAll();
    const nLogo = ranked.length;
    setStatus(`Letto ${host}. ${best ? 'Logo trovato' : 'Logo non trovato: uso il nome del brand'}${nLogo > 1 ? ` (altri ${nLogo - 1} in “Materiale trovato”)` : ''}.${state.font ? ' Font ' + state.font + '.' : ''}`);
  } catch (e) {
    console.error(e);
    const m = String(e.message || e);
    setStatus(/blocca/.test(m) ? 'Questo sito blocca la lettura automatica. Carica il logo o il press kit qui sotto.' : /non risponde|raggiungibile|52\d|504/.test(m) ? 'Il sito non risponde. Riprova più tardi o carica il press kit.' : 'Non riesco a leggere il sito (' + m + '). Carica il press kit.');
  } finally { $('#go').disabled = false; busy(false); }
}
function busy(on) { $('#status').classList.toggle('busy', on); }
function toHex6(h) { h = h.trim(); return /^#[0-9a-f]{3}$/i.test(h) ? '#' + [...h.slice(1)].map(c => c + c).join('') : h.slice(0, 7).toLowerCase(); }
async function loadGoogleFont(fam) {
  try {
    const l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fam).replace(/%20/g, '+')}:wght@400;500;700&display=swap`;
    document.head.append(l); await new Promise(r => { l.onload = r; l.onerror = r; setTimeout(r, 3000); });
    const f = await document.fonts.load(`700 40px "${fam}"`); if (f && f.length) state.font = fam;
  } catch { }
}

// ---------------- AI (capability sample) ----------------
let sample = null;
(async () => { try { sample = await window.claude?.use?.('sample'); } catch { sample = null; } $('#ai-row').hidden = !sample; })();

function thumbBlob(img, max = 768) {
  const s = Math.min(1, max / Math.max(img.width || img.naturalWidth, img.height || img.naturalHeight));
  const c = document.createElement('canvas'); c.width = (img.width || img.naturalWidth) * s; c.height = (img.height || img.naturalHeight) * s;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
}
async function aiDirect() {
  if (!sample) return;
  setStatus('Claude sta leggendo il brand…');
  const url = $('#url').value.trim();
  const imgs = [];
  try { const lim = await sample.limits?.(); if (lim?.images) for (const c of state.candidates.slice(0, 4)) imgs.push(await thumbBlob(c.img)); } catch { }
  const prompt = `Sei un art director di allestimenti fieristici. Devi personalizzare uno stand in cartone di 3x3 m (banner in alto 1,6x0,4 m, pannello sul fronte di una cassa in legno, due alzate laterali lunghe 2,4 m e alte 0,24 m, 9 nicchie colorate).
Dati del brand:
- sito indicato: ${url || 'nessuno'}
- testo estratto dal press kit: ${pdfText.slice(0, 6000) || 'nessuno'}
- palette estratta dalle immagini: ${(state.palette || []).join(', ') || 'nessuna'}
${imgs.length ? '- in allegato le immagini del press kit (loghi o pagine).' : ''}
Regole: usa solo informazioni che ricavi dai dati forniti. Se hai soltanto un indirizzo web senza altro materiale e non conosci con certezza l'identità visiva del brand, metti "confidence":"bassa" e lascia i colori a null. Non inventare.
Rispondi SOLO con JSON: {"brand":string|null,"tagline":string|null (max 6 parole, nella lingua del brand),"primary":"#hex"|null,"secondary":"#hex"|null,"accent":"#hex"|null,"bannerBg":"primary"|"bianco","walls":"bianco"|"tinta","crate":"naturale"|"tinta","confidence":"alta"|"media"|"bassa","note":string (una frase in italiano)}`;
  try {
    const res = await sample.json(prompt, imgs.length ? { images: imgs } : {});
    if (res.brand) state.brand = res.brand;
    if (res.tagline) state.tagline = res.tagline;
    for (const k of ['primary', 'secondary', 'accent']) if (/^#[0-9a-f]{6}$/i.test(res[k] || '')) state.colors[k] = res[k].toLowerCase();
    state.colors.neutral = mix(state.colors.primary, '#ffffff', 0.85);
    if (res.bannerBg) state.bannerBg = res.bannerBg;
    if (res.walls) state.walls = res.walls;
    if (res.crate) state.crate = res.crate;
    applyAll();
    setStatus(`Proposta di Claude (affidabilità ${res.confidence || '—'}). ${res.note || ''}`);
  } catch (e) {
    setStatus(e?.code === 'not_granted' ? 'Accesso a Claude non concesso: proposta automatica non disponibile.' : 'Claude non ha risposto, riprova tra poco.');
  }
}

function useLogo(cd) {
  if (!cd) return; state.logo = knockoutWhite(cd.img); state.logoFrom = cd;
  const i = (state.logoList || []).indexOf(cd); if (i >= 0) state.seeds.logo = i;
  const lc = extractPalette([state.logo]); if (lc.length) state.palette = [...new Set([...lc, ...(state.palette || [])])].slice(0, 10);
  applyAll();
}
// ---------------- UI ----------------
function setStatus(t) { $('#status').textContent = t; }
// quale colore va su quale parte, per area
function areaSwatches(id, D) {
  const R = D.R;
  if (id === 'colori') return [R.P, R.S, R.A];
  if (id === 'banner') return [D.banner];
  if (id === 'cassa') return [D.cassa.bg, D.cassa.stripe].filter(Boolean);
  if (id === 'alzate') return [D.alzate.bg, D.alzate.piani];
  if (id === 'nicchie') return D.nicchie === 'una' ? [R.A] : D.nicchie === 'duo' ? [R.P, R.S] : [R.P, R.A, R.S];
  if (id === 'pareti') return state.walls === 'stampa' ? D.pareti.c : [];
  return [];
}
const AREA_NOTE = { colori: 'primario · secondario · accento', logo: '', banner: '', cassa: '', alzate: 'alzata · piano', nicchie: '', pareti: '' };
function addLogoFiles(files) {
  for (const f of files) blobToImg(f, f.name).then(img => { const cd = { img, name: f.name, kind: 'logo', src: 'utente', score: 999 }; state.candidates.unshift(cd); (state.logoList = state.logoList || []).unshift(cd); useLogo(cd); applyAll(); });
}
function addPhotoFiles(files) {
  Promise.all([...files].map(f => blobToImg(f, f.name).then(img => { state.candidates.push({ img, name: f.name, kind: 'immagine', src: 'utente' }); return img; }).catch(() => null))).then(imgs => {
    imgs = imgs.filter(Boolean); if (!imgs.length) return;
    state.userPhotos = [...imgs, ...(state.userPhotos || [])]; state.photos = [...state.userPhotos]; state.seeds.alzate = 0; state.locks.alzate = false; applyAll();
  });
}
function renderAreas() {
  const box = $('#areas'); if (!box || !state.design) return; box.innerHTML = '';
  for (const a of AREAS) {
    const row = document.createElement('div'); row.className = 'area' + (state.focus === a.id ? ' focus' : ''); row.dataset.area = a.id;
    const name = document.createElement('span'); name.className = 'aname'; name.textContent = a.nome;
    const sw = document.createElement('span'); sw.className = 'sw';
    if (a.id === 'logo') { if (state.logo) { const c = document.createElement('canvas'); c.width = 60; c.height = 20; drawContain(c.getContext('2d'), state.logo, 0, 0, 60, 20); sw.append(c); } else sw.textContent = '—'; }
    else if (a.id === 'pareti' && state.walls !== 'stampa') { sw.textContent = 'attiva “Stampate ★”'; sw.className = 'sw off'; }
    else for (const h of areaSwatches(a.id, state.design)) { const i = document.createElement('i'); i.style.background = h; i.title = h; sw.append(i); }
    const rg = document.createElement('button'); rg.className = 'ic'; rg.textContent = '↻'; rg.title = a.id === 'logo' ? 'Prova il logo successivo' : 'Rigenera solo questa parte';
    rg.disabled = state.locks[a.id] || (a.id === 'logo' && (state.logoList || []).length < 2) || (a.id === 'pareti' && state.walls !== 'stampa');
    rg.onclick = () => rigeneraArea(a.id);
    const lk = document.createElement('button'); lk.className = 'ic' + (state.locks[a.id] ? ' on' : ''); lk.textContent = state.locks[a.id] ? '🔒' : '🔓'; lk.title = state.locks[a.id] ? 'Bloccata: Rigenera non la cambia' : 'Blocca questa parte';
    lk.onclick = () => { state.locks[a.id] = !state.locks[a.id]; renderAreas(); };
    if (a.id === 'logo' || a.id === 'alzate') {
      const up = document.createElement('button'); up.className = 'ic'; up.textContent = '+'; up.title = a.id === 'logo' ? 'Carica un tuo logo' : 'Carica tue foto per i banchi laterali';
      up.onclick = () => $(a.id === 'logo' ? '#up-logo' : '#up-foto').click(); row.classList.add('has-up'); row.append(name, sw, up, rg, lk);
    } else row.append(name, sw, rg, lk);
    box.append(row);
  }
}
// clic sul modello: quale area è
const MESH_AREA = (n) => n.startsWith('logo_3') ? 'banner' : n.startsWith('logo_') ? 'cassa' : n.startsWith('banco_') ? 'alzate' : n.startsWith('nicchia_') ? 'nicchie' : n.startsWith('pareti') ? 'pareti' : n === 'cassa' || n === 'ruote' ? 'cassa' : null;
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let downAt = null;
canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5 || !model) return;
  const r = canvas.getBoundingClientRect(); ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ptr, camera); const hit = ray.intersectObject(model, true).find(h => h.object.visible && MESH_AREA(h.object.name));
  const pop = $('#pop');
  if (!hit) { pop.hidden = true; state.focus = null; renderAreas(); return; }
  const id = MESH_AREA(hit.object.name); state.focus = id; renderAreas();
  const a = AREAS.find(x => x.id === id);
  pop.innerHTML = ''; const t = document.createElement('b'); t.textContent = a.nome;
  const rg = document.createElement('button'); rg.textContent = '↻ Rigenera'; rg.disabled = state.locks[id] || (id === 'pareti' && state.walls !== 'stampa'); rg.onclick = () => { rigeneraArea(id); };
  const lk = document.createElement('button'); lk.textContent = state.locks[id] ? '🔒 Sblocca' : '🔓 Blocca'; lk.onclick = () => { state.locks[id] = !state.locks[id]; pop.hidden = true; renderAreas(); };
  pop.append(t, rg, lk);
  if (id === 'pareti' && state.walls !== 'stampa') { const p = document.createElement('small'); p.textContent = 'Attiva “Stampate ★” per personalizzarle'; pop.append(p); }
  const mr = canvas.parentElement.getBoundingClientRect();
  pop.style.left = Math.min(mr.width - 230, e.clientX - mr.left + 10) + 'px'; pop.style.top = Math.max(10, e.clientY - mr.top - 20) + 'px'; pop.hidden = false;
});
function syncUI() {
  const RU = state.design ? state.design.R : { P: state.colors.primary, S: state.colors.secondary, A: state.colors.accent };
  for (const [k, h] of [['primary', RU.P], ['secondary', RU.S], ['accent', RU.A]]) { const b = document.querySelector(`.role[data-role=${k}]`); if (b) { b.querySelector('i').style.background = h; b.querySelector('span').textContent = h; } }
  $('#brand').value = state.brand; $('#tagline').value = state.tagline;
  document.querySelectorAll('[data-opt]').forEach(b => b.classList.toggle('on', state[b.dataset.opt] === b.dataset.val));
  if (state.design) for (const k of ['P', 'S', 'A']) { const b = document.querySelector(`[data-opt=crate][data-val=${k}] i`); if (b) b.style.background = state.design.R[k]; }
  $('#products').checked = state.products;
  const nv = state.history.length; $('#vn').textContent = nv === 0 ? 'Proposta' : 'Variante ' + (nv + 1); $('#prev').disabled = nv === 0;
  renderAreas();
  // logo preview
  const lp = $('#logo-prev'); lp.innerHTML = '';
  if (state.logo) { const c = document.createElement('canvas'); c.width = 240; c.height = 90; drawContain(c.getContext('2d'), state.logo, 0, 0, 240, 90); lp.append(c); } else lp.textContent = 'Nessun logo';
  // palette chips
  const pc = $('#pal'); pc.innerHTML = '';
  for (const h of []) {
    const b = document.createElement('button'); b.className = 'chip'; b.style.background = h; b.title = h + ' → clic: primario · Maiusc+clic: accento · Alt+clic: secondario';
    b.onclick = (e) => setRole(e.shiftKey ? 'accent' : e.altKey ? 'secondary' : 'primary', h);
    pc.append(b);
  }
  // candidates
  const cg = $('#cands'); cg.innerHTML = '';
  state.candidates.forEach((cd, i) => {
    const d = document.createElement('div'); d.className = 'cand';
    const c = document.createElement('canvas'); c.width = 96; c.height = 72; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 96, 72); drawContain(g, cd.img, 4, 4, 88, 64);
    const a = document.createElement('button'); a.textContent = state.logoFrom === cd ? '✓ Logo' : 'Logo'; a.className = state.logoFrom === cd ? 'sel' : '';
    a.onclick = () => { if (!(state.logoList || []).includes(cd)) (state.logoList = state.logoList || []).push(cd); useLogo(cd); };
    const b = document.createElement('button'); b.textContent = state.heroFrom === cd ? '✓ Foto' : 'Foto'; b.className = state.heroFrom === cd ? 'sel' : '';
    b.onclick = () => { state.hero = cd.img; state.heroFrom = cd; applyAll(); };
    d.classList.toggle('in-use', state.logoFrom === cd || state.heroFrom === cd);
    d.append(c, a, b); d.title = cd.name; cg.append(d);
  });
  $('#cands-wrap').hidden = !state.candidates.length;
  $('#cands-n').textContent = state.candidates.length;
  // idee per il messaggio
  const ib = $('#ideas'); ib.innerHTML = '';
  for (const t of state.ideas || []) { const b = document.createElement('button'); b.className = 'idea' + (t === state.tagline ? ' sel' : ''); b.textContent = t; b.onclick = () => { state.tagline = t; applyAll(); }; ib.append(b); }
}

$('#files').addEventListener('change', async (e) => { await handleFiles([...e.target.files]); e.target.value = ''; });
const drop = $('#drop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', async (e) => { e.preventDefault(); drop.classList.remove('over'); await handleFiles([...e.dataTransfer.files]); });
async function handleFiles(files) {
  if (!files.length) return;
  setStatus('Leggo il press kit…');
  for (const f of files) { try { await ingestFile(f); } catch (err) { console.error(err); setStatus('Non riesco a leggere ' + f.name); } }
  autoPick(); state.logoList = state.candidates.filter(c => c.kind === 'logo' || c.kind === 'immagine'); resetDesign();
  state.photos = state.candidates.filter(c => c.kind === 'immagine' && c !== state.logoFrom && (c.img.width || c.img.naturalWidth) >= 400).map(c => c.img);
  if (!state.brand) { const guess = files[0].name.replace(/\.(zip|pdf|png|jpe?g|svg|webp)$/i, '').replace(/[-_]+/g, ' ').replace(/press ?kit|brand ?book|logo/ig, '').trim(); if (guess) state.brand = guess.replace(/\b\w/g, m => m.toUpperCase()); }
  applyAll();
  setStatus(`${state.candidates.length} immagini trovate. Controlla logo e colori${sample ? ', oppure chiedi una proposta a Claude' : ''}.`);
}
$('#url').addEventListener('change', () => {
  const u = $('#url').value.trim(); if (!u) return;
  try { const host = new URL(u.startsWith('http') ? u : 'https://' + u).hostname.replace(/^www\./, ''); if (!state.brand) { state.brand = host.split('.')[0].replace(/\b\w/g, m => m.toUpperCase()); applyAll(); } } catch { }
});
$('#ai').addEventListener('click', aiDirect);
$('#up-logo').addEventListener('change', (e) => { addLogoFiles([...e.target.files]); e.target.value = ''; });
$('#up-foto').addEventListener('change', (e) => { addPhotoFiles([...e.target.files]); e.target.value = ''; });
$('#go').addEventListener('click', analyzeSite);
$('#regen').addEventListener('click', rigeneraTutto);
$('#prev').addEventListener('click', indietro);
$('#url').addEventListener('keydown', (e) => { if (e.key === 'Enter') analyzeSite(); });
function setRole(k, hex) {
  // congelo i colori attualmente in uso, poi cambio solo il ruolo scelto
  const R = state.design ? state.design.R : null;
  if (R) state.colors = { ...state.colors, primary: R.P, secondary: R.S, accent: R.A };
  state.colors[k] = hex; state.colors.neutral = mix(state.colors.primary, '#ffffff', 0.85);
  state.locks.colori = true; state.seeds.colori = 0; applyAll();
}
// scelta del colore di un ruolo: palette del sito, colori suggeriti, + per uno nuovo
let roleOpen = null;
function openRole(btn) {
  const k = btn.dataset.role, pop = $('#rolepop'); roleOpen = k; pop.innerHTML = '';
  const sec = (title, list) => { if (!list.length) return; const h = document.createElement('div'); h.className = 'rp-t'; h.textContent = title; pop.append(h); const row = document.createElement('div'); row.className = 'rp-row';
    for (const hex of list) { const b = document.createElement('button'); b.className = 'chip'; b.style.background = hex; b.title = hex; b.onclick = () => { setRole(k, hex); pop.hidden = true; }; row.append(b); } pop.append(row); };
  const site = [...new Set(state.palette || [])];
  sec('Colori del sito', site);
  sec('Suggeriti', harmony(state.colors.primary).filter(h => site.every(x => dist(hexToRgb(x), hexToRgb(h)) > 30)));
  const add = document.createElement('button'); add.className = 'rp-add'; add.textContent = '+ Nuovo colore';
  add.onclick = () => { const i = $('#custom-color'); i.value = btn.querySelector('span').textContent || '#000000'; i.click(); };
  pop.append(add);
  const r = btn.getBoundingClientRect(), a = $('aside').getBoundingClientRect();
  pop.style.left = (r.left - a.left) + 'px'; pop.style.top = (r.bottom - a.top + $('aside').scrollTop + 6) + 'px'; pop.hidden = false;
}
document.querySelectorAll('.role').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); const p = $('#rolepop'); if (!p.hidden && roleOpen === b.dataset.role) { p.hidden = true; return; } openRole(b); }));
$('#custom-color').addEventListener('input', (e) => { if (!roleOpen) return; const h = e.target.value; state.palette = [...new Set([...(state.palette || []), h])]; setRole(roleOpen, h); });
$('#custom-color').addEventListener('change', () => { $('#rolepop').hidden = true; });
document.addEventListener('click', (e) => { const p = $('#rolepop'); if (!p.hidden && !p.contains(e.target)) p.hidden = true; });
$('#brand').addEventListener('input', (e) => { state.brand = e.target.value; applyAll(); });
$('#tagline').addEventListener('input', (e) => { state.tagline = e.target.value; applyAll(); });
document.querySelectorAll('[data-opt]').forEach(b => b.addEventListener('click', () => { state[b.dataset.opt] = b.dataset.val; applyAll(); }));
$('#products').addEventListener('change', (e) => { state.products = e.target.checked; applyAll(); });
$('#reset').addEventListener('click', () => {
  resetDesign(); state.locks = Object.fromEntries(Object.keys(state.locks).map(k => [k, false])); state.logoList = [];
  state.photos = []; state.userPhotos = null;
  Object.assign(state, { font: null, ideas: [], logoFrom: null, heroFrom: null, brand: '', tagline: '', logo: null, hero: null, candidates: [], palette: [], walls: 'bianco', crate: 'naturale', bannerBg: 'auto' });
  state.colors = { primary: '#1d1d1b', secondary: '#c9a686', accent: '#e85d2a', neutral: '#f4f2ee' }; pdfText = ''; $('#url').value = ''; applyAll(); setStatus('');
});
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
  const v = { front: [0, 1.6, 6.8], iso: [3.6, 3.1, 6.4], side: [6.5, 1.8, 1.5], top: [0.01, 8, 2] }[b.dataset.view];
  camera.position.set(...v); controls.target.set(0, 1.05, 0);
}));
// screenshot
let downloads = null;
(async () => { try { downloads = await window.claude?.use?.('downloads'); } catch { } $('#shot').hidden = false; })();
$('#shot').addEventListener('click', async () => {
  renderer.render(scene, camera);
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  const filename = `stand-${(state.brand || 'brand').toLowerCase().replace(/\W+/g, '-')}.png`;
  if (downloads) { try { await downloads.save({ filename, data: blob }); } catch (e) { setStatus('Salvataggio annullato.'); } return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.append(a); a.click(); a.remove();
});

function loop() { controls.update(); renderer.render(scene, camera); requestAnimationFrame(loop); }
resize(); loop();
document.fonts?.ready?.then(() => applyAll());
document.fonts?.load?.("700 40px \"DM Sans\"").then(() => applyAll()).catch(() => {});
window.__state = state; window.__apply = applyAll; window.__three = { scene, camera, controls };
