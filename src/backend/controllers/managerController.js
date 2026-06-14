const { pool } = require('../config/database');
const { logActivity } = require('../utils/activityLogger');

async function getDashboardStats(req, res) {
  try {
    const [incomeRows] = await pool.execute(
      "SELECT COALESCE(SUM(fee_paid),0) as total FROM members WHERE MONTH(registration_date) = MONTH(CURDATE()) AND YEAR(registration_date) = YEAR(CURDATE())"
    );
    const [activeRows] = await pool.execute("SELECT COUNT(*) as count FROM members WHERE status = 'active'");
    const [expiredRows] = await pool.execute("SELECT COUNT(*) as count FROM members WHERE status = 'expired'");

    return res.status(200).json({
      success: true,
      monthly_income: incomeRows[0].total,
      active_count: activeRows[0].count,
      expired_count: expiredRows[0].count
    });
  } catch (error) {
    console.error('getDashboardStats error:', error);
    return res.status(500).json({ success: false, message: "خطأ في جلب الإحصائيات" });
  }
}

async function getPeakHours(req, res) {
  try {
    const [rows] = await pool.execute(
      "SELECT HOUR(timestamp) as hour, COUNT(*) as count FROM attendance WHERE MONTH(timestamp) = MONTH(CURDATE()) GROUP BY HOUR(timestamp) ORDER BY hour ASC"
    );
    return res.status(200).json({ success: true, peak_hours: rows });
  } catch (error) {
    console.error('getPeakHours error:', error);
    return res.status(500).json({ success: false, message: "خطأ في جلب تحليلات الأوقات" });
  }
}

async function getRevenueSpread(req, res) {
  try {
    const [rows] = await pool.execute(
      "SELECT COALESCE(p.name, 'غير محدد') as sub_type, COALESCE(SUM(m.fee_paid),0) as total FROM members m LEFT JOIN plans p ON m.plan_id = p.id GROUP BY m.plan_id"
    );
    return res.status(200).json({ success: true, revenue_spread: rows });
  } catch (error) {
    console.error('getRevenueSpread error:', error);
    return res.status(500).json({ success: false, message: "خطأ في جلب توزيع الإيرادات" });
  }
}

async function getStaffToday(req, res) {
  try {
    const [rows] = await pool.execute("SELECT id, name, phone, role, specialization, is_clocked_in, last_clock_in FROM employees WHERE is_clocked_in = 1 AND DATE(last_clock_in) = CURDATE()");
    return res.status(200).json({ success: true, staff: rows });
  } catch (error) {
    console.error('getStaffToday error:', error);
    return res.status(500).json({ success: false, message: "خطأ في قاعدة البيانات" });
  }
}

async function getAllEmployees(req, res) {
  try {
    const [rows] = await pool.execute(
      'SELECT id, name, phone, role, is_clocked_in, last_clock_in, work_start, work_end, specialization FROM employees ORDER BY name'
    );
    return res.status(200).json({ success: true, employees: rows });
  } catch (error) {
    console.error('getAllEmployees error:', error);
    return res.status(500).json({ success: false, message: "خطأ في جلب الموظفين" });
  }
}

async function createEmployee(req, res) {
  try {
    const { name, role, phone, work_start, work_end, password, specialization } = req.body;

    if (!name || !role) {
      return res.status(400).json({ success: false, message: "الاسم والمسمى الوظيفي مطلوبان" });
    }

    if (!password || password.trim().length < 3) {
      return res.status(400).json({ success: false, message: "كلمة المرور يجب أن تكون 3 أحرف على الأقل" });
    }

    const [idRows] = await pool.execute("SELECT id FROM employees WHERE id LIKE 'E%' ORDER BY id DESC LIMIT 1");
    let newId = 'E201';
    if (idRows.length > 0) {
      const num = parseInt(idRows[0].id.substring(1), 10) + 1;
      newId = 'E' + num;
    }

    await pool.execute(
      'INSERT INTO employees (id, name, role, phone, work_start, work_end, password, specialization) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [newId, name.trim(), role.trim(), phone || null, work_start || null, work_end || null, password.trim(), specialization || null]
    );

    const roleField = req.headers['x-user-role'] || req.query.role || 'manager';
    const userName = req.headers['x-user-name'] || 'Manager';
    await logActivity(roleField, userName, 'Manager added employee ' + name.trim() + ' (' + newId + ')');

    return res.status(201).json({
      success: true,
      message: "تم إضافة الموظف بنجاح",
      employee: { id: newId, name: name.trim(), phone: phone || null, role: role.trim(), work_start: work_start || null, work_end: work_end || null, specialization: specialization || null }
    });
  } catch (error) {
    console.error('createEmployee error:', error);
    return res.status(500).json({ success: false, message: "خطأ في إضافة الموظف" });
  }
}

