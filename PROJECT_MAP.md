# GYM Pro — External Memory Index

## Current Session (2026-06-14) — Offline-First Architecture: Local MySQL + Railway Sync

**Architecture**: Offline-First. All reads/writes go to **local MySQL**. Railway cloud is a secondary target for sync only.

**Behavior**:
| Condition | Read from | Write to | Queue for sync |
|-----------|-----------|----------|----------------|
| Online (Railway reachable) | Local MySQL | Local MySQL | Yes → `__sync_queue` |
| Offline (Railway unreachable) | Local MySQL | Local MySQL | No (queued when online later) |

**SyncEngine**: Reads `__sync_queue` from local MySQL → replays on Railway via `cloudPool` → deletes from queue.

**Key fix**: Removed dual-write inconsistency. No race condition (the cloud pool is never in the hot path).

**Feature**: Dual MySQL database architecture with transparent online/offline fallback and background sync.

**Core change**: Replaced raw `mysql2/promise` pool in `database.js` with `SmartPool` (`src/backend/config/smartPool.js`) — a proxy class that manages two MySQL pools:
- **Local MySQL** (`localhost:3306`, user `root`, password from `LOCAL_DB_PASSWORD` or default `Root@123`) — always available on the same machine
- **Cloud MySQL** (Railway `acela.proxy.rlwy.net`, credentials from `.env`) — online target
- `pool.execute()` → tries Railway first; on connection failure (internet down), auto-falls back to local MySQL
- `pool.getConnection()` → returns `SmartConnection` bound to whichever pool is active
- Periodic health check (every 15s) via `startHealthCheck()` — reconnects to Railway when back online

**New files**:
| File | Purpose |
|------|---------|
| `src/backend/config/smartPool.js` | `SmartPool` class — dual MySQL pool management |
| `src/backend/utils/syncEngine.js` | `SyncEngine` — flushes `__sync_queue` from local MySQL to Railway MySQL |

**Sync mechanism**:
- Offline writes are logged to `__sync_queue` table (SQL + params as JSON) in **local** MySQL
- When SmartPool detects reconnection → `SyncEngine.sync()` replays queued operations on Railway (retry up to 3x)
- Background sync every 30s + immediate sync on reconnection
- Failed syncs are removed from queue (max 3 retries, logged)
- Frontend sync badge in sidebar (green "متصل بالسحابة" / amber "وضع عدم الاتصال") polled every 10s via `GET /api/health`

**Server startup**:
1. `initializeDatabase()` ensures local MySQL is running (required)
2. Creates/verifies schema on local MySQL (all 11 tables + `__sync_queue`)
3. Tries connecting to Railway — non-fatal if unreachable
4. If Railway reachable, verifies schema there too
5. Express server always starts regardless of cloud state

**Files modified** (surgical, 7 files touched, 0 controllers changed):
- `package.json` — removed `better-sqlite3`, kept existing deps
- `database.js` — dual MySQL configs, schema init for both, SmartPool creation
- `smartPool.js` — dual pool management, auto-fallback, health check
- `syncEngine.js` — MySQL→MySQL queue replay
- `server.js` — added `/api/health`, sync engine init
- `main.js` — IPC handler `getConnectionStatus`
- `preload.js` — exposed `getConnectionStatus`, `onConnectionChange`
- `renderer.js` — sync status polling + badge update
- `index.html` — single `<div id="sync-status">` added in sidebar

**Files NOT touched** (no regression risk):
- All 6 controllers — unchanged, still `const { pool } = require('../config/database')`
- All 5 route files — unchanged
- `activityLogger.js` — unchanged

## Last Session (2026-06-14) — Auto-Cleanup Old Attendance Every 24h

| File | Size | Content |
|------|------|---------|
| [MAP_STACK.md](MAP_STACK.md) | 0.5KB | Electron 42 + Express 5 + MySQL2 + Tailwind CDN |
| [MAP_FLOW.md](MAP_FLOW.md) | 1.0KB | fork→server→DB init; 3-role routing; schema (7 tables) |
| [MAP_ORPHANS.md](MAP_ORPHANS.md) | 0.8KB | 13 pending: auth leak, no tests, race conditions, CDN deps |
| [MAP_GOALS.md](MAP_GOALS.md) | 0.7KB | 4 milestones with verifiable checkboxes |

