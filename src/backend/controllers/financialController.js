const { pool } = require('../config/database');
const { logActivity } = require('../utils/activityLogger');

async function createExpense(req, res) {
  try {
    const { description, amount, category, expense_date } = req.body;
    if (!description || !amount || !category || !expense_date) {
      return res.status(400).json({ success: false, message: "جميع الحقول مطلوبة" });
    }
    const createdBy = req.query.displayName || req.headers['x-user-name'] || 'Manager';
    const createdById = req.headers['x-user-name'] || null;
    const [result] = await pool.execute(
      'INSERT INTO expenses (description, amount, category, expense_date, created_by, created_by_id) VALUES (?, ?, ?, ?, ?, ?)',
      [description.trim(), parseFloat(amount), category.trim(), expense_date, createdBy, createdById]
    );
    const role = req.headers['x-user-role'] || req.query.role || 'manager';
    await logActivity(role, createdBy, createdBy + ' logged expense: ' + description.trim() + ' (' + amount + ')');
    return res.status(201).json({ success: true, message: "تم تسجيل المصروف", id: result.insertId });
  } catch (error) {
    console.error('createExpense error:', error);
    return res.status(500).json({ success: false, message: "خطأ في تسجيل المصروف" });
  }
}

async function getExpenses(req, res) {
  try {
    const [rows] = await pool.execute(
      'SELECT id, description, amount, category, expense_date, created_by, created_by_id, created_at FROM expenses ORDER BY expense_date DESC, id DESC LIMIT 50'
    );
    return res.status(200).json({ success: true, expenses: rows });
  } catch (error) {
    console.error('getExpenses error:', error);
    return res.status(500).json({ success: false, message: "خطأ في جلب المصروفات" });
  }
}

async function deleteExpense(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute('SELECT description FROM expenses WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "المصروف غير موجود" });
    }
    await pool.execute('DELETE FROM expenses WHERE id = ?', [id]);
    const role = req.headers['x-user-role'] || req.query.role || 'manager';
    const userName = req.query.displayName || req.headers['x-user-name'] || 'Manager';
    await logActivity(role, userName, userName + ' deleted expense #' + id + ' (' + rows[0].description + ')');
    return res.status(200).json({ success: true, message: "تم حذف المصروف" });
  } catch (error) {
    console.error('deleteExpense error:', error);
    return res.status(500).json({ success: false, message: "خطأ في حذف المصروف" });
  }
}

async function getFinancialIntelligence(req, res) {
  try {
    const [revenueRows] = await pool.execute(
      "SELECT COALESCE(SUM(fee_paid),0) as total FROM members WHERE MONTH(registration_date) = MONTH(CURDATE()) AND YEAR(registration_date) = YEAR(CURDATE())"
    );
    const [expenseRows] = await pool.execute(
      "SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE MONTH(expense_date) = MONTH(CURDATE()) AND YEAR(expense_date) = YEAR(CURDATE())"
    );
    const [trendRows] = await pool.execute(
      `SELECT
        DATE_FORMAT(date_seq.m, '%Y-%m') as month,
        COALESCE(SUM(m.fee_paid),0) as revenue,
        COALESCE(SUM(e.amount),0) as expenses
      FROM (
        SELECT LAST_DAY(CURDATE() - INTERVAL 5 MONTH) + INTERVAL 1 DAY + INTERVAL (n) MONTH as m
        FROM (SELECT 0 n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5) nums
      ) date_seq
      LEFT JOIN members m ON MONTH(m.registration_date) = MONTH(date_seq.m) AND YEAR(m.registration_date) = YEAR(date_seq.m)
      LEFT JOIN expenses e ON MONTH(e.expense_date) = MONTH(date_seq.m) AND YEAR(e.expense_date) = YEAR(date_seq.m)
      GROUP BY date_seq.m
      ORDER BY date_seq.m`
    );
    return res.status(200).json({
      success: true,
      total_revenue: revenueRows[0].total,
      total_expenses: expenseRows[0].total,
      monthly_trend: trendRows
    });
  } catch (error) {
    console.error('getFinancialIntelligence error:', error);
    return res.status(500).json({ success: false, message: "خطأ في تحليل البيانات المالية" });
  }
}

module.exports = { createExpense, getExpenses, deleteExpense, getFinancialIntelligence };
