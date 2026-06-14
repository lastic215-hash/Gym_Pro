const mysql = require('mysql2/promise');
const { SmartPool } = require('./smartPool');

// Local MySQL (always available on same machine)
const LOCAL_CONFIG = {
  host: process.env.LOCAL_DB_HOST || 'localhost',
  port: parseInt(process.env.LOCAL_DB_PORT, 10) || 3306,
  user: process.env.LOCAL_DB_USER || 'root',
  password: process.env.LOCAL_DB_PASSWORD || 'Root@123',
  database: process.env.LOCAL_DB_NAME || 'gym_pro',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
};

// Cloud MySQL (Railway)
const CLOUD_CONFIG = {
  host: process.env.DB_HOST || 'acela.proxy.rlwy.net',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'Root@123',
  database: process.env.DB_NAME || 'gym_pro',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  charset: 'utf8mb4'
};

let smartPool = null;

const SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS members (
    id VARCHAR(10) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    plan_id INT,
    trainer_id VARCHAR(10),
    registration_date DATE,
    expiry_date DATE,
    status VARCHAR(20) DEFAULT 'active',
    fee_paid DECIMAL(10,2) DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS plans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    duration_days INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) DEFAULT 'active'
  )`,
  `CREATE TABLE IF NOT EXISTS employees (
    id VARCHAR(10) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50),
    works_today TINYINT(1) DEFAULT 1,
    work_start TIME,
    work_end TIME,
    password VARCHAR(255)
  )`,
  `CREATE TABLE IF NOT EXISTS attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_id VARCHAR(10),
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS trainer_attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_id VARCHAR(10) NOT NULL,
    trainer_id VARCHAR(10) NOT NULL,
    attendance_date DATE NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_attendance (member_id, trainer_id, attendance_date)
  )`,
  `CREATE TABLE IF NOT EXISTS expenses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    description VARCHAR(255) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    category VARCHAR(100) NOT NULL,
    expense_date DATE NOT NULL,
    created_by VARCHAR(255) DEFAULT NULL,
    created_by_id VARCHAR(50) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_role VARCHAR(100),
    user_name VARCHAR(255),
    action_details TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS trainer_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trainer_id VARCHAR(10) NOT NULL,
    member_id VARCHAR(10) NOT NULL,
    session_date DATE NOT NULL,
    session_price DECIMAL(10,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',
    confirmed_by VARCHAR(10),
    confirmed_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_id VARCHAR(10) NOT NULL,
    plan_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    method VARCHAR(50) NOT NULL,
    payment_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS shift_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    shift_date DATE NOT NULL,
    expected_total DECIMAL(10,2) NOT NULL,
    actual_cash DECIMAL(10,2) NOT NULL,
    discrepancy DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) NOT NULL,
    closed_by VARCHAR(255),
    closed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS treasury_deposits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    deposit_date DATE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    deposited_by VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS employee_workdays (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id VARCHAR(10) NOT NULL,
    day_of_week TINYINT NOT NULL,
    UNIQUE KEY unique_emp_day (employee_id, day_of_week)
  )`,
  `CREATE TABLE IF NOT EXISTS __sync_queue (
    id INT AUTO_INCREMENT PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    operation VARCHAR(20) NOT NULL,
    sql_text TEXT NOT NULL,
    params_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`
];

const MIGRATIONS = [
  "ALTER TABLE employees ADD COLUMN specialization VARCHAR(100) DEFAULT NULL",
  "ALTER TABLE employees ADD COLUMN phone VARCHAR(50) DEFAULT NULL",
  "ALTER TABLE employees ADD COLUMN is_clocked_in TINYINT(1) DEFAULT 0",
  "ALTER TABLE employees ADD COLUMN last_clock_in DATETIME DEFAULT NULL",
  "ALTER TABLE employees ADD COLUMN base_salary DECIMAL(10,2) DEFAULT 0",
  "ALTER TABLE employees ADD COLUMN commission_rate DECIMAL(5,2) DEFAULT 10.00",
  "ALTER TABLE expenses ADD COLUMN created_by VARCHAR(255) DEFAULT NULL",
  "ALTER TABLE expenses ADD COLUMN created_by_id VARCHAR(50) DEFAULT NULL",
  "ALTER TABLE members ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
  "ALTER TABLE employees ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
  "ALTER TABLE plans ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
  "ALTER TABLE expenses ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
  "ALTER TABLE payments ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
  "ALTER TABLE attendance ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
];

async function _initSchema(pool) {
  for (const sql of SCHEMA_SQL) {
    await pool.execute(sql);
  }
  for (const sql of MIGRATIONS) {
    try { await pool.execute(sql); } catch (_) {}
  }
}

async function _ensureLocalDatabaseExists() {
  const conn = await mysql.createConnection({
    host: LOCAL_CONFIG.host,
    port: LOCAL_CONFIG.port,
    user: LOCAL_CONFIG.user,
    password: LOCAL_CONFIG.password
  });
  await conn.execute(
    `CREATE DATABASE IF NOT EXISTS \`${LOCAL_CONFIG.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await conn.end();
}

async function initializeDatabase() {
  let localOk = false;

  // Try local MySQL — optional
  try {
    await _ensureLocalDatabaseExists();
    localOk = true;
  } catch (e) {
    console.warn('[database] Local MySQL not available:', e.message);
    console.warn('[database] Will attempt to use cloud MySQL as primary');
  }

  smartPool = new SmartPool(LOCAL_CONFIG, CLOUD_CONFIG);

  // Init local pool (if local MySQL is reachable)
  if (localOk) {
    const ok = await smartPool.initLocalPool();
    if (!ok) {
      console.warn('[database] Failed to initialize local MySQL pool, falling back to cloud');
      localOk = false;
    }
  }

  // Try connecting to cloud MySQL
  const cloudOk = await smartPool.tryConnectCloud();

  if (!localOk && !cloudOk) {
    throw new Error('No database available. Ensure either local MySQL or cloud MySQL is configured.');
  }

  // Create schema on the available pool
  if (smartPool.localPool) {
    await _initSchema(smartPool.localPool);
    console.log('[database] Local MySQL schema ready');
  }
  if (smartPool.cloudPool) {
    try {
      await _initSchema(smartPool.cloudPool);
      console.log('[database] Cloud MySQL schema verified');
    } catch (e) {
      console.warn('[database] Could not verify cloud schema:', e.message);
    }
  }

  smartPool.startHealthCheck(15000);
  const mode = cloudOk ? 'connected' : 'offline';
  console.log('[database] Initialized (local:', localOk ? 'yes' : 'no', '| cloud:', mode, ')');

  return smartPool;
}

const pool = new Proxy({}, {
  get(target, prop) {
    if (prop === 'execute') {
      return async (sql, params) => {
        if (!smartPool) throw new Error('Database not initialized. Call initializeDatabase() first.');
        return smartPool.execute(sql, params);
      };
    }
    if (prop === 'getConnection') {
      return async () => {
        if (!smartPool) throw new Error('Database not initialized.');
        return smartPool.getConnection();
      };
    }
    if (prop === 'end') {
      return async () => {
        if (smartPool) await smartPool.end();
      };
    }
    if (prop === 'isOnline') {
      return smartPool ? smartPool.isOnline : false;
    }
    if (prop === 'onEvent') {
      return (cb) => { if (smartPool) smartPool.onEvent(cb); };
    }
    return undefined;
  }
});

function setStatusCallback(cb) {
  if (smartPool) smartPool.onEvent(cb);
}

function getSmartPool() {
  return smartPool;
}

module.exports = { pool, initializeDatabase, setStatusCallback, getSmartPool };
