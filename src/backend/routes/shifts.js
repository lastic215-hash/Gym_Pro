const express = require('express');
const router = express.Router();
const { getMemberStatus, getShiftSummary, closeShift, getFinancialSummary, reconcileAndDeposit, createShiftExpense, getMonthlyFinancialSummary } = require('../controllers/shiftController');

router.get('/member-status/:memberId', getMemberStatus);
router.get('/summary', getShiftSummary);
router.post('/close', closeShift);
router.get('/financial-summary', getFinancialSummary);
router.post('/reconcile-and-deposit', reconcileAndDeposit);
router.post('/expense', createShiftExpense);
router.get('/monthly-summary', getMonthlyFinancialSummary);

module.exports = router;
