const { pool } = require('../config/database');
const { logActivity } = require('../utils/activityLogger');

async function getMemberStatus(req, res) {
  try {
    const { memberId } = req.params;
    const [rows] = await pool.execute(
      'SELECT id, name, status, expiry_date FROM members WHERE id = ?',
      [memberId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, status: null, message: 'العضو غير موجود' });
    }
    const m = rows[0];
    const today = new Date().toISOString().split('T')[0];
    const effectiveStatus = (m.status === 'active' && m.expiry_date > today) ? 'active' : 'expired';
    return res.json({
      success: true,
      status: effectiveStatus,
      expiry_date: m.expiry_date,
      name: m.name
    });
  } catch (error) {
    console.error('getMemberStatus error:', error);
    return res.status(500).json({ success: false, status: null });
  }
}

async function getShiftSummary(req, res) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [totals] = await pool.execute(
      `SELECT method, SUM(amount) as total
       FROM payments
       WHERE payment_date = ?
       GROUP BY method`,
      [today]
    );
    const expectedCash = totals.reduce((sum, row) => sum + parseFloat(row.total || 0), 0);
    const byMethod = {};
    totals.forEach(row => { byMethod[row.method] = parseFloat(row.total || 0).toFixed(2); });

    return res.json({
      success: true,
      shift_date: today,
      expected_total: parseFloat(expectedCash.toFixed(2)),
      by_method: byMethod
    });
  } catch (error) {
    console.error('getShiftSummary error:', error);
    return res.status(500).json({ success: false });
  }
}

async function closeShift(req, res) {
  try {
    const { actual_cash, expected_total } = req.body;
    if (actual_cash === undefined || actual_cash === null) {
      return res.status(400).json({ success: false, message: 'المبلغ الفعلي مطلوب' });
    }
    const today = new Date().toISOString().split('T')[0];
    const actual = parseFloat(actual_cash);
    const expected = parseFloat(expected_total || 0);
    const discrepancy = parseFloat((actual - expected).toFixed(2));
    const status = discrepancy === 0 ? 'متطابق' : (discrepancy > 0 ? 'فائض' : 'عجز');

    const userName = req.headers['x-user-name'] || req.query.userName || 'Unknown';

    await pool.execute(
      'INSERT INTO shift_logs (shift_date, expected_total, actual_cash, discrepancy, status, closed_by) VALUES (?, ?, ?, ?, ?, ?)',
      [today, expected, actual, discrepancy, status, userName]
    );

    const role = req.headers['x-user-role'] || req.query.role || 'employee';
    await logActivity(role, userName, 'User ' + userName + ' closed shift for ' + today + ': expected ' + expected + ' LYD, actual ' + actual + ' LYD, status ' + status);

    return res.json({
      success: true,
      message: 'تم إغلاق الوردية بنجاح',
      result: { shift_date: today, expected_total: expected, actual_cash: actual, discrepancy, status }
    });
  } catch (error) {
    console.error('closeShift error:', error);
    return res.status(500).json({ success: false, message: 'فشل إغلاق الوردية' });
  }
}

async function getFinancialSummary(req, res) {
  try {
    const today = new Date().toISOString().split('T')[0];

    const [paymentRows] = await pool.execute(
      `SELECT method, COALESCE(SUM(amount),0) as total FROM payments WHERE payment_date = ? GROUP BY method`,
      [today]
    );
    let cashTotal = 0, cardTotal = 0;
    paymentRows.forEach(r => {
      if (r.method === 'cash') cashTotal = parseFloat(r.total);
      else cardTotal = parseFloat(r.total);
    });

    const [expenseRows] = await pool.execute(
      `SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE expense_date = ? AND category = 'مصروف استقبال'`,
      [today]
    );
    const expensesTotal = parseFloat(expenseRows[0].total);

    const [depositRows] = await pool.execute(
      `SELECT id, amount, created_at FROM treasury_deposits WHERE deposit_date = ? ORDER BY id DESC LIMIT 1`,
      [today]
    );
    const deposit = depositRows.length > 0 ? { id: depositRows[0].id, amount: parseFloat(depositRows[0].amount), created_at: depositRows[0].created_at } : null;

    const netCash = parseFloat((cashTotal - expensesTotal).toFixed(2));

    return res.json({
      success: true,
      shift_date: today,
      cash_total: cashTotal,
      card_total: cardTotal,
      expenses_total: expensesTotal,
      net_cash_expected: netCash,
      deposit
    });
  } catch (error) {
    console.error('getFinancialSummary error:', error);
    return res.status(500).json({ success: false });
  }
}

