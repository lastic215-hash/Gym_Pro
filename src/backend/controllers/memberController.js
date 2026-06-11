const { pool } = require('../config/database');
const { logActivity } = require('../utils/activityLogger');

async function login(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: "اسم المستخدم وكلمة المرور مطلوبان" });
    }

    const [rows] = await pool.execute('SELECT * FROM employees WHERE id = ? AND password = ?', [username, password]);
    const emp = rows[0];

    if (!emp) {
      return res.status(401).json({ success: false, message: "بيانات الدخول غير صحيحة" });
    }

    let role = 'receptionist';
    if (emp.role === 'Manager') role = 'manager';
    else if (emp.role && (emp.role.includes('مدرب') || emp.role.includes('Trainer') || emp.role.includes('كابتن'))) role = 'trainer';

    return res.status(200).json({
      success: true,
      authenticated: true,
      user: {
        id: emp.id,
        name: emp.name,
        role: role,
        is_clocked_in: emp.is_clocked_in === 1 || emp.is_clocked_in === true,
        last_clock_in: emp.last_clock_in || null
      }
    });
  } catch (error) {
    console.error('login error:', error);
    return res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
}

async function checkInMember(req, res) {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, message: "رقم العضو مطلوب" });
    }

    const [rows] = await pool.execute('SELECT * FROM members WHERE id = ?', [id]);
    const member = rows[0];

    if (!member) {
      return res.status(404).json({ success: false, message: "لم يتم العثور على العضو" });
    }

    // Record attendance — logged for every valid member, regardless of freeze/expiry
    await pool.execute('INSERT INTO attendance (member_id) VALUES (?)', [id]);

    if (member.status === 'frozen') {
      return res.status(400).json({ success: false, message: "الحساب مجمد حالياً" });
    }

    const today = new Date().toISOString().split('T')[0];
    if (member.expiry_date < today) {
      await pool.execute('UPDATE members SET status = ? WHERE id = ?', ['expired', id]);
      return res.status(400).json({ success: false, message: "انتهت صلاحية الاشتراك", expired: true });
    }
    return res.status(200).json({ success: true, name: member.name, message: "تم تسجيل الدخول" });
  } catch (error) {
    console.error('checkInMember error:', error);
    return res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
}