## Last Session (2026-06-09) — Employee Clock-In System (replaces vacation toggle)
**Feature**: Removed manager-driven "إجازة/مناوب" toggle (`works_today`). Replaced with self clock-in system for all employees. New DB columns `is_clocked_in`, `last_clock_in`. Endpoint `POST /api/employee/clock-in` sets `is_clocked_in = 1` (one-way). Sidebar clock-in button for non-manager roles only (hidden for admin). Upon successful clock-in, button shows "تم الدخول" and disables (no clock-out toggle). Manager staff tab shows active status with check-in time. Dashboard shows "نشط" with time for clocked-in employees.

**Refinements**:
- Removed `data-role` from clock button to fix `applyRoleVisibility` hiding it for all roles — visibility now managed solely by `updateClockBtn()` (hidden if `role === 'manager'`).
- Professional toggle: Green "تسجيل الدخول" ↔ Red "تسجيل الخروج" (both clickable).
- Optimistic UI — button toggles immediately on click, syncs with server in background (5s timeout, reverts on error).
- Manager staff table badges: 🟢 نشط (green) / 🔴 غير نشط (red).

## Current Session (2026-06-14) — Auto-Cleanup Old Attendance Every 24h

**Bugfix 1 — Failed check-ins leak**: `checkInMember` logged ALL check-in attempts (including expired/frozen) to `attendance` table before validation, causing `loadRecentAttendance` to show failed check-ins as "مقبول". Fix: moved `INSERT INTO attendance` after frozen/expiry checks. No changes to `getRecentAttendance` or `loadRecentAttendance` needed — all logged entries are now genuine successful check-ins.

**Bugfix 2 — مرفوض row in logs table**: `confirmEntryBtn` handler added a row to `logsBody` even for failed check-ins ("مرفوض"), persisting until next tab switch. Fix: only add row when `data.success === true`.

**Feature — Auto-cleanup every 24h**: New `cleanupOldAttendance()` in `memberController.js` — deletes attendance records older than 24 hours. Runs on server start + every 1h via `setInterval` in `server.js`. New test endpoint `DELETE /api/attendance/cleanup` returns `{ deleted_count: N }`. This keeps the recent attendance list clean and prevents unbounded table growth.

## Previous Session (2026-06-14) — Trainer Workdays Schedule (Manager + Receptionist)
**Feature**: New `employee_workdays` table (id, employee_id, day_of_week) in `database.js:128-132`. Backend: `saveEmployeeWorkdays`, `getEmployeeWorkdays`, `getAllTrainersWorkdays` in `managerController.js:264-309`. Routes: `POST /api/manager/employees/workdays` (manager add/edit), `GET /api/manager/employees/workdays/:id` (manager), `GET /api/employee/trainers/workdays` (any role) in `routes/manager.js:43-44` and `routes/members.js:43-47`.

**Frontend — Manager staff tab**: Workdays section below the employee grid in `index.html` with table (trainer name, specialization, workday labels, edit button). Modal (`#workday-modal`) with checkboxes for 7 days. Save button calls POST endpoint; optimistic inline update of day labels.

**Frontend — Receptionist scanner tab**: Workdays read-only table at bottom of `#tab-employee-scanner` (trainer name, specialization, workday labels, work hours). Auto-loads on tab switch via overridden `switchTab` in `renderer.js:2484-2494`. Both `loadWorkdaysManager()` and `loadWorkdaysReception()` use `GET /api/employee/trainers/workdays`.

## Previous Session (2026-06-14) — Hide Admin Expenses from Receptionist

**Root cause**: Admin expenses (categories: إيجار, رواتب, etc.) were summed into `net_cash_expected` in shift controller endpoints, making the receptionist see negative net cash from admin spending.

**Backend fix** (`shiftController.js`): Added `AND category = 'مصروف استقبال'` to 3 expense sum queries:
1. `getFinancialSummary()` line 103 — today's expenses for daily KPI + net cash
2. `reconcileAndDeposit()` line 148 — today's expenses for reconciliation
3. `getMonthlyFinancialSummary()` line 243 — monthly expenses total

Now shift endpoints only count receptionist-recorded expenses (category `'مصروف استقبال'`), excluding all admin expenses.

**Frontend fix** (`index.html`): Added `data-role="manager"` to 3 expense elements:
1. Line 762 — daily expense KPI card (مصروفات اليوم)
2. Line 775 — expense recording section (تسجيل مصروف)
3. Line 839 — monthly expense KPI card (إجمالي المصروفات)

No changes to `renderer.js` or `routes/manager.js` (manager routes already protected by `checkRole('manager')`).

## Previous Session (2026-06-11) — Render Deployment Compatibility
**Feature**: `server.js` now reads `PORT` from `process.env` with fallback to `3000` for local development. Added `npm run start:render` script (`node src/backend/server.js`) for Render's start command. Deploy on Render with: `npm run start:render` (Render auto-injects `PORT` env var).

