// Cloudflare Worker del configuratore stand (deploy automatico da GitHub, cartella worker/).
//   GET /brand?url=https://sito.it   -> identità del brand ricavata dal sito (JSON)
//   GET /img?u=https://sito.it/logo.png -> immagine del sito con intestazioni CORS
// Variabili (wrangler.toml / pannello Cloudflare):
//   ALLOWED_ORIGINS  elenco separato da virgole delle pagine autorizzate ("*" = tutte)
//   ALLOW_PRIVATE    "1" solo in sviluppo locale, per leggere siti su localhost

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const MAX_HTML = 3_000_000, MAX_CSS = 1_500_000, MAX_IMG = 10_000_000;
const VERSION = '2026-11-13.2';

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());
    const allowOrigin = allowed.includes('*') ? '*' : (allowed.includes(origin) ? origin : allowed[0]);
    const cors = { 'Access-Control-Allow-Origin': allowOrigin, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Vary': 'Origin' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (!allowed.includes('*') && origin && !allowed.includes(origin)) return json({ error: 'origine non autorizzata' }, 403, cors);

    const u = new URL(req.url);
    try {
      if (u.pathname === '/brand') {
        const target = safeUrl(u.searchParams.get('url'), env);
        const cache = caches.default, key = new Request(`https://cache.local/brand?v=${VERSION}&u=${encodeURIComponent(target.href)}`);
        let hit = await cache.match(key);
        if (hit) { const h = new Headers(hit.headers); for (const [k, v] of Object.entries(cors)) h.set(k, v); return new Response(hit.body, { headers: h }); }
        const data = await brand(target, env);
        ctx.waitUntil(cache.put(key, json(data, 200, { 'Cache-Control': 'public, max-age=21600' })));
        return json(data, 200, { ...cors, 'Cache-Control': 'public, max-age=21600' });
      }
      if (u.pathname === '/img') {
        const target = safeUrl(u.searchParams.get('u'), env);
        const r = await get(target, 'image/avif,image/webp,image/svg+xml,image/*;q=0.8');
        const type = (r.headers.get('content-type') || '').split(';')[0];
        if (!r.ok || !/^image\//.test(type)) return json({ error: "non è un'immagine" }, 415, cors);
        const buf = await readLimited(r, MAX_IMG);
        return new Response(buf, { headers: { ...cors, 'Content-Type': type, 'Cache-Control': 'public, max-age=86400' } });
      }
      return json({ ok: true, version: VERSION, uso: ['/brand?url=', '/img?u='] }, 200, cors);
    } catch (e) {
      return json({ error: String(e.message || e) }, e.status || 502, cors);
    }
  },
};

// ---------------- sicurezza ----------------
function safeUrl(raw, env) {
  if (!raw) throw err("manca l'indirizzo", 400);
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
  let t; try { t = new URL(raw); } catch { throw err('indirizzo non valido', 400); }
  if (!/^https?:$/.test(t.protocol)) throw err('solo http/https', 400);
  const h = t.hostname.toLowerCase();
  const priv = h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h === '[::1]' || /^\[?f[cd]/.test(h);
  if (priv && env.ALLOW_PRIVATE !== '1') throw err('indirizzo non consentito', 400);
  return t;
}
function err(m, status) { const e = new Error(m); e.status = status; return e; }
async function get(url, accept, ms = 8000) {
  try {
    return await fetch(url.href, { headers: { 'User-Agent': UA, 'Accept': accept, 'Accept-Language': 'it,en;q=0.8' }, redirect: 'follow', cf: { cacheTtl: 3600 }, signal: AbortSignal.timeout(ms) });
  } catch (e) {
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) throw err('il sito non risponde', 504);
    throw err('il sito non è raggiungibile', 502);
  }
}
async function readLimited(r, max) {
  const reader = r.body.getReader(); const chunks = []; let n = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; n += value.length; if (n > max) { reader.cancel(); throw err('file troppo grande', 413); } chunks.push(value); }
  const out = new Uint8Array(n); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; } return out;
}
async function text(url, accept, max, ms) {
  const r = await get(url, accept, ms);
  if (r.status === 403 || r.status === 429) throw err('il sito blocca la lettura automatica', 502);
  if (!r.ok) throw err(`il sito ha risposto ${r.status}`, 502);
  return { body: new TextDecoder().decode(await readLimited(r, max)), finalUrl: new URL(r.url || url.href) };
}
function json(o, status, headers) { return new Response(JSON.stringify(o), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } }); }

