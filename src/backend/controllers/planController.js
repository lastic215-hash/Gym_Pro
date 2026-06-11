const { pool } = require('../config/database');
const { logActivity } = require('../utils/activityLogger');

async function getActivePlans(req, res) {
  try {
    const [rows] = await pool.execute("SELECT * FROM plans WHERE status = 'active' ORDER BY name");
    return res.status(200).json({ success: true, plans: rows });
  } catch (error) {
    console.error('getActivePlans error:', error);
    return res.status(500).json({ success: false, message: "خطأ في جلب الباقات" });
  }
}

async function createPlan(req, res) {
  try {
    const { name, duration_days, price } = req.body;

    if (!name || !duration_days || price === undefined) {
      return res.status(400).json({ success: false, message: "جميع الحقول مطلوبة" });
    }

    const parsedDuration = parseInt(duration_days, 10);
    const parsedPrice = parseFloat(price);

    if (isNaN(parsedDuration) || parsedDuration < 1) {
      return res.status(400).json({ success: false, message: "عدد الأيام غير صالح" });
    }

    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ success: false, message: "السعر غير صالح" });
    }

    const [result] = await pool.execute(
      'INSERT INTO plans (name, duration_days, price) VALUES (?, ?, ?)',
      [name.trim(), parsedDuration, parsedPrice]
    );

    const role = req.headers['x-user-role'] || 'manager';
    const userName = req.headers['x-user-name'] || 'Manager';
    await logActivity(role, userName, 'Manager modified gym plans/pricing');

    return res.status(201).json({
      success: true,
      message: "تم إضافة الباقة بنجاح",
      plan: { id: result.insertId, name: name.trim(), duration_days: parsedDuration, price: parsedPrice, status: 'active' }
    });
  } catch (error) {
    console.error('createPlan error:', error);
    return res.status(500).json({ success: false, message: "خطأ في إنشاء الباقة" });
  }
}

async function updatePlan(req, res) {
  try {
    const { id } = req.params;
    const { name, duration_days, price } = req.body;

    if (!name || !duration_days || price === undefined) {
      return res.status(400).json({ success: false, message: "جميع الحقول مطلوبة" });
    }

    const parsedDuration = parseInt(duration_days, 10);
    const parsedPrice = parseFloat(price);

    if (isNaN(parsedDuration) || parsedDuration < 1) {
      return res.status(400).json({ success: false, message: "عدد الأيام غير صالح" });
    }

    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ success: false, message: "السعر غير صالح" });
    }

    const [result] = await pool.execute(
      'UPDATE plans SET name = ?, duration_days = ?, price = ? WHERE id = ?',
      [name.trim(), parsedDuration, parsedPrice, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "الباقة غير موجودة" });
    }

    const role = req.headers['x-user-role'] || 'manager';
    const userName = req.headers['x-user-name'] || 'Manager';
    await logActivity(role, userName, 'Manager modified gym plans/pricing');

    return res.status(200).json({ success: true, message: "تم تحديث الباقة بنجاح" });
  } catch (error) {
    console.error('updatePlan error:', error);
    return res.status(500).json({ success: false, message: "خطأ في تحديث الباقة" });
  }
}

async function deletePlan(req, res) {
  try {
    const { id } = req.params;

    const [result] = await pool.execute(
      'DELETE FROM plans WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "الباقة غير موجودة" });
    }

    const role = req.headers['x-user-role'] || req.query.role || 'manager';
    const userName = req.headers['x-user-name'] || 'Manager';
    await logActivity(role, userName, 'Manager deleted plan id ' + id);

    return res.status(200).json({ success: true, message: "تم حذف الباقة" });
  } catch (error) {
    console.error('deletePlan error:', error);
    return res.status(500).json({ success: false, message: "خطأ في حذف الباقة" });
  }
}

module.exports = { getActivePlans, createPlan, updatePlan, deletePlan };
