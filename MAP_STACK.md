# TECH_STACK

| Layer | Tech | File |
|-------|------|------|
| Desktop | Electron 42 | `main.js` → fork `server.js` |
| Bridge | `contextBridge` | **empty** — no IPC; renderer calls `fetch()` directly |
| Backend | Express 5 + cors | `server.js` :3000 |
| DB | MySQL2 (pool) | `config/database.js` — auto CREATE DB+tables+seed |
| Frontend | Vanilla JS | `renderer.js` (1284 LOC) + `index.html` (552 LOC) |
| UI libs | Tailwind CDN + Chart.js CDN | No bundler, no offline |
| Auth | plain-text passwords, sessionStorage, `x-user-role` header | |
| Scripts | `npm start` → Electron; `start:server` → nodemon | No test/lint/build |