async function reconcileAndDeposit(req, res) {
  try {
    const { actual_cash } = req.body;
    if (actual_cash === undefined || actual_cash === null) {
      return res.status(400).json({ success: false, message: 'المبلغ الفعلي مطلوب' });
    }

    const today = new Date().toISOString().split('T')[0];

    const [paymentRows] = await pool.execute(
      `SELECT method, COALESCE(SUM(amount),0) as total FROM payments WHERE payment_date = ? GROUP BY method`,
      [today]
    );
    let cashTotal = 0;
    paymentRows.forEach(r => { if (r.method === 'cash') cashTotal = parseFloat(r.total); });

    const [expenseRows] = await pool.execute(
      `SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE expense_date = ? AND category = 'مصروف استقبال'`,
      [today]
    );
    const expensesTotal = parseFloat(expenseRows[0].total);
    const expected = parseFloat((cashTotal - expensesTotal).toFixed(2));

    const [existingDeposit] = await pool.execute(
      `SELECT id FROM treasury_deposits WHERE deposit_date = ? LIMIT 1`,
      [today]
    );
    if (existingDeposit.length > 0) {
      return res.status(409).json({ success: false, message: 'تم إيداع الخزينة اليوم بالفعل' });
    }

    const actual = parseFloat(actual_cash);
    const discrepancy = parseFloat((actual - expected).toFixed(2));
    const status = discrepancy === 0 ? 'متطابق' : (discrepancy > 0 ? 'فائض' : 'عجز');

    const userName = req.headers['x-user-name'] || req.query.userName || 'Unknown';

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.execute(
        'INSERT INTO shift_logs (shift_date, expected_total, actual_cash, discrepancy, status, closed_by) VALUES (?, ?, ?, ?, ?, ?)',
        [today, expected, actual, discrepancy, status, userName]
      );

      const depositAmount = actual;
      await conn.execute(
        'INSERT INTO treasury_deposits (deposit_date, amount, deposited_by, notes) VALUES (?, ?, ?, ?)',
        [today, depositAmount, userName, 'تسوية جرد مالي']
      );

      await conn.commit();

      const role = req.headers['x-user-role'] || req.query.role || 'employee';
      await logActivity(role, userName, 'User ' + userName + ' reconciled and deposited ' + depositAmount + ' LYD to treasury on ' + today + ', expected ' + expected + ', actual ' + actual + ', status ' + status);

      return res.json({
        success: true,
        message: 'تمت التسوية والإيداع في الخزينة بنجاح',
        result: { shift_date: today, expected, actual, discrepancy, status, deposit_amount: depositAmount }
      });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error('reconcileAndDeposit error:', error);
    return res.status(500).json({ success: false, message: 'فشل التسوية والإيداع' });
  }
}

async function createShiftExpense(req, res) {
  try {
    const { description, amount } = req.body;
    if (!description || !amount) {
      return res.status(400).json({ success: false, message: 'الوصف والمبلغ مطلوبان' });
    }
    const today = new Date().toISOString().split('T')[0];
    const createdBy = req.query.displayName || req.query.userName || 'موظف';
    const createdById = req.headers['x-user-name'] || null;
    const [result] = await pool.execute(
      'INSERT INTO expenses (description, amount, category, expense_date, created_by, created_by_id) VALUES (?, ?, ?, ?, ?, ?)',
      [description.trim(), parseFloat(amount), 'مصروف استقبال', today, createdBy, createdById]
    );
    const role = req.headers['x-user-role'] || req.query.role || 'employee';
    await logActivity(role, createdBy, createdBy + ' recorded expense: ' + description.trim() + ' (' + amount + ' LYD)');
    return res.status(201).json({ success: true, message: 'تم تسجيل المصروف', id: result.insertId });
  } catch (error) {
    console.error('createShiftExpense error:', error);
    return res.status(500).json({ success: false, message: 'فشل تسجيل المصروف' });
  }
}

async function getMonthlyFinancialSummary(req, res) {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const month = parseInt(req.query.month) || (new Date().getMonth() + 1);

    const [paymentRows] = await pool.execute(
      `SELECT method, COALESCE(SUM(amount),0) as total FROM payments WHERE YEAR(payment_date) = ? AND MONTH(payment_date) = ? GROUP BY method`,
      [year, month]
    );
    let cashTotal = 0, cardTotal = 0;
    paymentRows.forEach(r => {
      if (r.method === 'cash') cashTotal = parseFloat(r.total);
      else cardTotal = parseFloat(r.total);
    });

    const [expenseRows] = await pool.execute(
      `SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE category = 'مصروف استقبال' AND YEAR(expense_date) = ? AND MONTH(expense_date) = ?`,
      [year, month]
    );
    const expensesTotal = parseFloat(expenseRows[0].total);

    const [depositRows] = await pool.execute(
      `SELECT COALESCE(SUM(amount),0) as total FROM treasury_deposits WHERE YEAR(deposit_date) = ? AND MONTH(deposit_date) = ?`,
      [year, month]
    );
    const totalDeposits = parseFloat(depositRows[0].total);

    const netCash = parseFloat((cashTotal - expensesTotal).toFixed(2));

    return res.json({
      success: true,
      year, month,
      cash_total: cashTotal,
      card_total: cardTotal,
      expenses_total: expensesTotal,
      net_cash_expected: netCash,
      total_deposits: totalDeposits
    });
  } catch (error) {
    console.error('getMonthlyFinancialSummary error:', error);
    return res.status(500).json({ success: false });
  }
}

module.exports = { getMemberStatus, getShiftSummary, closeShift, getFinancialSummary, reconcileAndDeposit, createShiftExpense, getMonthlyFinancialSummary };
