const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const membersRouter = require('./routes/members');
const managerRouter = require('./routes/manager');
const plansRouter = require('./routes/plans');
const paymentsRouter = require('./routes/payments');
const shiftsRouter = require('./routes/shifts');
const { initializeDatabase } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());
app.use('/api', membersRouter);
app.use('/api/manager', managerRouter);
app.use('/api/plans', plansRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/shift', shiftsRouter);
app.use(express.static(path.join(__dirname, '..', 'frontend')));

const { cleanupOldAttendance } = require('./controllers/memberController');
const { SyncEngine } = require('./utils/syncEngine');

let syncEngine = null;
let serverOnline = false;

// Health / sync-status endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    online: serverOnline,
    sync_queue: syncEngine ? syncEngine.lastSyncResult : 0
  });
});

async function start() {
  try {
    const smartPool = await initializeDatabase();

    syncEngine = new SyncEngine(smartPool);
    syncEngine.start();

    serverOnline = smartPool.isOnline;
    smartPool.onEvent((event) => {
      if (event === 'online') serverOnline = true;
      if (event === 'offline') serverOnline = false;
    });

    app.listen(PORT, () => {
      console.log(`Gym server running on http://localhost:${PORT}`);
      if (process.send) process.send('server-ready');
    });

    // Run attendance cleanup every hour
    cleanupOldAttendance();
    setInterval(cleanupOldAttendance, 60 * 60 * 1000);
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

start();
