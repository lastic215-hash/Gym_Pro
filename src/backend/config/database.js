const mysql = require('mysql2/promise');
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'Root@123',
  database: process.env.DB_NAME || 'gym_pro',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
};
const pool = mysql.createPool(DB_CONFIG);
async function initializeDatabase() {
  const initConn = await mysql.createConnection({
    host: DB_CONFIG.host,
    port: DB_CONFIG.port,
    user: DB_CONFIG.user,
    password: DB_CONFIG.password
  });
  await initConn.execute(
    `CREATE DATABASE IF NOT EXISTS \`${DB_CONFIG.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await initConn.end();
  await pool.execute(`CREATE TABLE IF NOT EXISTS members (
    id VARCHAR(10) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    plan_id INT,
    trainer_id VARCHAR(10),
    registration_date DATE,
    expiry_date DATE,
    status VARCHAR(20) DEFAULT 'active',
    fee_paid DECIMAL(10,2) DEFAULT 0
  )`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS plans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    duration_days INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) DEFAULT 'active'
  )`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS employees (
    id VARCHAR(10) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50),
    works_today TINYINT(1) DEFAULT 1,
    work_start TIME,
    work_end TIME,
    password VARCHAR(255)
  )`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_id VARCHAR(10),
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS trainer_attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_id VARCHAR(10) NOT NULL,
    trainer_id VARCHAR(10) NOT NULL,
    attendance_date DATE NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_attendance (member_id, trainer_id, attendance_date)
  )`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS expenses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    description VARCHAR(255) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    category VARCHAR(100) NOT NULL,
    expense_date DATE NOT NULL,
    created_by VARCHAR(255) DEFAULT NULL,
    created_by_id VARCHAR(50) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_role VARCHAR(100),
    user_name VARCHAR(255),
    action_details TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  try { await pool.execute("ALTER TABLE employees ADD COLUMN specialization VARCHAR(100) DEFAULT NULL"); } catch (_) {}
  try { await pool.execute("ALTER TABLE employees ADD COLUMN phone VARCHAR(50) DEFAULT NULL"); } catch (_) {}
  try { await pool.execute("ALTER TABLE employees ADD COLUMN is_clocked_in TINYINT(1) DEFAULT 0"); } catch (_) {}
  try { await pool.execute("ALTER TABLE employees ADD COLUMN last_clock_in DATETIME DEFAULT NULL"); } catch (_) {}
  try { await pool.execute("ALTER TABLE employees ADD COLUMN base_salary DECIMAL(10,2) DEFAULT 0"); } catch (_) {}
  try { await pool.execute("ALTER TABLE employees ADD COLUMN commission_rate DECIMAL(5,2) DEFAULT 10.00"); } catch (_) {}
  try { await pool.execute("ALTER TABLE expenses ADD COLUMN created_by VARCHAR(255) DEFAULT NULL"); } catch (_) {}
  try { await pool.execute("ALTER TABLE expenses ADD COLUMN created_by_id VARCHAR(50) DEFAULT NULL"); } catch (_) {}
  await pool.execute(`CREATE TABLE IF NOT EXISTS trainer_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trainer_id VARCHAR(10) NOT NULL,
    member_id VARCHAR(10) NOT NULL,
    session_date DATE NOT NULL,
    session_price DECIMAL(10,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',
    confirmed_by VARCHAR(10),
    confirmed_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_id VARCHAR(10) NOT NULL,
    plan_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    method VARCHAR(50) NOT NULL,
    payment_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS shift_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    shift_date DATE NOT NULL,
    expected_total DECIMAL(10,2) NOT NULL,
    actual_cash DECIMAL(10,2) NOT NULL,
    discrepancy DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) NOT NULL,
    closed_by VARCHAR(255),
    closed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS treasury_deposits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    deposit_date DATE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    deposited_by VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  console.log('Database initialized successfully');
}
module.exports = { pool, initializeDatabase };