async function clockInEmployee(req, res) {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ success: false, message: "رقم الموظف مطلوب" });
    }

    const [rows] = await pool.execute('SELECT is_clocked_in, name FROM employees WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "الموظف غير موجود" });
    }

    const emp = rows[0];
    const newValue = emp.is_clocked_in === 1 ? 0 : 1;
    const empName = emp.name;
    if (newValue === 1) {
      await pool.execute('UPDATE employees SET is_clocked_in = 1, last_clock_in = NOW() WHERE id = ?', [id]);
    } else {
      await pool.execute('UPDATE employees SET is_clocked_in = 0 WHERE id = ?', [id]);
    }

    const userName = req.headers['x-user-name'] || id;
    await logActivity('employee', userName, 'Employee ' + empName + ' (' + id + ') clocked ' + (newValue === 1 ? 'in' : 'out'));

    return res.status(200).json({ success: true, is_clocked_in: newValue, message: newValue === 1 ? 'تم تسجيل الدخول' : 'تم تسجيل الخروج' });
  } catch (error) {
    console.error('clockInEmployee error:', error);
    return res.status(500).json({ success: false, message: "خطأ في تسجيل الوقت" });
  }
}

async function deleteEmployee(req, res) {
  try {
    const { id } = req.params;

    if (id === 'ADMIN') {
      return res.status(403).json({ success: false, message: "لا يمكن حذف حساب المدير الرئيسي" });
    }

    const [rows] = await pool.execute('SELECT name FROM employees WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "الموظف غير موجود" });
    }

    const name = rows[0].name;
    await pool.execute('DELETE FROM employees WHERE id = ?', [id]);

    const role = req.headers['x-user-role'] || req.query.role || 'manager';
    const userName = req.headers['x-user-name'] || 'Manager';
    await logActivity(role, userName, 'Manager deleted employee ' + name + ' (' + id + ')');

    return res.status(200).json({ success: true, message: "تم حذف الموظف " + name });
  } catch (error) {
    console.error('deleteEmployee error:', error);
    return res.status(500).json({ success: false, message: "خطأ في حذف الموظف" });
  }
}

async function updateEmployee(req, res) {
  try {
    const { id } = req.params;
    const { name, role, phone, work_start, work_end, password, specialization } = req.body;

    if (!name || !role) {
      return res.status(400).json({ success: false, message: "الاسم والمسمى الوظيفي مطلوبان" });
    }

    const [existing] = await pool.execute('SELECT id FROM employees WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: "الموظف غير موجود" });
    }

    if (password) {
      await pool.execute(
        'UPDATE employees SET name = ?, role = ?, phone = ?, work_start = ?, work_end = ?, password = ?, specialization = ? WHERE id = ?',
        [name.trim(), role.trim(), phone || null, work_start || null, work_end || null, password, specialization || null, id]
      );
    } else {
      await pool.execute(
        'UPDATE employees SET name = ?, role = ?, phone = ?, work_start = ?, work_end = ?, specialization = ? WHERE id = ?',
        [name.trim(), role.trim(), phone || null, work_start || null, work_end || null, specialization || null, id]
      );
    }

    const roleField = req.headers['x-user-role'] || req.query.role || 'manager';
    const userName = req.headers['x-user-name'] || 'Manager';
    await logActivity(roleField, userName, 'Manager updated employee ' + name.trim() + ' (' + id + ')');

    return res.status(200).json({
      success: true,
      message: "تم تحديث بيانات الموظف بنجاح",
      employee: { id, name: name.trim(), phone: phone || null, role: role.trim(), work_start: work_start || null, work_end: work_end || null, specialization: specialization || null }
    });
  } catch (error) {
    console.error('updateEmployee error:', error);
    return res.status(500).json({ success: false, message: "خطأ في تحديث بيانات الموظف" });
  }
}

async function updateEmployeeSchedule(req, res) {
  try {
    const { id } = req.params;
    const { work_start, work_end } = req.body;

    await pool.execute(
      'UPDATE employees SET work_start = ?, work_end = ? WHERE id = ?',
      [work_start || null, work_end || null, id]
    );

    return res.status(200).json({ success: true, message: "تم تحديث جدول العمل" });
  } catch (error) {
    console.error('updateEmployeeSchedule error:', error);
    return res.status(500).json({ success: false, message: "خطأ في تحديث جدول العمل" });
  }
}

