# MILESTONES

## M1: Auth Hardening
- [ ] bcrypt passwords + migration script
- [ ] JWT httpOnly cookie, replace sessionStorage
- [ ] Role guard middleware on ALL routes (not just /api/manager/*)

## M2: Production Hardening
- [ ] Centralized error middleware + structured logger (pino/winston)
- [ ] helmet + cors whitelist + express-rate-limit
- [ ] Input validation (zod schema on every route)
- [ ] UUID primary keys, replace sequential M*/E* IDs

## M3: Frontend Architecture
- [ ] Vite bundler — remove CDN deps
- [ ] Modular JS files (not 1284-line monolithic renderer.js)
- [ ] Proper Electron IPC via contextBridge + ipcRenderer

## M4: Testing & CI
- [ ] Integration tests for all 20+ API endpoints
- [ ] MySQL testcontainer or SQLite in-memory for CI
- [ ] CI pipeline: lint → typecheck → test → build
