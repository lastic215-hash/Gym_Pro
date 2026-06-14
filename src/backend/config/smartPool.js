const mysql = require('mysql2/promise');

class SmartConnection {
  constructor(smartPool) {
    this.smartPool = smartPool;
    this.mysqlConn = null;
  }

  async _ensureConn() {
    if (this.mysqlConn) return this.mysqlConn;
    if (this.smartPool.localPool) {
      this.mysqlConn = await this.smartPool.localPool.getConnection();
      return this.mysqlConn;
    }
    if (this.smartPool.cloudPool) {
      this.mysqlConn = await this.smartPool.cloudPool.getConnection();
      return this.mysqlConn;
    }
    throw new Error('No database pool available');
  }

  async execute(sql, params) {
    const conn = await this._ensureConn();
    const finalParams = params == null ? undefined : params;
    const [rows] = await conn.execute(sql, finalParams);

    if (_isMutation(sql) && !_isSyncQueueOp(sql)) {
      this.smartPool._enqueueSync(sql, params);
    }
    return [rows];
  }

  async beginTransaction() {
    const conn = await this._ensureConn();
    await conn.beginTransaction();
  }

  async commit() {
    if (this.mysqlConn) await this.mysqlConn.commit();
  }

  async rollback() {
    if (this.mysqlConn) {
      try { await this.mysqlConn.rollback(); } catch (_) {}
    }
  }

  release() {
    if (this.mysqlConn) {
      try { this.mysqlConn.release(); } catch (_) {}
      this.mysqlConn = null;
    }
  }
}

class SmartPool {
  constructor(localConfig, cloudConfig) {
    this.localConfig = localConfig;
    this.cloudConfig = cloudConfig;

    this.localPool = null;
    this.cloudPool = null;
    this._isOnline = false;
    this._connecting = false;
    this._healthCheckInterval = null;
    this._listeners = [];
  }

  get isOnline() { return this._isOnline; }

  async initLocalPool() {
    try {
      this.localPool = mysql.createPool(this.localConfig);
      const conn = await this.localPool.getConnection();
      await conn.execute('SELECT 1');
      conn.release();
      console.log('[SmartPool] Local MySQL pool ready');
      return true;
    } catch (e) {
      console.error('[SmartPool] Failed to init local MySQL:', e.message);
      return false;
    }
  }

  async tryConnectCloud() {
    if (this._connecting) return false;
    this._connecting = true;
    try {
      if (this.cloudPool) {
        try { await this.cloudPool.end(); } catch (_) {}
        this.cloudPool = null;
      }
      const pool = mysql.createPool(this.cloudConfig);
      const conn = await pool.getConnection();
      await conn.execute('SELECT 1');
      conn.release();
      this.cloudPool = pool;
      this._setOnline();
      return true;
    } catch (e) {
      this.cloudPool = null;
      this._setOffline(e.message);
      return false;
    } finally {
      this._connecting = false;
    }
  }

  _setOnline() {
    if (!this._isOnline) {
      this._isOnline = true;
      console.log('[SmartPool] Railway cloud MySQL connected');
      if (this._onStatusChange) this._onStatusChange(true);
      this._emit('online');
    }
  }

  _setOffline(reason) {
    if (this._isOnline) {
      this._isOnline = false;
      console.log('[SmartPool] Railway disconnected:', reason);
      if (this._onStatusChange) this._onStatusChange(false);
      this._emit('offline');
    }
  }

  _emit(event) {
    for (const l of this._listeners) {
      try { l(event, this._isOnline); } catch (_) {}
    }
  }

  onEvent(cb) { this._listeners.push(cb); }

  set onStatusChange(cb) { this._onStatusChange = cb; }

  async _healthCheck() {
    if (this._connecting) return;
    if (!this.cloudPool) {
      await this.tryConnectCloud();
      return;
    }
    try {
      const conn = await this.cloudPool.getConnection();
      await conn.execute('SELECT 1');
      conn.release();
      this._setOnline();
    } catch (e) {
      this._setOffline('Health check: ' + e.message);
      this.cloudPool = null;
    }
  }

  startHealthCheck(intervalMs = 15000) {
    if (this._healthCheckInterval) clearInterval(this._healthCheckInterval);
    this._healthCheckInterval = setInterval(() => this._healthCheck(), intervalMs);
  }

  stopHealthCheck() {
    if (this._healthCheckInterval) {
      clearInterval(this._healthCheckInterval);
      this._healthCheckInterval = null;
    }
  }

  async _enqueueSync(sql, params) {
    // Nothing to sync from if there's no local pool
    if (!this.localPool) return;
    const op = _extractOp(sql);
    const table = _extractTable(sql);
    console.log(`[Sync] _enqueueSync: ${op} on ${table}`);
    try {
      await this.localPool.execute(
        `INSERT INTO __sync_queue (table_name, operation, sql_text, params_json, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [table, op, sql, JSON.stringify(params || [])]
      );
      console.log(`[Sync] ✅ Queued: ${op} on ${table}`);
    } catch (e) {
      console.error(`[Sync] ❌ Failed to enqueue ${op} on ${table}:`, e.message);
    }
  }

  async execute(sql, params) {
    const finalParams = params == null ? undefined : params;
    let pool = this.localPool;

    if (!pool) {
      if (!this.cloudPool) throw new Error('No database pool available');
      pool = this.cloudPool;
    }

    const [rows] = await pool.execute(sql, finalParams);

    // Only enqueue sync when local pool is the source
    if (this.localPool && _isMutation(sql) && !_isSyncQueueOp(sql)) {
      this._enqueueSync(sql, params);
    }

    return [rows];
  }

  async getConnection() {
    return new SmartConnection(this);
  }

  async end() {
    this.stopHealthCheck();
    if (this.cloudPool) { try { await this.cloudPool.end(); } catch (_) {} }
    if (this.localPool) { try { await this.localPool.end(); } catch (_) {} }
  }
}

function _isMutation(sql) {
  if (!sql) return false;
  return /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql);
}

function _isSyncQueueOp(sql) {
  if (!sql) return false;
  return sql.includes('__sync_queue');
}

function _extractTable(sql) {
  const m = (sql || '').match(/(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+`?(\w+)`?/i);
  return m ? m[1] : 'unknown';
}

function _extractOp(sql) {
  const t = (sql || '').trim().substring(0, 10).toUpperCase();
  if (t.startsWith('INSERT')) return 'INSERT';
  if (t.startsWith('UPDATE')) return 'UPDATE';
  if (t.startsWith('DELETE')) return 'DELETE';
  if (t.startsWith('REPLACE')) return 'REPLACE';
  return 'UNKNOWN';
}

module.exports = { SmartPool };