async function getAuditLogs(req, res) {
  try {
    const { filterRole, user, search, dateFrom, dateTo, limit } = req.query;
    const conditions = [];
    const params = [];

    if (filterRole) {
      conditions.push('user_role = ?');
      params.push(filterRole);
    }
    if (user) {
      conditions.push('user_name LIKE ?');
      params.push('%' + user + '%');
    }
    if (search) {
      conditions.push('action_details LIKE ?');
      params.push('%' + search + '%');
    }
    if (dateFrom) {
      conditions.push('timestamp >= ?');
      params.push(dateFrom + ' 00:00:00');
    }
    if (dateTo) {
      conditions.push('timestamp <= ?');
      params.push(dateTo + ' 23:59:59');
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    const rowLimit = Math.min(parseInt(limit, 10) || 50, 500);

    const [rows] = await pool.execute(
      'SELECT id, user_role, user_name, action_details, timestamp FROM audit_logs ' + whereClause + ' ORDER BY timestamp DESC LIMIT ' + rowLimit,
      params
    );
    return res.status(200).json({ success: true, logs: rows });
  } catch (error) {
    console.error('getAuditLogs error:', error);
    return res.status(500).json({ success: false, message: "خطأ في جلب السجلات" });
  }
}

async function saveEmployeeWorkdays(req, res) {
  try {
    const { employee_id, days } = req.body;
    if (!employee_id || !Array.isArray(days)) {
      return res.status(400).json({ success: false, message: 'بيانات غير صحيحة' });
    }

    await pool.execute('DELETE FROM employee_workdays WHERE employee_id = ?', [employee_id]);

    if (days.length > 0) {
      const placeholders = days.map(() => '(?, ?)').join(',');
      const values = [];
      days.forEach(d => { values.push(employee_id, d); });
      await pool.execute(`INSERT INTO employee_workdays (employee_id, day_of_week) VALUES ${placeholders}`, values);
    }

    return res.status(200).json({ success: true, message: 'تم حفظ أيام العمل' });
  } catch (error) {
    console.error('saveEmployeeWorkdays error:', error);
    return res.status(500).json({ success: false, message: 'خطأ في حفظ أيام العمل' });
  }
}

async function getEmployeeWorkdays(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute('SELECT day_of_week FROM employee_workdays WHERE employee_id = ? ORDER BY day_of_week', [id]);
    return res.status(200).json({ success: true, days: rows.map(r => r.day_of_week) });
  } catch (error) {
    console.error('getEmployeeWorkdays error:', error);
    return res.status(500).json({ success: false, message: 'خطأ في جلب أيام العمل' });
  }
}

async function getAllTrainersWorkdays(req, res) {
  try {
    const [trainers] = await pool.execute("SELECT id, name, phone, specialization, work_start, work_end FROM employees WHERE role = 'مدرب' ORDER BY name");
    const [workdays] = await pool.execute('SELECT employee_id, day_of_week FROM employee_workdays ORDER BY employee_id, day_of_week');

    const workdaysMap = {};
    workdays.forEach(w => {
      if (!workdaysMap[w.employee_id]) workdaysMap[w.employee_id] = [];
      workdaysMap[w.employee_id].push(w.day_of_week);
    });

    const trainersWithDays = trainers.map(t => ({
      ...t,
      workdays: workdaysMap[t.id] || []
    }));

    return res.status(200).json({ success: true, trainers: trainersWithDays });
  } catch (error) {
    console.error('getAllTrainersWorkdays error:', error);
    return res.status(500).json({ success: false, message: 'خطأ في جلب أيام العمل' });
  }
}

async function getTrainerWorkStatus(req, res) {
  try {
    const { trainerId } = req.params;
    const [empRows] = await pool.execute(
      'SELECT id, name, role, work_start, work_end, is_clocked_in FROM employees WHERE id = ?',
      [trainerId]
    );
    if (empRows.length === 0) {
      return res.status(404).json({ success: false, message: 'المدرب غير موجود' });
    }
    const today = new Date().getDay();
    const [wdRows] = await pool.execute(
      'SELECT day_of_week FROM employee_workdays WHERE employee_id = ? AND day_of_week = ?',
      [trainerId, today]
    );
    return res.status(200).json({
      success: true,
      trainer: empRows[0],
      today_day_of_week: today,
      is_work_day: wdRows.length > 0
    });
  } catch (error) {
    console.error('getTrainerWorkStatus error:', error);
    return res.status(500).json({ success: false, message: 'خطأ في جلب حالة الدوام' });
  }
}

module.exports = { getDashboardStats, getPeakHours, getRevenueSpread, getStaffToday, getAllEmployees, createEmployee, clockInEmployee, deleteEmployee, updateEmployee, updateEmployeeSchedule, getAuditLogs, saveEmployeeWorkdays, getEmployeeWorkdays, getAllTrainersWorkdays, getTrainerWorkStatus };
