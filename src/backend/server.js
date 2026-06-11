const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();;

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

async function start() {
  try {
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(`Gym server running on http://localhost:${PORT}`);
      if (process.send) process.send('server-ready');
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    console.error('Make sure MySQL is running and credentials are correct in src/backend/config/database.js');
    process.exit(1);
  }
}

start();
