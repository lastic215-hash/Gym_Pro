const express = require('express');
const router = express.Router();
const {
  getDashboardStats,
  getPeakHours,
  getRevenueSpread,
  getStaffToday,
  getAllEmployees,
  createEmployee,
  clockInEmployee,
  deleteEmployee,
  updateEmployee,
  updateEmployeeSchedule,
  getAuditLogs,
  saveEmployeeWorkdays,
  getEmployeeWorkdays
} = require('../controllers/managerController');
const { createPlan, updatePlan, deletePlan } = require('../controllers/planController');
const { createExpense, getExpenses, deleteExpense, getFinancialIntelligence } = require('../controllers/financialController');

function checkRole(requiredRole) {
  return (req, res, next) => {
    const role = req.headers['x-user-role'] || req.query.role;
    if (!role || role !== requiredRole) {
      return res.status(403).json({ success: false, message: 'غير مصرح بهذه العملية' });
    }
    next();
  };
}

router.get('/dashboard-stats', checkRole('manager'), getDashboardStats);
router.get('/analytics/peak-hours', checkRole('manager'), getPeakHours);
router.get('/analytics/revenue-spread', checkRole('manager'), getRevenueSpread);
router.get('/staff-today', checkRole('manager'), getStaffToday);
router.post('/plans', checkRole('manager'), createPlan);
router.put('/plans/:id', checkRole('manager'), updatePlan);
router.delete('/plans/:id', checkRole('manager'), deletePlan);
router.get('/employees/all', checkRole('manager'), getAllEmployees);
router.post('/employees', checkRole('manager'), createEmployee);
router.post('/employees/clock-in', clockInEmployee);
router.put('/employees/:id', checkRole('manager'), updateEmployee);
router.delete('/employees/:id', checkRole('manager'), deleteEmployee);
router.put('/employees/:id/schedule', checkRole('manager'), updateEmployeeSchedule);
router.get('/audit-logs', checkRole('manager'), getAuditLogs);
router.post('/employees/workdays', checkRole('manager'), saveEmployeeWorkdays);
router.get('/employees/workdays/:id', checkRole('manager'), getEmployeeWorkdays);
router.post('/expenses', checkRole('manager'), createExpense);
router.get('/expenses', checkRole('manager'), getExpenses);
router.delete('/expenses/:id', checkRole('manager'), deleteExpense);
router.get('/financial-intelligence', checkRole('manager'), getFinancialIntelligence);

module.exports = router;
