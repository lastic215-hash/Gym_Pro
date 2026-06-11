const express = require('express');
const router = express.Router();
const {
  login,
  checkInMember,
  registerMember,
  renewMember,
  getTrainerMembers,
  getMembersList,
  getMembersByPlan,
  deleteMember,
  updateMember,
  markAttendance,
  searchMembers,
  getRecentAttendance,
  registerAndPay,
  getTrainerAttendanceToday,
  getMemberAttendanceHistory
} = require('../controllers/memberController');

router.post('/auth/login', login);
router.post('/checkin', checkInMember);
router.post('/members/register', registerMember);
router.post('/members/register-and-pay', registerAndPay);
router.put('/members/:id', updateMember);
router.delete('/members/:id', deleteMember);
router.post('/members/renew', renewMember);
router.get('/employee/members/by-plan', getMembersByPlan);
router.get('/employee/trainers', async (req, res) => {
  try {
    const { pool } = require('../config/database');
    const [rows] = await pool.execute("SELECT id, name, role, specialization FROM employees WHERE id != 'ADMIN' AND (role LIKE '%مدرب%' OR role LIKE '%Trainer%' OR role LIKE '%كابتن%')");
    res.json({ success: true, trainers: rows });
  } catch (_) { res.status(500).json({ success: false, trainers: [] }); }
});
router.post('/employee/attendance/mark', markAttendance);
router.get('/employee/members/:trainerId', getTrainerMembers);
router.get('/employee/members', getMembersList);
router.get('/members/search', searchMembers);
router.get('/attendance/recent', getRecentAttendance);
router.get('/employee/attendance/today/:trainerId', getTrainerAttendanceToday);
router.get('/employee/attendance/history/:memberId/:trainerId', getMemberAttendanceHistory);
router.post('/employee/clock-in', async (req, res) => {
  const { clockInEmployee } = require('../controllers/managerController');
  return clockInEmployee(req, res);
});

module.exports = router;
