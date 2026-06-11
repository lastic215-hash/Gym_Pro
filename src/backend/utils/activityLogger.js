const { pool } = require('../config/database');

async function logActivity(userRole, userName, actionDetails) {
  try {
    await pool.execute(
      'INSERT INTO audit_logs (user_role, user_name, action_details) VALUES (?, ?, ?)',
      [userRole, userName, actionDetails]
    );
  } catch (error) {
    console.error('logActivity error:', error);
  }
}

module.exports = { logActivity };
