const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const http = require('http');

let serverProcess = null;

function startServer() {
  return new Promise((resolve, reject) => {
    serverProcess = fork(path.join(__dirname, 'src', 'backend', 'server.js'), [], {
      env: { ...process.env },
      silent: true
    });

    serverProcess.on('message', (msg) => {
      if (msg === 'server-ready') resolve();
    });

    serverProcess.stdout.on('data', (data) => {
      const text = data.toString();
      console.log('[server]', text);
      if (text.includes('Gym server running')) resolve();
    });

    serverProcess.stderr.on('data', (data) => {
      console.error('[server]', data.toString());
    });

    serverProcess.on('error', reject);

    serverProcess.on('exit', (code) => {
      if (code !== 0) reject(new Error('Server exited with code ' + code));
    });

    setTimeout(() => reject(new Error('Server start timeout')), 15000);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.loadFile(path.join(__dirname, 'src', 'frontend', 'index.html'));

  win.once('ready-to-show', () => {
    win.maximize();
  });
}

app.whenReady().then(() => {
  startServer().catch((e) => {
    console.error('Server start failed:', e.message);
  });
  createWindow();
});

// IPC handler: Smart Member Search
// Forwards the search query to the Express API on port 3000
ipcMain.handle('searchMember', async (_event, query) => {
  return new Promise((resolve) => {
    const q = encodeURIComponent(query || '');
    const req = http.get('http://127.0.0.1:3000/api/members/search?q=' + q, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            resolve(JSON.parse(data));
          }
        } catch (_) { resolve({ success: false, members: [] }); }
      });
    });
    req.setTimeout(5000, () => {
      req.destroy();
      resolve({ success: false, members: [] });
    });
    req.on('error', () => {
      resolve({ success: false, members: [] });
    });
  });
});

// IPC handler: Process Membership Payment (transactional)
ipcMain.handle('processMembershipPayment', async (_event, paymentDetails) => {
  return new Promise((resolve) => {
    const postData = JSON.stringify(paymentDetails);
    const options = {
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/payments/process',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (_) { resolve({ success: false, message: 'Invalid response' }); }
      });
    });
    req.setTimeout(10000, () => {
      req.destroy();
      resolve({ success: false, message: 'Request timed out' });
    });
    req.on('error', (err) => {
      resolve({ success: false, message: err.message });
    });
    req.write(postData);
    req.end();
  });
});

// IPC handler: Get Member Status (used for payment lock check)
ipcMain.handle('getMemberStatus', async (_event, memberId) => {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:3000/api/shift/member-status/' + encodeURIComponent(memberId), (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (_) { resolve({ success: false, status: null }); }
      });
    });
    req.setTimeout(5000, () => { req.destroy(); resolve({ success: false, status: null }); });
    req.on('error', () => { resolve({ success: false, status: null }); });
  });
});

// IPC handler: Get Shift Summary (today's payments grouped by method)
ipcMain.handle('getShiftSummary', async () => {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:3000/api/shift/summary', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (_) { resolve({ success: false }); }
      });
    });
    req.setTimeout(5000, () => { req.destroy(); resolve({ success: false }); });
    req.on('error', () => { resolve({ success: false }); });
  });
});

// IPC handler: Close Shift (save reconciliation)
ipcMain.handle('closeShift', async (_event, shiftData) => {
  return new Promise((resolve) => {
    const postData = JSON.stringify(shiftData);
    const options = {
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/shift/close',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (_) { resolve({ success: false, message: 'Invalid response' }); }
      });
    });
    req.setTimeout(10000, () => { req.destroy(); resolve({ success: false, message: 'Request timed out' }); });
    req.on('error', (err) => { resolve({ success: false, message: err.message }); });
    req.write(postData);
    req.end();
  });
});

// IPC handler: Get connection status (online/offline)
ipcMain.handle('getConnectionStatus', async () => {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:3000/api/health', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (_) { resolve({ online: false }); }
      });
    });
    req.setTimeout(3000, () => { req.destroy(); resolve({ online: false }); });
    req.on('error', () => { resolve({ online: false }); });
  });
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
