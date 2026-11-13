# Configuratore stand 3x3 (Materieunite) — punto della situazione

## Cosa c'è
- `index.html`, `app.js` (bundle), `pdf.worker.min.mjs`, `stand.glb`, `config.js` → sito statico per GitHub Pages (repo materieunite/Configuratore-3x3).
- `sorgente/app.js` → sorgente del configuratore (three.js 0.170, pdf.js 4.10, JSZip). Bundle: `npx esbuild sorgente/app.js --bundle --format=esm --minify --target=es2022 --outfile=app.js` (in una cartella con `npm i three@0.170.0 pdfjs-dist@4.10.38 jszip@3.10.1 esbuild`).
- `worker/` → Cloudflare Worker `configuratore-stand`: `/brand?url=` (nome, logo img/SVG/JSON-LD, icone, og:image, foto, colori CSS pesati, font Google) e `/img?u=` (proxy immagini con CORS). Variabile `ALLOWED_ORIGINS=https://materieunite.github.io`. Dev locale: `npx wrangler dev --var ALLOW_PRIVATE:1`.
- `Stand_cartone_pulito.3dm` → solo stand in cartone dal file Bioitalia/Expo West, origine nell'angolo, 8 materiali, layer Stand::{Pareti cartone, Grafica banco laterale, Nicchie colore, Pannelli logo, Cassa legno(+Ruote), Sgabelli}, Riferimenti nascosti.
- `pipeline/clean.py` (3dm sorgente → 3dm pulito, rhino3dm) e `pipeline/glb.py` (3dm pulito → stand.glb: Y-up metri, nodi logo_1..3, banco_1..4, nicchia_1..9 con UV planari sul solo fronte, `_bordo` per i bordi; sgabelli semplificati oggetto per oggetto — semplificarli fusi li rompeva).
- `pipeline/sito-di-prova/` → sito finto usato per il collaudo locale del Worker.

## Stato
- Collaudato in locale end-to-end (Worker + pagina) sul sito di prova.
- Da fare: 1) Alessandro crea il Worker su Cloudflare (o via connettore) e fornisce l'URL `…workers.dev` → metterlo in `config.js`; 2) push su materieunite/Configuratore-3x3 e attivare GitHub Pages (branch main, root); 3) provare su siti reali (SVG inline, siti JS-only senza HTML server-side: in quel caso serve Browser Rendering di Cloudflare).
- L'artefatto claude.ai precedente (con "Proposta di Claude") resta come demo; fuori dall'artefatto la proposta AI non c'è (servirebbe una chiave API lato Worker).