async function registerMember(req, res) {
  try {
    const { name, phone, plan_id, trainer_id } = req.body;

    if (!name || !phone || !plan_id) {
      return res.status(400).json({ success: false, message: "جميع الحقول مطلوبة" });
    }

    const [planRows] = await pool.execute('SELECT * FROM plans WHERE id = ? AND status = ?', [plan_id, 'active']);
    if (planRows.length === 0) {
      return res.status(400).json({ success: false, message: "الباقة غير صالحة" });
    }

    const plan = planRows[0];

    const registration_date = new Date().toISOString().split('T')[0];
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + plan.duration_days);
    const expiry_date = expiry.toISOString().split('T')[0];

    const [idRows] = await pool.execute('SELECT id FROM members ORDER BY id DESC LIMIT 1');
    let newId = 'M101';
    if (idRows.length > 0) {
      const num = parseInt(idRows[0].id.substring(1), 10) + 1;
      newId = 'M' + num;
    }

    await pool.execute(
      `INSERT INTO members (id, name, phone, plan_id, trainer_id, registration_date, expiry_date, status, fee_paid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId, name, phone, plan_id, trainer_id || null, registration_date, expiry_date, 'active', plan.price]
    );

    const role = req.headers['x-user-role'] || 'employee';
    const userName = req.headers['x-user-name'] || 'Unknown';
    await logActivity(role, userName, 'Employee ' + userName + ' registered a new member: ' + name);

    return res.status(201).json({
      success: true,
      message: "تم تسجيل العضو بنجاح",
      member: {
        id: newId,
        name,
        phone,
        plan_id,
        trainer_id: trainer_id || null,
        registration_date,
        expiry_date,
        status: 'active',
        fee_paid: plan.price
      }
    });
  } catch (error) {
    console.error('registerMember error:', error);
    return res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
}

async function renewMember(req, res) {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, message: "رقم العضو مطلوب" });
    }

    const [memberRows] = await pool.execute('SELECT plan_id FROM members WHERE id = ?', [id]);
    if (memberRows.length === 0) {
      return res.status(404).json({ success: false, message: "لم يتم العثور على العضو" });
    }

    let durationDays = 30;
    if (memberRows[0].plan_id) {
      const [planRows] = await pool.execute('SELECT duration_days FROM plans WHERE id = ?', [memberRows[0].plan_id]);
      if (planRows.length > 0) {
        durationDays = planRows[0].duration_days;
      }
    }

    const today = new Date().toISOString().split('T')[0];
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + durationDays);
    const expiry_date = expiry.toISOString().split('T')[0];

    const [result] = await pool.execute(
      `UPDATE members SET status = ?, registration_date = ?, expiry_date = ? WHERE id = ?`,
      ['active', today, expiry_date, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "لم يتم العثور على العضو" });
    }

    const role = req.headers['x-user-role'] || 'employee';
    const userName = req.headers['x-user-name'] || 'Unknown';
    await logActivity(role, userName, 'Employee ' + userName + ' renewed subscription for Member ID: ' + id);

    return res.status(200).json({
      success: true,
      message: "تم تجديد الاشتراك بنجاح",
      member: { id, expiry_date, registration_date: today, status: 'active' }
    });
  } catch (error) {
    console.error('renewMember error:', error);
    return res.status(500).json({ success: false, message: "خطأ في الخادم" });
  }
}

async function getTrainerMembers(req, res) {
  try {
    const { trainerId } = req.params;

    const [rows] = await pool.execute(
      `SELECT m.*, p.name as plan_name,
        (SELECT COUNT(*) FROM trainer_attendance ta WHERE ta.member_id = m.id AND ta.trainer_id = ? AND ta.attendance_date = CURDATE()) > 0 as attended_today
      FROM members m
      LEFT JOIN plans p ON m.plan_id = p.id
      WHERE m.trainer_id = ?
      ORDER BY m.name`,
      [trainerId, trainerId]
    );

    return res.status(200).json({ success: true, members: rows });
  } catch (error) {
    console.error('getTrainerMembers error:', error);
    return res.status(500).json({ success: false, message: "خطأ في جلب المتدربين" });
  }
}

async function markAttendance(req, res) {
  try {
    const { trainerId, memberId } = req.body;

    if (!trainerId || !memberId) {
      return res.status(400).json({ success: false, message: "بيانات الحضور مطلوبة" });
    }

    const today = new Date().toISOString().split('T')[0];

    const [existing] = await pool.execute(
      'SELECT id FROM trainer_attendance WHERE member_id = ? AND trainer_id = ? AND attendance_date = ?',
      [memberId, trainerId, today]
    );

    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: "تم تسجيل الحضور مسبقاً اليوم" });
    }

    await pool.execute(
      'INSERT INTO trainer_attendance (member_id, trainer_id, attendance_date) VALUES (?, ?, ?)',
      [memberId, trainerId, today]
    );

    const role = req.headers['x-user-role'] || req.query.role || 'trainer';
    const userName = req.headers['x-user-name'] || 'Unknown';
    await logActivity(role, userName, 'Trainer ' + userName + ' marked attendance for member ' + memberId);

    return res.status(200).json({ success: true, message: "تم تسجيل الحضور بنجاح" });
  } catch (error) {
    console.error('markAttendance error:', error);
    return res.status(500).json({ success: false, message: "خطأ في تسجيل الحضور" });
  }
}

async function getMembersList(req, res) {
  try {
    const [activeMembers] = await pool.execute(
      "SELECT m.*, p.name as plan_name, e.name as trainer_name FROM members m LEFT JOIN plans p ON m.plan_id = p.id LEFT JOIN employees e ON m.trainer_id = e.id WHERE m.status = 'active' ORDER BY m.name"
    );
    const [expiredMembers] = await pool.execute(
      "SELECT m.*, p.name as plan_name, e.name as trainer_name FROM members m LEFT JOIN plans p ON m.plan_id = p.id LEFT JOIN employees e ON m.trainer_id = e.id WHERE m.status = 'expired' ORDER BY m.name"
    );

    return res.status(200).json({
      success: true,
      activeMembers,
      expiredMembers
    });
  } catch (error) {
    console.error('getMembersList error:', error);
    return res.status(500).json({ success: false, message: "خطأ في جلب البيانات" });
  }
}

async function deleteMember(req, res) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ success: false, message: "رقم العضو مطلوب" });
    }

    const [rows] = await pool.execute('SELECT name FROM members WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "العضو غير موجود" });
    }

    const name = rows[0].name;
    await pool.execute('DELETE FROM attendance WHERE member_id = ?', [id]);
    await pool.execute('DELETE FROM members WHERE id = ?', [id]);

    const role = req.headers['x-user-role'] || req.query.role || 'employee';
    const userName = req.headers['x-user-name'] || 'Unknown';
    await logActivity(role, userName, 'User ' + userName + ' deleted member ' + name + ' (' + id + ')');

    return res.status(200).json({ success: true, message: "تم حذف العضو " + name });
  } catch (error) {
    console.error('deleteMember error:', error);
    return res.status(500).json({ success: false, message: "خطأ في حذف العضو" });
  }
}

async function updateMember(req, res) {
  try {
    const { id } = req.params;
    const { name, phone, plan_id, trainer_id } = req.body;

    if (!name || !phone || !plan_id) {
      return res.status(400).json({ success: false, message: "جميع الحقول مطلوبة" });
    }

    const [existing] = await pool.execute('SELECT * FROM members WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: "العضو غير موجود" });
    }

    const [planRows] = await pool.execute('SELECT * FROM plans WHERE id = ? AND status = ?', [plan_id, 'active']);
    if (planRows.length === 0) {
      return res.status(400).json({ success: false, message: "الباقة غير صالحة" });
    }

    const plan = planRows[0];
    const current = existing[0];

    let expiry_date = current.expiry_date;
    if (String(plan_id) !== String(current.plan_id)) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + plan.duration_days);
      expiry_date = expiry.toISOString().split('T')[0];
    }

    await pool.execute(
      'UPDATE members SET name = ?, phone = ?, plan_id = ?, trainer_id = ?, expiry_date = ?, fee_paid = ? WHERE id = ?',
      [name.trim(), phone.trim(), plan_id, trainer_id || null, expiry_date, plan.price, id]
    );

    const role = req.headers['x-user-role'] || req.query.role || 'employee';
    const userName = req.headers['x-user-name'] || 'Unknown';
    await logActivity(role, userName, 'User ' + userName + ' updated member ' + name.trim() + ' (' + id + ')');

    return res.status(200).json({
      success: true,
      message: "تم تحديث بيانات العضو بنجاح",
      member: { id, name: name.trim(), phone: phone.trim(), plan_id, trainer_id: trainer_id || null, expiry_date, fee_paid: plan.price }
    });
  } catch (error) {
    console.error('updateMember error:', error);
    return res.status(500).json({ success: false, message: "خطأ في تحديث بيانات العضو" });
  }
}

async function getMembersByPlan(req, res) {
  try {
    const [plans] = await pool.execute(
      `SELECT p.id, p.name,
        (SELECT COUNT(*) FROM members m WHERE m.plan_id = p.id AND m.status = 'active') as active_count,
        (SELECT COUNT(*) FROM members m WHERE m.plan_id = p.id AND m.status = 'expired') as expired_count
      FROM plans p WHERE p.status = 'active' ORDER BY p.name`
    );
    const planMembers = await Promise.all(plans.map(async (plan) => {
      const [members] = await pool.execute(
        `SELECT m.*, p.name as plan_name, e.name as trainer_name
         FROM members m LEFT JOIN plans p ON m.plan_id = p.id LEFT JOIN employees e ON m.trainer_id = e.id
         WHERE m.plan_id = ? ORDER BY m.status, m.name`,
        [plan.id]
      );
      return { ...plan, members };
    }));
    return res.status(200).json({ success: true, plans: planMembers });
  } catch (error) {
    console.error('getMembersByPlan error:', error);
    return res.status(500).json({ success: false, message: "خطأ في جلب البيانات" });
  }
}

async function searchMembers(req, res) {
  try {
    const { q } = req.query;
    if (!q || q.trim().length === 0) {
      return res.json({ success: true, members: [] });
    }
    const query = '%' + q.trim() + '%';
    const [rows] = await pool.execute(
      `SELECT m.*, p.name as plan_name
       FROM members m
       LEFT JOIN plans p ON m.plan_id = p.id
       WHERE m.name LIKE ? OR m.phone LIKE ?
       LIMIT 10`,
      [query, query]
    );
    return res.json({ success: true, members: rows });
  } catch (error) {
    console.error('searchMembers error:', error);
    return res.status(500).json({ success: false, message: "خطأ في البحث" });
  }
}

async function getRecentAttendance(req, res) {
  try {
    const limit = 5;
    const [rows] = await pool.execute(
      `SELECT a.id, a.member_id, a.timestamp, m.name
       FROM attendance a
       LEFT JOIN members m ON a.member_id = m.id
       ORDER BY a.timestamp DESC
       LIMIT ${limit}`
    );
    return res.json({ success: true, logs: rows });
  } catch (error) {
    console.error('getRecentAttendance error:', error.message);
    return res.status(500).json({ success: false, logs: [] });
  }
}

async function getTrainerAttendanceToday(req, res) {
  try {
    const { trainerId } = req.params;
    const today = new Date().toISOString().split('T')[0];
    const [rows] = await pool.execute(
      `SELECT ta.id, ta.member_id, ta.attendance_date, ta.timestamp, m.name as member_name
       FROM trainer_attendance ta
       LEFT JOIN members m ON ta.member_id = m.id
       WHERE ta.trainer_id = ? AND ta.attendance_date = ?
       ORDER BY ta.timestamp DESC`,
      [trainerId, today]
    );
    return res.status(200).json({ success: true, attendance: rows });
  } catch (error) {
    console.error('getTrainerAttendanceToday error:', error);
    return res.status(500).json({ success: false, message: "خطأ في جلب الحضور" });
  }
}

async function getMemberAttendanceHistory(req, res) {
  try {
    const { memberId, trainerId } = req.params;
    const [rows] = await pool.execute(
      `SELECT ta.*, m.name as member_name, m.phone as member_phone
       FROM trainer_attendance ta
       LEFT JOIN members m ON ta.member_id = m.id
       WHERE ta.member_id = ? AND ta.trainer_id = ?
       ORDER BY ta.attendance_date DESC
       LIMIT 50`,
      [memberId, trainerId]
    );
    return res.status(200).json({ success: true, records: rows });
  } catch (error) {
    console.error('getMemberAttendanceHistory error:', error);
    return res.status(500).json({ success: false, message: "خطأ في جلب سجل الحضور" });
  }
}

async function registerAndPay(req, res) {
  const conn = await pool.getConnection();
  try {
    const { name, phone, plan_id, trainer_id, payment_method, amount_received } = req.body;

    if (!name || !phone || !plan_id) {
      return res.status(400).json({ success: false, message: "جميع الحقول مطلوبة" });
    }

    const [planRows] = await conn.execute('SELECT * FROM plans WHERE id = ? AND status = ?', [plan_id, 'active']);
    if (planRows.length === 0) {
      return res.status(400).json({ success: false, message: "الباقة غير صالحة" });
    }
    const plan = planRows[0];

    const registration_date = new Date().toISOString().split('T')[0];
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + plan.duration_days);
    const expiry_date = expiry.toISOString().split('T')[0];

    const [idRows] = await conn.execute('SELECT id FROM members ORDER BY id DESC LIMIT 1');
    let newId = 'M101';
    if (idRows.length > 0) {
      const num = parseInt(idRows[0].id.substring(1), 10) + 1;
      newId = 'M' + num;
    }

    await conn.beginTransaction();

    await conn.execute(
      `INSERT INTO members (id, name, phone, plan_id, trainer_id, registration_date, expiry_date, status, fee_paid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId, name, phone, plan_id, trainer_id || null, registration_date, expiry_date, 'active', plan.price]
    );

    let paymentRecorded = false;
    let change = 0;
    if (payment_method) {
      const method = payment_method || 'cash';
      const amount = parseFloat(amount_received) || plan.price;
      const paidAmount = Math.min(amount, parseFloat(plan.price));
      await conn.execute(
        'INSERT INTO payments (member_id, plan_id, amount, method, payment_date) VALUES (?, ?, ?, ?, ?)',
        [newId, plan_id, paidAmount, method, registration_date]
      );
      paymentRecorded = true;
      if (method === 'cash' && amount > parseFloat(plan.price)) {
        change = parseFloat((amount - parseFloat(plan.price)).toFixed(2));
      }
    }

    await conn.commit();

    const role = req.headers['x-user-role'] || 'employee';
    const userName = req.headers['x-user-name'] || 'Unknown';
    await logActivity(role, userName, 'User ' + userName + ' registered member ' + name + ' (' + newId + ') with plan ' + plan.name + (paymentRecorded ? ' and payment' : ''));

    return res.status(201).json({
      success: true,
      message: "تم تسجيل العضو بنجاح" + (paymentRecorded ? " وتسجيل الدفع" : ""),
      member: {
        id: newId, name, phone, plan_id,
        trainer_id: trainer_id || null,
        registration_date, expiry_date,
        status: 'active', fee_paid: plan.price
      },
      payment: paymentRecorded ? {
        amount: parseFloat(plan.price),
        method: payment_method || 'cash',
        change: change
      } : null
    });
  } catch (error) {
    console.error('registerAndPay error:', error);
    try { await conn.rollback(); } catch (_) {}
    return res.status(500).json({ success: false, message: "خطأ في تسجيل العضو" });
  } finally {
    conn.release();
  }
}

module.exports = {
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
};
