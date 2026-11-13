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
  scene.add(model);
  $('#loading').remove();
  applyAll();
}, undefined, (e) => { $('#loading').textContent = 'Errore nel caricamento del modello'; console.error(e); });

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
    let bg = state.bannerBg === 'bianco' ? '#ffffff' : C.primary;
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
      fitText(g, state.tagline, c.width * 0.8, tagH * 0.55, 500, state.font); g.fillText(state.tagline, c.width / 2, c.height * 0.84);
    }
    g.fillStyle = C.accent; g.fillRect(0, c.height - c.height * 0.03, c.width, c.height * 0.03);
    setPanel('logo_1', c);
  }
  // bordo superiore cassa e piani dei banchi: tinta unita
  for (const n of ['logo_2', 'banco_1', 'banco_3']) {
    const c = panelCanvas(n, 64), g = c.getContext('2d'); g.fillStyle = n === 'logo_2' ? C.accent : C.primary; g.fillRect(0, 0, c.width, c.height); setPanel(n, c);
  }
  // alzate dei banchi laterali (banco_2, banco_4)
  for (const n of ['banco_2', 'banco_4']) {
    const c = panelCanvas(n), g = c.getContext('2d'); const W = c.width, H = c.height;
    g.fillStyle = C.secondary; g.fillRect(0, 0, W, H);
    if (state.hero) { drawCover(g, state.hero, W, H); g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 0, W, H); }
    const ink = state.hero ? '#ffffff' : readable(C.secondary);
    const msg = (state.tagline || state.brand || '').toUpperCase();
    if (msg) {
      g.fillStyle = ink; g.textBaseline = 'middle'; g.textAlign = 'left';
      const size = fitText(g, msg, W * 0.55, H * 0.42, 700);
      const step = g.measureText(msg).width + H * 1.6; let x = H * 0.5, i = 0;
      while (x < W) {
        if (state.logo && i % 2 === 1) { drawContain(g, state.logo, x, H * 0.2, H * 1.2, H * 0.6); x += H * 1.6; }
        else { g.fillText(msg, x, H / 2); x += step; }
        i++;
      }
    }
    setPanel(n, c);
  }
  // nicchie: palette a rotazione
  const pal = [C.primary, C.accent, C.secondary];
  for (let i = 1; i <= 9; i++) {
    const n = 'nicchia_' + i; const c = panelCanvas(n, 64), g = c.getContext('2d');
    g.fillStyle = pal[(i - 1) % 3]; g.fillRect(0, 0, c.width, c.height); setPanel(n, c);
  }
  // pareti
  M.pareti.color.set(state.walls === 'tinta' ? mix(C.neutral, '#ffffff', 0.25) : '#ecebe6');
  M.bordo.color.set(M.pareti.color);
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
function svgToImg(svg) { return blobToImg(new Blob([svg], { type: 'image/svg+xml' }), 'logo.svg'); }
async function analyzeSite() {
  let url = $('#url').value.trim(); if (!url) { setStatus('Scrivi l\'indirizzo del sito.'); return; }
  if (!WORKER) { setStatus('Servizio di lettura dei siti non configurato.'); return; }
  setStatus('Leggo il sito…'); $('#go').disabled = true;
  try {
    const r = await fetch(`${WORKER}/brand?url=${encodeURIComponent(url)}`);
    const d = await r.json(); if (!r.ok) throw new Error(d.error || r.status);
    state.candidates = state.candidates.filter(c => c.src !== 'sito');
    const jobs = [], seenU = new Set();
    const add = (p, name, kind, u) => { if (u) { if (seenU.has(u)) return; seenU.add(u); } jobs.push(p.then(img => { state.candidates.push({ img, name, kind, src: 'sito', w: img.width || img.naturalWidth }); }).catch(() => { })); };
    d.logo.svg.forEach((s, i) => add(svgToImg(s), 'logo SVG ' + (i + 1), 'logo'));
    d.logo.img.forEach((l) => add(proxImg(l.url), l.alt || 'logo', 'logo', l.url));
    if (d.logo.jsonLd) add(proxImg(d.logo.jsonLd), 'logo (dati strutturati)', 'logo', d.logo.jsonLd);
    const icons = d.logo.icons.filter(i => /apple-touch|mask-icon/.test(i.rel) || /(\d{3})/.test(i.sizes || '') || /\.svg/i.test(i.url));
    icons.slice(0, 2).forEach(i => add(proxImg(i.url), 'icona', 'icona', i.url));
    if (d.images.og) add(proxImg(d.images.og), 'immagine di condivisione', 'immagine', d.images.og);
    d.images.photos.slice(0, 6).forEach(p => add(proxImg(p.url), p.alt || 'foto', 'immagine', p.url));
    await Promise.all(jobs);
    // logo: SVG > img "logo" grande > JSON-LD > icona
    const rank = (c) => (c.kind === 'logo' ? 100 : c.kind === 'icona' ? 10 : 0) + (/SVG/.test(c.name) ? 30 : 0) + Math.min(30, (c.w || 0) / 20);
    const sito = state.candidates.filter(c => c.src === 'sito');
    const logo = sito.filter(c => c.kind !== 'immagine').sort((a, b) => rank(b) - rank(a))[0];
    if (logo) state.logo = knockoutWhite(logo.img);
    const photos = sito.filter(c => c.kind === 'immagine').sort((a, b) => (b.img.width * b.img.height) - (a.img.width * a.img.height));
    state.hero = photos[0] ? photos[0].img : state.hero;
    // colori: theme-color e CSS (pesati), poi palette del logo
    const cssCols = (d.colors || []).map(c => c.hex).filter(h => { const [s, l] = rgbToHsl(hexToRgb(h)); return s > 0.18 && l > 0.08 && l < 0.9; });
    const logoCols = state.logo ? extractPalette([state.logo]) : [];
    const P = [...new Set([...(d.themeColor && /^#/.test(d.themeColor) ? [toHex6(d.themeColor)] : []), ...logoCols, ...cssCols])].filter(Boolean);
    const distinct = []; for (const h of P) if (distinct.every(x => dist(hexToRgb(x), hexToRgb(h)) > 50)) distinct.push(h);
    if (distinct[0]) state.colors.primary = distinct[0];
    state.colors.accent = distinct[1] || mix(state.colors.primary, '#000000', 0.3);
    state.colors.secondary = distinct[2] || mix(state.colors.primary, '#ffffff', 0.6);
    state.colors.neutral = mix(state.colors.primary, '#ffffff', 0.85);
    state.palette = distinct.slice(0, 8);
    state.brand = (d.name || '').trim() || state.brand;
    const desc = (d.description || '').split(/[.!?|–—]/)[0].trim();
    if (desc && desc.split(/\s+/).length <= 7) state.tagline = desc;
    // font del brand (Google Fonts)
    const gf = d.fonts && d.fonts.google && d.fonts.google[0];
    if (gf) await loadGoogleFont(gf);
    applyAll();
    setStatus(`Letto ${new URL(d.url).hostname}: ${sito.length} immagini${gf ? ', font ' + gf : ''}. Controlla logo e colori.`);
  } catch (e) {
    console.error(e); setStatus('Non riesco a leggere il sito (' + (e.message || e) + '). Prova con il press kit.');
  } finally { $('#go').disabled = false; }
}
function toHex6(h) { h = h.trim(); return /^#[0-9a-f]{3}$/i.test(h) ? '#' + [...h.slice(1)].map(c => c + c).join('') : h.slice(0, 7).toLowerCase(); }
async function loadGoogleFont(fam) {
  try {
    const l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fam).replace(/%20/g, '+')}:wght@400;500;700&display=swap`;
    document.head.append(l); await new Promise(r => { l.onload = r; l.onerror = r; setTimeout(r, 3000); });
    await document.fonts.load(`700 40px "${fam}"`); state.font = fam;
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
    const a = document.createElement('button'); a.textContent = 'Logo'; a.onclick = () => { state.logo = knockoutWhite(cd.img); applyAll(); };
    const b = document.createElement('button'); b.textContent = 'Foto'; b.onclick = () => { state.hero = cd.img; applyAll(); };
    d.append(c, a, b); d.title = cd.name; cg.append(d);
  });
  $('#cands-wrap').hidden = !state.candidates.length;
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
$('#url').addEventListener('keydown', (e) => { if (e.key === 'Enter') analyzeSite(); });
for (const k of ['primary', 'secondary', 'accent']) $('#c-' + k).addEventListener('input', (e) => { state.colors[k] = e.target.value; state.colors.neutral = mix(state.colors.primary, '#ffffff', 0.85); applyAll(); });
$('#brand').addEventListener('input', (e) => { state.brand = e.target.value; applyAll(); });
$('#tagline').addEventListener('input', (e) => { state.tagline = e.target.value; applyAll(); });
document.querySelectorAll('[data-opt]').forEach(b => b.addEventListener('click', () => { state[b.dataset.opt] = b.dataset.val; applyAll(); }));
$('#products').addEventListener('change', (e) => { state.products = e.target.checked; applyAll(); });
$('#reset').addEventListener('click', () => {
  Object.assign(state, { font: null, brand: '', tagline: '', logo: null, hero: null, candidates: [], palette: [], walls: 'bianco', crate: 'naturale', bannerBg: 'auto' });
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
