# Configuratore stand 3x3 (Materieunite) — punto della situazione

## Cosa c'è
- `index.html`, `app.js` (bundle), `pdf.worker.min.mjs`, `stand.glb`, `config.js` → sito statico per GitHub Pages (repo materieunite/Configuratore-3x3).
- `sorgente/app.js` → sorgente del configuratore (three.js 0.170, pdf.js 4.10, JSZip). Bundle: `npx esbuild sorgente/app.js --bundle --format=esm --minify --target=es2022 --outfile=app.js` (in una cartella con `npm i three@0.170.0 pdfjs-dist@4.10.38 jszip@3.10.1 esbuild`).
- `worker/` → Cloudflare Worker `configuratore-stand`: `/brand?url=` (nome, logo img/SVG/JSON-LD, icone, og:image, foto, colori CSS pesati, font Google) e `/img?u=` (proxy immagini con CORS). Variabile `ALLOWED_ORIGINS=https://materieunite.github.io`. Dev locale: `npx wrangler dev --var ALLOW_PRIVATE:1`.
- `Stand_cartone_pulito.3dm` → solo stand in cartone dal file Bioitalia/Expo West, origine nell'angolo, 8 materiali, layer Stand::{Pareti cartone, Grafica banco laterale, Nicchie colore, Pannelli logo, Cassa legno(+Ruote), Sgabelli}, Riferimenti nascosti.
- `pipeline/clean.py` (3dm sorgente → 3dm pulito, rhino3dm) e `pipeline/glb.py` (3dm pulito → stand.glb: Y-up metri, nodi logo_1..3, banco_1..4, nicchia_1..9 con UV planari sul solo fronte, `_bordo` per i bordi; sgabelli semplificati oggetto per oggetto — semplificarli fusi li rompeva).
- `pipeline/sito-di-prova/` → sito finto usato per il collaudo locale del Worker.

## Stato
- Online: pagina https://configuratore-3x3.pages.dev (Cloudflare Pages, deploy automatico da main) e Worker https://configuratore-stand.materieunite.workers.dev (Workers Builds da worker/, deploy automatico). Versione Worker in `VERSION`, anche nella chiave della cache.
- Nessuna AI generativa: logo scelto a punteggio (Worker) + verifica visiva (pagina); colori da logo, theme-color e CSS senza palette dei framework; grafiche a regole.
- Motore delle grafiche per parti (colori, logo, banner, fronte cassa, banchi laterali, nicchie, pareti stampate): seme e blocco per parte, Rigenera = genera 24 combinazioni e sceglie la migliore non vista (scoreDesign). Logo monocromo bianco/nero quando l'originale non si legge sul fondo.
- Prova su 12 brand (13/11/2026): buoni Alessi, Barilla, Eataly, Kartell, Aesop, Lavazza; incerti Freitag, illy, Oatly, Patagonia; bloccati Mutti (403), Antinori (timeout).
- Prossimo passo possibile: Browser Rendering di Cloudflare come ripiego per i siti in JavaScript o che bloccano la lettura.
