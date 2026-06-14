# SYSTEM_FLOW & ARCHITECTURE

## Launch Sequence
1. `main.js` → `fork('server.js')` → `initializeDatabase()` → create DB + 7 tables + seed data → listen :3000 → `process.send('server-ready')`
2. Electron `createWindow()` → load `index.html` (RTL Arabic)

## Auth Flow
`POST /api/auth/login` → validate `employees` table → sessionStorage(user) → UI shows role-based sidebar tabs
- Manager: dashboard, plans, staff, financial, audit
- Receptionist: scanner, register, members list
- Trainer: trainee attendance

## API Routes
```
/api/auth/login                          → memberController.login
/api/checkin                             → memberController.checkInMember
/api/members/register, /:id (PUT/DELETE) → memberController
/api/members/renew                       → memberController.renewMember
/api/payments/process                    → paymentController.processPayment
/api/employee/members, /trainers, /by-plan → memberController
/api/employee/attendance/mark            → memberController.markAttendance
/api/plans/active                        → planController.getActivePlans
/api/manager/*                           → managerController (all guarded)
/api/manager/plans/*                     → planController (CRUD)
/api/manager/employees/*                 → managerController (CRUD)
/api/manager/expenses/*                  → financialController (CRUD)
/api/manager/financial-intelligence      → financialController
/api/manager/audit-logs                  → managerController
/api/manager/employees/workdays          → managerController (POST save)
/api/manager/employees/workdays/:id      → managerController (GET)
/api/employee/trainers/workdays          → managerController.getAllTrainersWorkdays
/api/trainer/dashboard/:trainerId        → trainerController.getTrainerDashboard
```

## Database Schema (9 tables)
```
members(id VARCHAR(10) PK, name, phone, plan_id, trainer_id, reg_date, expiry_date, status, fee_paid)
plans(id INT AUTO_INCREMENT PK, name, duration_days, price, status)
employees(id VARCHAR(10) PK, name, role, works_today, work_start, work_end, password, specialization, phone, is_clocked_in, last_clock_in)
attendance(id AUTO_INCREMENT PK, member_id, timestamp)
trainer_attendance(id AUTO_INCREMENT PK, member_id, trainer_id, attendance_date, timestamp) UNIQUE(member,trainer,date)
expenses(id AUTO_INCREMENT PK, description, amount, category, expense_date, created_by, created_by_id, created_at)
audit_logs(id AUTO_INCREMENT PK, user_role, user_name, action_details, timestamp)
payments(id AUTO_INCREMENT PK, member_id, plan_id, amount, method, payment_date, created_at)
employee_workdays(id AUTO_INCREMENT PK, employee_id, day_of_week) UNIQUE(employee,day)
```
