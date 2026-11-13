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

function woodTexture(tint) {
  const W = 1024, H = 1024, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const base = tint ? mix(tint, '#b98a57', 0.35) : '#c49a68';
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

// ---------------- varianti (tasto Rigenera) ----------------
// variante 0 = proposta di partenza; ogni Rigenera cambia ruoli dei colori e disegni.
function rng(seed) { let a = (seed * 2654435761) >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const WALL_STYLES = ['blocchi', 'fasce', 'sfumatura', 'diagonale', 'chevron', 'tinta'];
function variant() {
  const v = state.variant || 0, r = rng(v + 1);
  const base = [state.colors.primary, state.colors.secondary, state.colors.accent];
  const extra = (state.palette || []).filter(h => base.every(b => dist(hexToRgb(b), hexToRgb(h)) > 50));
  if (v === 0) return { P: base[0], S: base[1], A: base[2], wall: 'blocchi', alzata: 'testo', nicchie: 'alterne' };
  const pool = [...base, ...extra.slice(0, 2)];
  const pick = () => pool.splice(Math.floor(r() * pool.length), 1)[0];
  const P = v % 3 === 0 ? base[0] : pick(); const rest = pool.filter(h => h !== P);
  const S = rest[Math.floor(r() * rest.length)] || base[1]; const A = rest.filter(h => h !== S)[Math.floor(r() * Math.max(1, rest.length - 1))] || base[2];
  return { P, S, A, wall: WALL_STYLES[v % WALL_STYLES.length], alzata: ['testo', 'logo', 'blocchi'][Math.floor(r() * 3)], nicchie: ['alterne', 'sfumate', 'una'][Math.floor(r() * 3)] };
}

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
  const V = variant(), W = c.width, H = c.height, style = V.wall;
  const cols = kind === 'fondo' ? [V.P, V.S, V.A] : kind === 'sinistra' ? [V.S, V.A, V.P] : [V.S, V.P, V.A];
  const [a, b, d] = cols;
  if (style === 'tinta') { g.fillStyle = kind === 'fondo' ? a : b; g.fillRect(0, 0, W, H); }
  else if (style === 'blocchi') { g.fillStyle = a; g.fillRect(0, 0, W, H); g.fillStyle = b; g.fillRect(0, H * 0.58, W, H * 0.42); g.fillStyle = d; g.fillRect(0, H * 0.55, W, H * 0.03); }
  else if (style === 'fasce') { const n = 5; for (let i = 0; i < n; i++) { g.fillStyle = [a, b, a, d, b][i]; g.fillRect(0, (H / n) * i, W, H / n + 1); } }
  else if (style === 'sfumatura') { const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, a); gr.addColorStop(0.55, mix(a, b, 0.5)); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
  else if (style === 'diagonale') { g.fillStyle = a; g.fillRect(0, 0, W, H); g.fillStyle = b; g.beginPath(); g.moveTo(0, H * 0.35); g.lineTo(W, H * 0.8); g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill(); g.strokeStyle = d; g.lineWidth = 36; g.beginPath(); g.moveTo(0, H * 0.35); g.lineTo(W, H * 0.8); g.stroke(); }
  else if (style === 'chevron') { g.fillStyle = a; g.fillRect(0, 0, W, H); const step = 220; for (let y = H * 0.25, i = 0; y < H + step; y += step, i++) { g.strokeStyle = i % 2 ? d : b; g.lineWidth = 70; g.beginPath(); for (let x = -step, k = 0; x <= W + step; x += step / 2, k++) g.lineTo(x, y + (k % 2 ? -60 : 60)); g.stroke(); } }
  // fascia in alto nel colore principale: incornicia il banner
  if (kind === 'fondo') { g.fillStyle = V.P; g.fillRect(0, 0, W, H * 0.14); }
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

function applyAll() {
  if (!model) return;
  const C = state.colors;
  const logoLum = state.logo ? imageLuminance(state.logo) : 0.1;

  // banner in alto (logo_3)
  {
    const c = panelCanvas('logo_3'), g = c.getContext('2d');
    const Vb = variant();
    let bg = state.bannerBg === 'bianco' ? '#ffffff' : (state.bannerBg === 'auto' && (state.variant || 0) % 2 === 1 ? '#ffffff' : Vb.P);
    if (state.bannerBg === 'auto' && state.logo && contrast(lum(C.primary), logoLum) < 2.2) bg = '#ffffff';
    g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
    if (state.logo) drawContain(g, state.logo, c.width * 0.08, c.height * 0.16, c.width * 0.84, c.height * 0.68);
    else brandWord(g, c.width * 0.08, 0, c.width * 0.84, c.height, readable(bg));
    setPanel('logo_3', c);
  }
  // fronte cassa (logo_1)
  {
    const c = panelCanvas('logo_1'), g = c.getContext('2d');
    const crateBg = state.logo && contrast(1, logoLum) < 2.2 ? C.primary : '#ffffff';
    g.fillStyle = crateBg; g.fillRect(0, 0, c.width, c.height);
    const tagH = state.tagline ? c.height * 0.16 : 0;
    if (state.logo) drawContain(g, state.logo, c.width * 0.14, c.height * 0.14, c.width * 0.72, c.height * 0.62 - tagH * 0.3);
    else brandWord(g, c.width * 0.1, c.height * 0.1, c.width * 0.8, c.height * 0.6, C.primary);
    if (state.tagline) {
      g.fillStyle = crateBg === '#ffffff' ? C.primary : readable(crateBg); g.textAlign = 'center'; g.textBaseline = 'middle';
      fitText(g, state.tagline, c.width * 0.84, tagH * 0.75, 600, state.font); g.fillText(state.tagline, c.width / 2, c.height * 0.84);
    }
    g.fillStyle = variant().A; g.fillRect(0, c.height - c.height * 0.03, c.width, c.height * 0.03);
    setPanel('logo_1', c);
  }
  // bordo superiore cassa e piani dei banchi: tinta unita
  for (const n of ['logo_2', 'banco_1', 'banco_3']) {
    const c = panelCanvas(n, 64), g = c.getContext('2d'); g.fillStyle = n === 'logo_2' ? C.accent : C.primary; g.fillRect(0, 0, c.width, c.height); setPanel(n, c);
  }
  // alzate dei banchi laterali (banco_2, banco_4): pannelli piani, qui foto e scritte reggono
  const Va = variant();
  for (const n of ['banco_2', 'banco_4']) {
    const c = panelCanvas(n), g = c.getContext('2d'); const W = c.width, H = c.height;
    const msg = (state.tagline || state.brand || '').toUpperCase();
    const style = Va.alzata, bg = style === 'blocchi' ? Va.P : Va.S;
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    if (style === 'testo' && state.hero) { drawCover(g, state.hero, W, H); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, W, H); }
    if (style === 'blocchi') { for (let x = 0, i = 0; x < W; x += H * 3, i++) { g.fillStyle = i % 2 ? Va.A : Va.P; g.fillRect(x, 0, H * 3, H); } }
    const ink = style === 'testo' && state.hero ? '#ffffff' : readable(bg);
    g.fillStyle = ink; g.textBaseline = 'middle'; g.textAlign = 'left';
    if (style === 'logo' && state.logo) {
      const lum0 = imageLuminance(state.logo); g.globalAlpha = contrast(lum(bg), lum0) < 1.6 ? 0.25 : 1;
      for (let x = H * 0.4; x < W; x += H * 2.4) drawContain(g, state.logo, x, H * 0.18, H * 1.8, H * 0.64);
      g.globalAlpha = 1;
    } else if (msg) {
      fitText(g, msg, W * 0.55, H * 0.42, 700);
      const step = g.measureText(msg).width + H * 1.6; let x = H * 0.5, i = 0;
      while (x < W) {
        if (state.logo && i % 2 === 1 && style !== 'blocchi') { drawContain(g, state.logo, x, H * 0.2, H * 1.2, H * 0.6); x += H * 1.6; }
        else { g.fillStyle = style === 'blocchi' ? readable(i % 2 ? Va.A : Va.P) : ink; g.fillText(msg, x, H / 2); x += step; }
        i++;
      }
    }
    setPanel(n, c);
  }
  const Vn = variant();
  const pal = Vn.nicchie === 'una' ? [Vn.A] : Vn.nicchie === 'sfumate' ? [Vn.P, mix(Vn.P, Vn.S, 0.5), Vn.S] : [Vn.P, Vn.A, Vn.S];
  for (let i = 1; i <= 9; i++) {
    const n = 'nicchia_' + i; const c = panelCanvas(n, 64), g = c.getContext('2d');
    g.fillStyle = pal[(i - 1) % pal.length]; g.fillRect(0, 0, c.width, c.height); setPanel(n, c);
  }
  // pareti: cartone bianco, tinta o stampa premium
  if (M.pareti.map) { M.pareti.map.dispose(); M.pareti.map = null; }
  if (state.walls === 'stampa') { M.pareti.map = wallTexture(); M.pareti.color.set('#ffffff'); M.bordo.color.set(mix(C.primary, '#ffffff', 0.1)); }
  else { M.pareti.color.set(state.walls === 'tinta' ? mix(C.neutral, '#ffffff', 0.25) : '#ecebe6'); M.bordo.color.set(M.pareti.color); }
  M.pareti.needsUpdate = true;
  // cassa
  if (M.cassa.map) M.cassa.map.dispose();
  M.cassa.map = woodTexture(state.crate === 'tinta' ? C.secondary : null); M.cassa.needsUpdate = true;
  // prodotti
  M.prodotti.color.set(C.accent);
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
    if (!t || w < 2 || w > 7 || seen.has(k) || k === b || /cookie|javascript|browser|homepage|benvenut|welcome|shop online|sito ufficiale|official/i.test(t)) return;
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
  busy(true); state.variant = 0; setStatus('Leggo il sito…'); $('#go').disabled = true;
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
    const ranked = logoC.map(c => ({ c, q: logoQuality(c.img) })).filter(x => x.q.ok && !x.q.photo)
      .sort((a, b) => (b.c.score + (b.q.ar > 1.6 ? 10 : 0) + (b.c.kind === 'icona' ? -40 : 0)) - (a.c.score + (a.q.ar > 1.6 ? 10 : 0) + (a.c.kind === 'icona' ? -40 : 0)));
    const best = ranked[0] ? ranked[0].c : null;
    state.logo = best ? knockoutWhite(best.img) : null; state.logoFrom = best;
    const photos = state.candidates.filter(c => c.src === 'sito' && c.kind === 'immagine' && (c.img.width || c.img.naturalWidth) >= 400)
      .sort((a, b) => (b.img.width * b.img.height) - (a.img.width * a.img.height));
    state.hero = photos[0] ? photos[0].img : null; state.heroFrom = photos[0] || null;
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

// ---------------- UI ----------------
function setStatus(t) { $('#status').textContent = t; }
function syncUI() {
  for (const k of ['primary', 'secondary', 'accent']) $('#c-' + k).value = state.colors[k];
  $('#brand').value = state.brand; $('#tagline').value = state.tagline;
  document.querySelectorAll('[data-opt]').forEach(b => b.classList.toggle('on', state[b.dataset.opt] === b.dataset.val));
  $('#products').checked = state.products;
  $('#vn').textContent = (state.variant || 0) === 0 ? 'Proposta' : 'Variante ' + (state.variant + 1); $('#prev').disabled = !(state.variant > 0);
  // logo preview
  const lp = $('#logo-prev'); lp.innerHTML = '';
  if (state.logo) { const c = document.createElement('canvas'); c.width = 240; c.height = 90; drawContain(c.getContext('2d'), state.logo, 0, 0, 240, 90); lp.append(c); } else lp.textContent = 'Nessun logo';
  // palette chips
  const pc = $('#pal'); pc.innerHTML = '';
  for (const h of state.palette || []) {
    const b = document.createElement('button'); b.className = 'chip'; b.style.background = h; b.title = h + ' → clic: primario · Maiusc+clic: accento · Alt+clic: secondario';
    b.onclick = (e) => { const k = e.shiftKey ? 'accent' : e.altKey ? 'secondary' : 'primary'; state.colors[k] = h; applyAll(); };
    pc.append(b);
  }
  // candidates
  const cg = $('#cands'); cg.innerHTML = '';
  state.candidates.forEach((cd, i) => {
    const d = document.createElement('div'); d.className = 'cand';
    const c = document.createElement('canvas'); c.width = 96; c.height = 72; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 96, 72); drawContain(g, cd.img, 4, 4, 88, 64);
    const a = document.createElement('button'); a.textContent = state.logoFrom === cd ? '✓ Logo' : 'Logo'; a.className = state.logoFrom === cd ? 'sel' : '';
    a.onclick = () => { state.logo = knockoutWhite(cd.img); state.logoFrom = cd; const lc = extractPalette([state.logo]); if (lc.length) state.palette = [...new Set([...lc, ...(state.palette || [])])].slice(0, 10); applyAll(); };
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
  autoPick();
  if (!state.brand) { const guess = files[0].name.replace(/\.(zip|pdf|png|jpe?g|svg|webp)$/i, '').replace(/[-_]+/g, ' ').replace(/press ?kit|brand ?book|logo/ig, '').trim(); if (guess) state.brand = guess.replace(/\b\w/g, m => m.toUpperCase()); }
  applyAll();
  setStatus(`${state.candidates.length} immagini trovate. Controlla logo e colori${sample ? ', oppure chiedi una proposta a Claude' : ''}.`);
}
$('#url').addEventListener('change', () => {
  const u = $('#url').value.trim(); if (!u) return;
  try { const host = new URL(u.startsWith('http') ? u : 'https://' + u).hostname.replace(/^www\./, ''); if (!state.brand) { state.brand = host.split('.')[0].replace(/\b\w/g, m => m.toUpperCase()); applyAll(); } } catch { }
});
$('#ai').addEventListener('click', aiDirect);
$('#go').addEventListener('click', analyzeSite);
$('#regen').addEventListener('click', () => { state.variant = (state.variant || 0) + 1; applyAll(); });
$('#prev').addEventListener('click', () => { state.variant = Math.max(0, (state.variant || 0) - 1); applyAll(); });
$('#url').addEventListener('keydown', (e) => { if (e.key === 'Enter') analyzeSite(); });
for (const k of ['primary', 'secondary', 'accent']) $('#c-' + k).addEventListener('input', (e) => { state.colors[k] = e.target.value; state.colors.neutral = mix(state.colors.primary, '#ffffff', 0.85); applyAll(); });
$('#brand').addEventListener('input', (e) => { state.brand = e.target.value; applyAll(); });
$('#tagline').addEventListener('input', (e) => { state.tagline = e.target.value; applyAll(); });
document.querySelectorAll('[data-opt]').forEach(b => b.addEventListener('click', () => { state[b.dataset.opt] = b.dataset.val; applyAll(); }));
$('#products').addEventListener('change', (e) => { state.products = e.target.checked; applyAll(); });
$('#reset').addEventListener('click', () => {
  Object.assign(state, { variant: 0, font: null, ideas: [], logoFrom: null, heroFrom: null, brand: '', tagline: '', logo: null, hero: null, candidates: [], palette: [], walls: 'bianco', crate: 'naturale', bannerBg: 'auto' });
  state.colors = { primary: '#1d1d1b', secondary: '#c9a686', accent: '#e85d2a', neutral: '#f4f2ee' }; pdfText = ''; $('#url').value = ''; applyAll(); setStatus('');
});
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
  const v = { front: [0, 1.6, 6.8], iso: [3.6, 3.1, 6.4], side: [6.5, 1.8, 1.5], top: [0.01, 8, 2] }[b.dataset.view];
  camera.position.set(...v); controls.target.set(0, 1.05, 0);
}));
// screenshot
let downloads = null;
(async () => { try { downloads = await window.claude?.use?.('downloads'); } catch { } $('#shot').hidden = !downloads; })();
$('#shot').addEventListener('click', async () => {
  renderer.render(scene, camera);
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  try { await downloads.save({ filename: `stand-${(state.brand || 'brand').toLowerCase().replace(/\W+/g, '-')}.png`, data: blob }); } catch (e) { setStatus('Salvataggio annullato.'); }
});

function loop() { controls.update(); renderer.render(scene, camera); requestAnimationFrame(loop); }
resize(); loop();
document.fonts?.ready?.then(() => applyAll());
document.fonts?.load?.("700 40px \"DM Sans\"").then(() => applyAll()).catch(() => {});
window.__state = state; window.__apply = applyAll; window.__three = { scene, camera, controls };
