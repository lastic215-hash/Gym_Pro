const { pool } = require('../config/database');
const { logActivity } = require('../utils/activityLogger');

async function processPayment(req, res) {
  const conn = await pool.getConnection();
  try {
    const { member_id, plan_id, amount, method } = req.body;

    if (!member_id || !plan_id || !amount || !method) {
      return res.status(400).json({ success: false, message: "جميع الحقول مطلوبة" });
    }

    const [planRows] = await conn.execute('SELECT * FROM plans WHERE id = ? AND status = ?', [plan_id, 'active']);
    if (planRows.length === 0) {
      return res.status(400).json({ success: false, message: "الباقة غير صالحة" });
    }
    const plan = planRows[0];

    const [memberRows] = await conn.execute('SELECT * FROM members WHERE id = ?', [member_id]);
    if (memberRows.length === 0) {
      return res.status(404).json({ success: false, message: "العضو غير موجود" });
    }
    const member = memberRows[0];

    const today = new Date().toISOString().split('T')[0];
    if (member.status === 'active' && member.expiry_date > today) {
      return res.status(409).json({
        success: false,
        code: 'SUBSCRIPTION_STILL_ACTIVE',
        message: 'الاشتراك الحالي لا يزال نشطاً حتى ' + member.expiry_date
      });
    }

    const payment_date = new Date().toISOString().split('T')[0];
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + plan.duration_days);
    const expiry_date = expiry.toISOString().split('T')[0];

    await conn.beginTransaction();

    await conn.execute(
      'INSERT INTO payments (member_id, plan_id, amount, method, payment_date) VALUES (?, ?, ?, ?, ?)',
      [member_id, plan_id, amount, method, payment_date]
    );

    await conn.execute(
      'UPDATE members SET status = ?, expiry_date = ?, fee_paid = ? WHERE id = ?',
      ['active', expiry_date, amount, member_id]
    );

    await conn.commit();

    const role = req.headers['x-user-role'] || req.query.role || 'employee';
    const userName = req.headers['x-user-name'] || 'Unknown';
    const methodLabel = method === 'card' ? 'بطاقة' : 'نقداً';
    await logActivity(role, userName, 'User ' + userName + ' processed payment ' + amount + ' LYD (' + methodLabel + ') for member ' + member_id + ' with plan ' + plan.name);

    return res.status(200).json({
      success: true,
      message: "تمت عملية الدفع وتفعيل الاشتراك بنجاح",
      payment: { member_id, member_name: member.name, plan_name: plan.name, duration_days: plan.duration_days, amount, method, payment_date, expiry_date }
    });
  } catch (error) {
    console.error('processPayment error:', error);
    try { await conn.rollback(); } catch (_) {}
    return res.status(500).json({ success: false, message: "فشلت عملية الدفع - تم إلغاء العملية" });
  } finally {
    conn.release();
  }
}

module.exports = { processPayment };
