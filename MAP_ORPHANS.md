# ORPHANS & PENDING

| # | Issue | Location |
|---|-------|----------|
| 1 | `contextBridge` partially exposed (getConnectionStatus, onConnectionChange); rest uses direct `fetch()` | `preload.js` |
| 2 | No centralized Express error handler | `server.js` |
| 3 | Plain-text passwords in DB + sessionStorage | `database.js`, `memberController.js` |
| 4 | Role auth spoofable — member/trainer routes trust client `x-user-role` | All controllers |
| 5 | CORS wide open; no helmet/rate-limit | `server.js` |
| 6 | No tests (`npm test` is echo) | `package.json` |
| 7 | Member ID race condition (`MAX(id)+1`) | `memberController.js:92-96` |
| 8 | Employee ID race condition (`MAX(id)+1`) | `managerController.js:82-86` |
| 9 | CDN deps — no offline capability | `index.html:7-8` |
| 10 | No pagination — full table scans (except expenses LIMIT 50) | All GET routes |
| 11 | Hard DELETE cascades — no soft deletes | `memberController.js:269` |
| 12 | schema drift via bare `ALTER TABLE ADD COLUMN IF NOT EXISTS` (try/catch) | `database.js:42-43,63-64` |
| 13 | Audit log user attribution comes from client headers, not server session | All controllers |
