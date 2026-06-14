const MAX_RETRY = 3;

class SyncEngine {
  constructor(smartPool) {
    this.smartPool = smartPool;
    this._syncTimer = null;
    this._syncInProgress = false;
    this._lastSyncResult = { synced: 0, failed: 0, timestamp: null };
    this._listeners = [];
  }

  get lastSyncResult() { return this._lastSyncResult; }

  onEvent(cb) { this._listeners.push(cb); }

  _notify(event, data) {
    for (const cb of this._listeners) {
      try { cb(event, data); } catch (_) {}
    }
  }

  start() {
    // Sync engine only makes sense when there's a local pool to sync from
    if (!this.smartPool.localPool) {
      console.log('[SyncEngine] No local pool — sync engine disabled');
      return;
    }

    this.smartPool.onEvent((event) => {
      if (event === 'online') {
        console.log('[SyncEngine] Cloud online, starting sync...');
        this.sync();
      }
    });

    this._syncTimer = setInterval(() => {
      if (this.smartPool.isOnline) {
        this.sync();
      }
    }, 30000);

    if (this.smartPool.isOnline) {
      setTimeout(() => this.sync(), 2000);
    }

    console.log('[SyncEngine] Started');
  }

  stop() {
    if (this._syncTimer) {
      clearInterval(this._syncTimer);
      this._syncTimer = null;
    }
  }

  async sync() {
    if (this._syncInProgress) return;
    if (!this.smartPool.isOnline) return;
    if (!this.smartPool.localPool || !this.smartPool.cloudPool) return;

    this._syncInProgress = true;
    let synced = 0;
    let failed = 0;

    try {
      const [rows] = await this.smartPool.localPool.execute(
        'SELECT id, table_name, operation, sql_text, params_json FROM __sync_queue ORDER BY id ASC LIMIT 50'
      );

      if (rows.length === 0) {
        this._syncInProgress = false;
        return;
      }

      console.log('[SyncEngine] Syncing ' + rows.length + ' queued operations...');
      this._notify('sync-start', { total: rows.length });

      for (const row of rows) {
        let retries = 0;
        let success = false;
        const op = (row.operation || '').toUpperCase();
        const tbl = row.table_name || '?';
        console.log(`[SyncEngine] ▶ ${op} on ${tbl} (#${row.id}): ${(row.sql_text || '').substring(0, 100)}`);
        while (retries < MAX_RETRY && !success) {
          try {
            const params = row.params_json ? JSON.parse(row.params_json) : [];
            const finalParams = params.length > 0 ? params : undefined;
            const [result] = await this.smartPool.cloudPool.execute(row.sql_text, finalParams);

            if ((op === 'UPDATE' || op === 'DELETE') && result.affectedRows === 0) {
              console.log(`[SyncEngine] ⏳ ${op} on ${tbl} (#${row.id}): 0 rows affected, keeping in queue for next cycle`);
              break;
            }

            await this.smartPool.localPool.execute('DELETE FROM __sync_queue WHERE id = ?', [row.id]);
            console.log(`[SyncEngine] ✅ ${op} on ${tbl} (#${row.id})`);
            synced++;
            success = true;
          } catch (e) {
            retries++;
            if (retries >= MAX_RETRY) {
              console.error(`[SyncEngine] ❌ ${op} on ${tbl} (#${row.id}) after ${MAX_RETRY} retries:`, e.message.substring(0, 200));
              await this.smartPool.localPool.execute('DELETE FROM __sync_queue WHERE id = ?', [row.id]);
              failed++;
            } else {
              console.warn(`[SyncEngine] ⚠ Retry ${retries}/${MAX_RETRY} for ${op} on ${tbl} (#${row.id}):`, e.message.substring(0, 100));
              await new Promise(r => setTimeout(r, 1000 * retries));
            }
          }
        }
      }

      this._lastSyncResult = { synced, failed, timestamp: new Date().toISOString() };
      console.log('[SyncEngine] Sync done: ' + synced + ' pushed, ' + failed + ' dropped');
      this._notify('sync-end', { synced, failed });

      const [remaining] = await this.smartPool.localPool.execute('SELECT COUNT(*) as cnt FROM __sync_queue');
      if (remaining[0].cnt > 0) {
        setTimeout(() => this.sync(), 1000);
      }
    } catch (e) {
      console.error('[SyncEngine] Sync error:', e.message);
      this._lastSyncResult = { synced, failed, timestamp: new Date().toISOString(), error: e.message };
      this._notify('sync-error', { synced, failed, error: e.message });
    } finally {
      this._syncInProgress = false;
    }
  }
}

module.exports = { SyncEngine };
