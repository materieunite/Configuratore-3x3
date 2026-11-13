# Configuratore stand 3x3

Configuratore 3D dello stand in cartone Materieunite. L'utente inserisce il sito del suo brand o carica il press kit (PDF, ZIP, loghi, foto) e lo stand si veste con logo, colori e messaggio.

- Pagina: GitHub Pages (branch `main`, cartella root).
- Lettura dei siti: Cloudflare Worker in `worker/` (`/brand?url=`, `/img?u=`). L'indirizzo va in `config.js`.
- Dettagli tecnici e stato: `HANDOFF.md`.