// ---------------- analisi ----------------
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')); return m ? decode(m[2] ?? m[3] ?? m[4] ?? '') : null; };
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x2F;/gi, '/');
const abs = (h, base) => { try { return new URL(h, base).href; } catch { return null; } };

async function brand(target, env) {
  const { body: html, finalUrl } = await text(target, 'text/html,application/xhtml+xml', MAX_HTML);
  const base = (() => { const m = html.match(/<base\s[^>]*href=["']([^"']+)/i); return m ? abs(m[1], finalUrl) : finalUrl.href; })();
  const head = html.slice(0, 200_000);
  const metas = [...head.matchAll(/<meta\s[^>]*>/gi)].map(m => m[0]);
  const meta = (k) => { for (const t of metas) { const n = (attr(t, 'property') || attr(t, 'name') || '').toLowerCase(); if (n === k) return attr(t, 'content'); } return null; };
  const title = (head.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]?.trim() || null;

  // icone dichiarate
  const links = [...head.matchAll(/<link\s[^>]*>/gi)].map(m => m[0]);
  const icons = [];
  for (const t of links) {
    const rel = (attr(t, 'rel') || '').toLowerCase(), href = attr(t, 'href'); if (!href) continue;
    if (/icon|apple-touch/.test(rel)) icons.push({ url: abs(href, base), rel, sizes: attr(t, 'sizes') || null, color: attr(t, 'color') || null });
  }
  // JSON-LD
  let ldLogo = null, ldName = null;
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (o) => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach(walk);
        const ty = [].concat(o['@type'] || []).join(' ');
        if (/Organization|Brand|Corporation|LocalBusiness|Store|Winery|Restaurant/.test(ty)) { if (!ldName && o.name) ldName = o.name; const l = o.logo?.url || o.logo; if (!ldLogo && typeof l === 'string') ldLogo = abs(l, base); }
        Object.values(o).forEach(walk); };
      walk(JSON.parse(m[1]));
    } catch { }
  }
  // candidati logo con punteggio + foto
  const header = (html.match(/<header[\s\S]*?<\/header>/i) || [''])[0];
  const origin = finalUrl.origin;
  const isHome = (href) => { if (!href) return false; try { const h = new URL(href, base); return h.origin === origin && (h.pathname === '/' || /^\/[a-z]{2}([-_][a-z]{2})?\/?$/i.test(h.pathname) || /^\/(home|index\.html?)\/?$/i.test(h.pathname)); } catch { return false; } };
  const homeLinks = [...html.slice(0, 600_000).matchAll(/<a\s[^>]*>[\s\S]{0,40000}?<\/a>/gi)].map(m => m[0]).filter(a => isHome(attr(a.slice(0, a.indexOf('>') + 1), 'href'))).slice(0, 8).join('\n');
  const ICON = /icon|menu|search|cart|bag|basket|user|account|login|close|arrow|chevron|caret|burger|gift|heart|wish|favou?rite|play|pause|social|facebook|instagram|twitter|youtube|linkedin|pinterest|tiktok|whatsapp|globe|lang|flag|star|rating|phone|mail|location|marker|share|plus|minus|filter|sort|toggle|spinner|loader|check|info|warning|payment|visa|mastercard|paypal|badge|award|trustpilot/i;
  const LOGO = /logo|brand|wordmark|marchio|logotype/i;
  const candidates = [];
  const seen = new Set();
  const photos = [];
  for (const m of html.matchAll(/<img\s[^>]*>/gi)) {
    const t = m[0];
    let src = attr(t, 'src') || attr(t, 'data-src') || attr(t, 'data-lazy-src');
    const srcset = attr(t, 'srcset') || attr(t, 'data-srcset');
    if (srcset) { const best = srcset.split(',').map(x => x.trim().split(/\s+/)).sort((a, b) => parseFloat(b[1] || 0) - parseFloat(a[1] || 0))[0]; if (best?.[0]) src = best[0]; }
    if (!src || src.startsWith('data:')) continue;
    const url = abs(src, base); if (!url || seen.has(url)) continue; seen.add(url);
    const hint = [attr(t, 'alt'), attr(t, 'class'), attr(t, 'id'), attr(t, 'title'), src.split('?')[0]].join(' ');
    const inHeader = header.includes(t), inHome = homeLinks.includes(t);
    const w = +attr(t, 'width') || 0, h = +attr(t, 'height') || 0;
    let score = 0;
    if (LOGO.test(hint)) score += 60;
    if (inHome) score += 50;
    if (inHeader) score += 10;
    if (ICON.test(hint) && !LOGO.test(hint)) score -= 80;
    if (/\.svg(\?|$)/i.test(src)) score += 10;
    if (w && h && Math.max(w, h) <= 48) score -= 60;
    if (score >= 40) candidates.push({ type: 'img', url, alt: attr(t, 'alt'), score });
    else if (photos.length < 12 && !ICON.test(hint) && !(w && h && Math.max(w, h) < 200)) photos.push({ url, alt: attr(t, 'alt'), w: w || null, h: h || null });
  }
  for (const m of html.matchAll(/<svg[\s\S]*?<\/svg>/gi)) {
    const sv = m[0]; if (sv.length > 120_000 || sv.length < 150) continue;
    const open = sv.slice(0, sv.indexOf('>') + 1);
    const title = (sv.match(/<title[^>]*>([^<]*)</i) || [])[1] || '';
    const hint = open + ' ' + title;
    const inHeader = header.includes(sv), inHome = homeLinks.includes(sv);
    const vb = (attr(open, 'viewBox') || attr(open, 'viewbox') || '').trim().split(/[\s,]+/).map(Number);
    let w = vb.length === 4 ? vb[2] : +attr(open, 'width') || 0, h = vb.length === 4 ? vb[3] : +attr(open, 'height') || 0;
    const ar = w && h ? w / h : 0;
    let score = 0;
    if (LOGO.test(hint)) score += 60;
    if (inHome) score += 50;
    if (inHeader) score += 10;
    if (ICON.test(hint) && !LOGO.test(hint)) score -= 80;
    if (w && h && Math.max(w, h) <= 48 && ar > 0.6 && ar < 1.6) score -= 60;
    if (ar >= 1.8) score += 15;
    if (sv.length > 1500) score += 10; else if (sv.length < 500) score -= 20;
    if (/<use\s/i.test(sv) && sv.length < 800) score -= 60; // riferimento a sprite, vuoto da solo
    if (score >= 40) candidates.push({ type: 'svg', svg: normalizeSvg(sv), score, w, h });
  }
  if (ldLogo) candidates.push({ type: 'img', url: ldLogo, alt: 'logo (dati strutturati)', score: 55 });
  const dedup = new Set();
  const logos = candidates.filter(c => { const k = c.url || c.svg; if (dedup.has(k)) return false; dedup.add(k); return true; }).sort((a, b) => b.score - a.score).slice(0, 6);
  const svgs = logos.filter(c => c.type === 'svg').map(c => c.svg);
  const logoImgs = logos.filter(c => c.type === 'img').map(c => ({ url: c.url, alt: c.alt }));
  // fogli di stile: colori e font
  const cssTexts = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]);
  const inlineStyles = [...html.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)].map(m => m[1]).join(';');
  cssTexts.push(inlineStyles);
  const sheetUrls = links.filter(t => /stylesheet/i.test(attr(t, 'rel') || '')).map(t => abs(attr(t, 'href'), base)).filter(Boolean);
  const googleFonts = [];
  for (const s of sheetUrls) if (/fonts\.googleapis\.com/.test(s)) { for (const f of new URL(s).searchParams.getAll('family')) googleFonts.push(f.split(':')[0].replace(/\+/g, ' ')); }
  const own = sheetUrls.filter(s => !/fonts\.googleapis|use\.typekit|cdnjs|jsdelivr|unpkg|bootstrapcdn|fontawesome/.test(s)).slice(0, 5);
  const fetched = await Promise.allSettled(own.map(s => text(new URL(s), 'text/css,*/*;q=0.1', MAX_CSS, 5000)));
  for (const f of fetched) if (f.status === 'fulfilled') cssTexts.push(f.value.body);
  const css = cssTexts.join('\n');
  const { colors, vars } = cssColors(css);
  const fonts = cssFonts(css);
  for (const m of css.matchAll(/@import\s+url\(["']?(https:\/\/fonts\.googleapis\.com[^"')]+)/gi)) { try { for (const f of new URL(m[1]).searchParams.getAll('family')) googleFonts.push(f.split(':')[0].replace(/\+/g, ' ')); } catch { } }

  const ogImage = meta('og:image') || meta('og:image:url') || meta('twitter:image');
  return {
    url: finalUrl.href,
    name: meta('og:site_name') || ldName || cleanTitle(title, finalUrl.hostname),
    title, description: meta('og:description') || meta('description'),
    themeColor: meta('theme-color') || meta('msapplication-tilecolor'),
    lang: (html.match(/<html[^>]*\slang=["']?([a-z-]+)/i) || [])[1] || null,
    version: VERSION,
    logos,
    logo: { jsonLd: ldLogo, img: logoImgs, svg: svgs, icons },
    images: { og: ogImage ? abs(ogImage, base) : null, photos },
    colors, cssVars: vars,
    fonts: { google: [...new Set(googleFonts)].slice(0, 4), css: fonts },
  };
}
function cleanTitle(t, host) {
  if (!t) return host.replace(/^www\./, '').split('.')[0];
  const parts = t.split(/\s[|\-–—·:]\s/).map(s => s.trim()).filter(Boolean);
  return parts.sort((a, b) => a.length - b.length)[0] || t;
}
function normalizeSvg(s) {
  s = s.replace(/\sviewbox=/i, ' viewBox=').replace(/\spreserveaspectratio=/i, ' preserveAspectRatio=');
  if (!/xmlns=/.test(s)) s = s.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  return s.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+="[^"]*"/gi, '');
}
// conta i colori (hex, rgb) e le variabili CSS con nomi da brand
function cssColors(css) {
  const count = new Map(), vars = [];
  const add = (hex, w) => { if (hex) count.set(hex, (count.get(hex) || 0) + w); };
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;}{]+)/g)) {
    const name = m[1].toLowerCase(), hex = toHex(m[2]);
    if (hex && vars.length < 40) vars.push({ name, hex });
    if (hex && /primary|brand|accent|main|secondary|highlight|theme|corporate/.test(name)) add(hex, 25);
  }
  for (const m of css.matchAll(/#([0-9a-f]{3}|[0-9a-f]{6})\b(?![0-9a-f])/gi)) add(toHex('#' + m[1]), 1);
  for (const m of css.matchAll(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+([\d.]+%?))?\s*\)/gi)) { const a = m[4] ? parseFloat(m[4]) / (m[4].endsWith('%') ? 100 : 1) : 1; if (a > 0.6) add(toHex(`rgb(${m[1]},${m[2]},${m[3]})`), 1); }
  const colors = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([hex, n]) => ({ hex, n }));
  return { colors, vars };
}
function toHex(v) {
  v = v.trim().toLowerCase();
  let m = v.match(/^#([0-9a-f]{3})$/); if (m) return '#' + [...m[1]].map(c => c + c).join('');
  m = v.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/); if (m) return '#' + m[1];
  m = v.match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/); if (m) return '#' + [m[1], m[2], m[3]].map(x => Math.min(255, +x).toString(16).padStart(2, '0')).join('');
  return null;
}
function cssFonts(css) {
  const c = new Map();
  for (const m of css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    const f = m[1].split(',')[0].trim().replace(/^["']|["']$/g, '');
    if (!f || /[:(){}]/.test(f) || /^(var|inherit|initial|unset|sans-serif|serif|monospace|system-ui|-apple-system|blinkmacsystemfont|arial|helvetica|times)/i.test(f) || /icon|awesome|videojs|vjs|swiper|slick|dashicons|glyph|icomoon|material|eicons|feather|fa-|fontello|star|social|revicons|woocommerce|elementor/i.test(f)) continue;
    c.set(f, (c.get(f) || 0) + 1);
  }
  return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(e => e[0]);
}