**renderer.js fix**: `API_BASE` detects 3 environments:
- **Production (non-localhost)** → `/api` (Render, same-origin)
- **Local Express on :3000** → `/api` (same-origin)
- **Electron / Live Server** → `http://localhost:3000/api` (cross-origin fallback)
This covers Render, local Express, Electron, and Live Server workflows.

## Previous Session (2026-06-11) — Enhanced Trainer Dashboard
**Feature**: Transformed the basic trainer members table into a full trainer dashboard with KPI cards, today's attendance log, and per-member attendance history.

**Backend**: Two new endpoints in `memberController.js`:
- `GET /api/employee/attendance/today/:trainerId` — returns today's attendance records for the trainer with member names and timestamps (`memberController.js:397-412`)
- `GET /api/employee/attendance/history/:memberId/:trainerId` — returns full attendance history (last 50 records) for a specific member with this trainer (`memberController.js:414-432`)
Routes registered in `routes/members.js:39-40`.

**Frontend — index.html**:
- 4 animated KPI cards at the top of the trainer tab: إجمالي المتدربين (total), حضور اليوم (today's attendance), نسبة الحضور (attendance rate %), النشطون (active count) — each with gradient backgrounds and icons (`index.html:837-875`)
- Today's attendance log section below the members table with member name and time columns (`index.html:913-937`)
- Attendance history modal (`#attendance-history-modal`) that appears when clicking the "✔ حاضر" badge on any member — shows full date/time log (`index.html:940-961`)

**Frontend — renderer.js**:
- `initTrainerDashboard()` orchestrates both `loadTrainerMembers()` and `loadTrainerAttendanceToday()` (`renderer.js:1912-1915`)
- `loadTrainerMembers()` now computes KPIs from the response data and updates the 4 KPI cards. The "✔ حاضر" badge is now clickable (`.view-history-btn`) to open the history modal (`renderer.js:1879-1910`)
- `loadTrainerAttendanceToday()` fetches and renders today's attendance log table (`renderer.js:1917-1948`)
- `openAttendanceHistory()` / `closeAttendanceHistory()` manage the history modal — fetches records from the API, renders date/time rows, click-outside-to-close (`renderer.js:1950-1990`)
- Refresh button in the trainer tab header wired to `initTrainerDashboard()` (`renderer.js:1992-1995`)

## Previous Session (2026-06-10) — Financial Inventory + Treasury Deposit
**Feature**: Financial inventory mechanism for receptionist and treasury deposit. New `treasury_deposits` table (id, deposit_date, amount, deposited_by, notes) in `database.js:116-120`. Backend: `shiftController.js` adds `getFinancialSummary()` — returns today's cash/card totals, expenses total, net expected cash, and existing deposit info; `reconcileAndDeposit()` — transactional reconciliation (`shift_logs` entry + `treasury_deposits` insert) with discrepancy calculation (متطابق/فائض/عجز). Routes: `GET /api/shift/financial-summary` and `POST /api/shift/reconcile-and-deposit` in `routes/shifts.js`. Frontend: new sidebar button "الجرد المالي" (data-tab="employee-financial") and tab panel in `index.html` — 4 KPI cards (نقدية, بطاقة, مصروفات, صافي متوقع), cash input with auto discrepancy display (green/amber/rose), "إيداع في الخزينة" button; disabled state after deposit with success checkmark. Auto-loads on tab switch via MutationObserver.

## Previous Session (2026-06-10) — Strict Subscription Renewal Guard
**Feature**: Enforce business rule — member with active subscription cannot be charged for renewal. Backend: `paymentController.js:24-30` checks `IF status='active' AND expiry_date > today` before transaction, returns HTTP 409 with `code: 'SUBSCRIPTION_STILL_ACTIVE'`. Frontend: active member cards in `renderer.js:976` show "🔒 مقفل للتجديد" badge instead of 💳 pay button (only expired members get the pay button). Payment form handler `renderer.js:1943-1946` shows amber warning for `SUBSCRIPTION_STILL_ACTIVE` code as belt-and-suspenders defense.

## Previous Session (2026-06-10) — Automated Subscription & Payment Lifecycle Module
**Feature**: Full payment+subscription workflow. New `payments` table (id, member_id, plan_id, amount, method, payment_date, created_at) in `database.js:97-105`. New `paymentController.js` with `processPayment()` using MySQL transaction (`BEGIN/COMMIT/ROLLBACK` via `pool.getConnection()`) — inserts payment record + updates member status/expiry/fee_paid atomically. New route `POST /api/payments/process` in `routes/payments.js`, registered in `server.js:7,18`. IPC handler `processMembershipPayment` in `main.js:92-119` forwards to Express via `http.request`. Exposed via `preload.js:5` as `window.api.processMembershipPayment()`.

**Frontend**: "Payment Checkout Modal" (`#payment-modal`) in `index.html:748-794` — plan dropdown, amount (auto-filled), payment method radio (cash/card), review summary (plan, duration, amount, new expiry), success animation. "💳" pay button added to active member cards (`renderer.js:972`) and "💳 دفع" button to expired member cards (`renderer.js:986`). `openPaymentModal()` / `closePaymentModal()` / `loadPaymentPlans()` / `updatePaymentSummary()` in `renderer.js:1800-1950`. On success: checkmark animation, auto-refresh members list. Falls back to direct `apiFetch()` if IPC unavailable.

## Previous Session (2026-06-10) — Login Screen Bypass Bugfix
**Bugfix**: Login screen was skipped on fresh app start — user taken directly to role page (manager/trainer/receptionist). Root cause: `localStorage` persists across Electron app restarts, so the session persistence fix made the stale session survive app close/reopen. Fix: `renderer.js:145-153` — session restored only on `navigation.type === 'reload'` (page refresh within session), cleared on `'navigate'` (fresh app start). Uses `performance.getEntriesByType('navigation')[0]?.type` to differentiate.

## Previous Session (2026-06-09) — Session Persistence Bugfix
**Bugfix**: Username disappeared from sidebar (`#sidebar-user-name`) on page reload. Root cause: `sessionStorage` is cleared on Electron `BrowserWindow` reload. Fix: replaced `sessionStorage` with `localStorage` in `setSession()`, `clearSession()`, `getSession()` within `renderer.js` (lines 31, 35, 40). `logoutUser()` still calls `clearSession()` → `localStorage.removeItem`, so logout remains clean. No new files, no API changes.

## Previous Session (2026-06-09) — Smart Member Search replaces QR/Barcode Scanner
**Feature**: Replaced the barcode/scanner receptionist tab with a debounced "Smart Member Search" interface. Receptionist now searches members by name or phone number with 300ms debounce and selects from results to confirm entry.

**Backend**:
- Added `searchMembers` controller in `memberController.js` — `GET /api/members/search?q=...` with `SELECT ... FROM members LEFT JOIN plans WHERE name LIKE ? OR phone LIKE ? LIMIT 10` (parameterized query, SQL-injection safe)
- Added search endpoint to `routes/members.js`
- Added `searchMember` IPC handler in `main.js` — forwards query to Express API via `http` module
- Exposed `window.api.searchMember(query)` in `preload.js` via `contextBridge` + `ipcRenderer.invoke`

**Frontend**:
- Replaced scanner tab HTML (`#tab-employee-scanner`) with: search input (`#member-search-input`), results table (Name, Phone, Status, Expiry Date), selected-member card with "تأكيد الدخول" (Confirm Entry) button
- Updated `renderer.js`: debounced input handler (300ms), `renderSearchResults()` renders results table with `selectMember()` onclick, `confirmEntryBtn` calls existing `POST /api/checkin`
- Status card and recent logs preserved; `resetUI()` and `switchTab()` updated for new element IDs
- Removed orphaned CSS `#scan-input:focus` → replaced with `#member-search-input:focus`

**No QR libraries removed** — project had no QR dependencies (barcode scanner was a manual text input).

**Previous Session (2026-06-09) — Staff Phone Field + Tab Layout Redesign**
**Feature**: Added `phone` field to employees. New `phone VARCHAR(50)` column in employees table (auto-migration). Backend `createEmployee` / `updateEmployee` / `getAllEmployees` / `getStaffToday` now handle phone. Frontend: phone input in staff form, phone column in staff table, edit support.

**Visual Polish**: Restructured `#tab-manager-plans` and `#tab-manager-staff` in `src/frontend/index.html` from stacked (form above table) to side-by-side grid (`grid-cols-5` with `col-span-2` form + `col-span-3` table), matching the financial tab layout pattern for visual balance and professionalism.

## Previous Session (2026-06-07) — Member Classification by Plan
**Feature: Classify Members by Subscription Plan** — Added `GET /api/employee/members/by-plan` endpoint in `memberController.js` + `routes/members.js`. Frontend: added "الكل" / "حسب الباقة" toggle buttons in employee-members tab; "حسب الباقة" view renders members grouped by plan (Weightlifting, Calisthenics, MMA, General) with active/expired counts per plan.

**Usage**: Read this index first (0.3KB). Load only the sub-file relevant to current task.
