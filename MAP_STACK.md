# TECH_STACK

| Layer | Tech | File |
|-------|------|------|
| Desktop | Electron 42 | `main.js` → fork `server.js` |
| Bridge | `contextBridge` | **empty** — no IPC; renderer calls `fetch()` directly |
| Backend | Express 5 + cors | `server.js` :3000 |
| DB Cloud | MySQL2 (pool) → Railway | `config/database.js` — Railway config from .env |
| DB Local | MySQL2 (pool) → localhost | `config/database.js` — LOCAL_* env or defaults |
| DB Layer | SmartPool proxy → auto-fallback | `config/smartPool.js` — online→Railway, offline→local MySQL |
| Sync | SyncEngine (30s interval) | `utils/syncEngine.js` — `__sync_queue` replay from local to Railway |
| Frontend | Vanilla JS | `renderer.js` (1284 LOC) + `index.html` (552 LOC) |
| UI libs | Tailwind CDN + Chart.js CDN | No bundler, no offline |
| Auth | plain-text passwords, sessionStorage, `x-user-role` header | |
| Scripts | `npm start` → Electron; `start:server` → nodemon | No test/lint/build |
