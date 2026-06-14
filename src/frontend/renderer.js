document.addEventListener('DOMContentLoaded', () => {
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const API_BASE = (window.location.protocol === 'file:' || (isLocal && window.location.port !== '3000')) ? 'http://localhost:3000/api' : '/api';
  let currentUser = null;

  // ================================================================
  //  AUTH - Login / Logout / Session restore
  // ================================================================
  const loginScreen = document.getElementById('login-screen');
  const mainApp = document.getElementById('main-app');
  const loginForm = document.getElementById('login-form');
  const loginUsername = document.getElementById('login-username');
  const loginPassword = document.getElementById('login-password');
  const loginError = document.getElementById('login-error');
  const logoutBtn = document.getElementById('logout-btn');

  // Fetch wrapper that injects role header
  async function apiFetch(url, options = {}) {
    const headers = { ...options.headers };
    if (currentUser) {
      headers['x-user-role'] = currentUser.role;
      headers['x-user-name'] = currentUser.id;
      const sep = url.includes('?') ? '&' : '?';
      url += sep + 'role=' + encodeURIComponent(currentUser.role) + '&displayName=' + encodeURIComponent(currentUser.name);
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const opts = { ...options, headers, signal: controller.signal };
    try {
      const res = await fetch(url, opts);
      return res;
    } finally {
      clearTimeout(timeoutId);
    }
  }



  function setSession(user) {
    try { localStorage.setItem('gym_current_user', JSON.stringify(user)); } catch (_) {}
  }

  function clearSession() {
    try { localStorage.removeItem('gym_current_user'); } catch (_) {}
  }

  function getSession() {
    try {
      const raw = localStorage.getItem('gym_current_user');
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  function applyRoleVisibility(role) {
    document.querySelectorAll('[data-role]').forEach((el) => {
      if (el.getAttribute('data-role') === role) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    });
  }

  function updateClockBtn() {
    const btn = document.getElementById('sidebar-clock-btn');
    const txt = document.getElementById('clock-btn-text');
    if (!btn || !txt) return;
    if (currentUser && currentUser.role !== 'manager') {
      btn.classList.remove('hidden');
      btn.disabled = false;
      if (currentUser.is_clocked_in) {
        txt.textContent = 'تسجيل الخروج';
        btn.className = 'mt-2 w-full px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-200 bg-rose-600/20 text-rose-400 border-rose-700/40 hover:bg-rose-600/30';
      } else {
        txt.textContent = 'تسجيل الدخول';
        btn.className = 'mt-2 w-full px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-200 bg-emerald-600/20 text-emerald-400 border-emerald-700/40 hover:bg-emerald-600/30';
      }
    } else {
      btn.classList.add('hidden');
    }
  }

  function enterApp() {
    loginScreen.classList.add('hidden');
    mainApp.classList.remove('hidden');

    const userNameEl = document.getElementById('sidebar-user-name');
    const userRoleEl = document.getElementById('sidebar-user-role');
    if (userNameEl) userNameEl.textContent = currentUser.name;
    if (userRoleEl) {
      const labels = { manager: 'مدير', receptionist: 'موظف استقبال', trainer: 'مدرب' };
      userRoleEl.textContent = labels[currentUser.role] || 'موظف';
    }

    updateClockBtn();
    applyRoleVisibility(currentUser.role);

    if (currentUser.role === 'manager') {
      switchTab('manager-dashboard');
    } else if (currentUser.role === 'trainer') {
      switchTab('trainer-members');
    } else {
      switchTab('employee-scanner');
    }
  }

  function resetUI() {
    document.querySelectorAll('.tab-panel, .tab-link').forEach((el) => {
      el.classList.remove('active', 'bg-emerald-500/10', 'text-emerald-400', 'border-emerald-500/20', 'hidden');
      if (el.classList.contains('tab-link')) {
        el.classList.add('text-slate-400', 'border-transparent');
      }
    });
    const searchInput = document.getElementById('member-search-input');
    if (searchInput) searchInput.value = '';
    const searchResultsBody = document.getElementById('search-results-body');
    if (searchResultsBody) searchResultsBody.innerHTML = '<tr><td class="py-8 px-4 text-center text-slate-600" colspan="5">ابدأ بكتابة الاسم أو رقم الهاتف للبحث</td></tr>';
    const selectedMemberCard = document.getElementById('selected-member-card');
    if (selectedMemberCard) selectedMemberCard.classList.add('hidden');
    const statusMessage = document.getElementById('status-message');
    if (statusMessage) statusMessage.textContent = 'بانتظار البحث';
    const statusSubtext = document.getElementById('status-subtext');
    if (statusSubtext) statusSubtext.textContent = 'ابحث عن عضو واختره لتسجيل الدخول';
    const statusIcon = document.getElementById('status-icon');
    if (statusIcon) statusIcon.textContent = '?';
    const statusCard = document.getElementById('status-card');
    if (statusCard) statusCard.className = 'p-5 rounded-xl border-2 bg-slate-900 border-slate-800 transition-all duration-300 ease-in-out';
    const logsBody = document.getElementById('logs-body');
    if (logsBody) logsBody.innerHTML = '<tr><td class="py-8 px-4 text-center text-slate-600" colspan="4">لا توجد عمليات دخول مسجلة بعد</td></tr>';
    const membersError = document.getElementById('members-error');
    if (membersError) membersError.classList.add('hidden');
  }

  function logoutUser() {
    currentUser = null;
    clearSession();
    resetUI();
    mainApp.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    if (loginUsername) loginUsername.value = '';
    if (loginPassword) loginPassword.value = '';
    if (loginError) loginError.classList.add('hidden');
  }

  // ================================================================
  //  Tab switching
  // ================================================================
  const tabLinks = document.querySelectorAll('.tab-link');
  const tabPanels = document.querySelectorAll('.tab-panel');

  // Restore session only on page reload, not on fresh app start
  // (localStorage persists across Electron app restarts unlike browser)
  const savedUser = getSession();
  const navType = performance.getEntriesByType('navigation')[0]?.type;
  if (savedUser && navType === 'reload') {
    currentUser = savedUser;
    enterApp();
  } else {
    clearSession();
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      loginError.classList.add('hidden');

      const username = loginUsername.value.trim();
      const password = loginPassword.value.trim();

      if (!username || !password) {
        loginError.textContent = 'يرجى إدخال اسم المستخدم وكلمة المرور';
        loginError.classList.remove('hidden');
        return;
      }

      try {
        const res = await fetch(API_BASE + '/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (data.success && data.authenticated) {
          currentUser = data.user;
          setSession(currentUser);
          enterApp();
        } else {
          loginError.textContent = data.message || 'بيانات الدخول غير صحيحة';
          loginError.classList.remove('hidden');
        }
      } catch (_) {
        loginError.textContent = 'تعذر الاتصال بالخادم';
        loginError.classList.remove('hidden');
      }
    });

    loginUsername.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        loginPassword.focus();
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', logoutUser);
    logoutBtn.addEventListener('mousedown', (e) => e.stopPropagation());
  }

  const clockBtn = document.getElementById('sidebar-clock-btn');
  if (clockBtn) {
    clockBtn.addEventListener('click', async () => {
      if (!currentUser) return;
      // Toggle UI immediately
      const prevState = currentUser.is_clocked_in;
      currentUser.is_clocked_in = prevState ? 0 : 1;
      updateClockBtn();
      // Call API in background
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(API_BASE + '/employee/clock-in', {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: currentUser.id })
        });
        clearTimeout(timer);
        const data = await res.json();
        if (data.success && data.is_clocked_in !== undefined) {
          currentUser.is_clocked_in = data.is_clocked_in;
          updateClockBtn();
        } else {
          // Revert on failure
          currentUser.is_clocked_in = prevState;
          updateClockBtn();
        }
      } catch (err) {
        console.error('Clock error:', err);
        currentUser.is_clocked_in = prevState;
        updateClockBtn();
      }
    });
  }

  // ================================================================
  //  SYNC STATUS MONITOR
  // ================================================================
  const syncStatusEl = document.getElementById('sync-status');
  const syncStatusText = document.getElementById('sync-status-text');

  async function updateSyncStatus() {
    if (!syncStatusEl) return;
    try {
      const res = await fetch(API_BASE + '/health');
      const data = await res.json();
      if (data.online) {
        syncStatusEl.className = 'mt-2 px-3 py-1.5 rounded-lg text-[10px] font-semibold text-center border transition-all duration-200 bg-emerald-900/20 text-emerald-400 border-emerald-800/30';
        syncStatusText.textContent = 'متصل بالسحابة';
      } else {
        syncStatusEl.className = 'mt-2 px-3 py-1.5 rounded-lg text-[10px] font-semibold text-center border transition-all duration-200 bg-amber-900/20 text-amber-400 border-amber-800/30';
        syncStatusText.textContent = 'وضع عدم الاتصال';
      }
      syncStatusEl.classList.remove('hidden');
    } catch (_) {
      syncStatusEl.className = 'mt-2 px-3 py-1.5 rounded-lg text-[10px] font-semibold text-center border transition-all duration-200 bg-rose-900/20 text-rose-400 border-rose-800/30';
      syncStatusText.textContent = 'غير متصل';
      syncStatusEl.classList.remove('hidden');
    }
  }

  // Poll sync status every 10 seconds after login
  let syncInterval = null;
  function startSyncMonitor() {
    updateSyncStatus();
    if (syncInterval) clearInterval(syncInterval);
    syncInterval = setInterval(updateSyncStatus, 10000);
  }

  // Hook into enterApp to start sync monitor
  const _origEnterApp = enterApp;
  enterApp = function() {
    _origEnterApp();
    startSyncMonitor();
  };

  function switchTab(tabId) {
    const targetPanel = document.getElementById('tab-' + tabId);
    if (!targetPanel) return;

    // Prevent switching to unauthorized tab
    const requiredRole = targetPanel.getAttribute('data-role');
    if (requiredRole && currentUser && currentUser.role !== requiredRole) return;

    tabLinks.forEach((btn) => {
      btn.classList.remove('active', 'bg-emerald-500/10', 'text-emerald-400', 'border-emerald-500/20');
      btn.classList.add('text-slate-400', 'border-transparent');
    });
    tabPanels.forEach((panel) => panel.classList.remove('active'));

    const activeLink = document.querySelector(`[data-tab="${tabId}"]`);
    if (activeLink) {
      activeLink.classList.add('active', 'bg-emerald-500/10', 'text-emerald-400', 'border-emerald-500/20');
    }
    if (targetPanel) {
      targetPanel.classList.add('active');

      if (tabId === 'employee-scanner') {
        const si = document.getElementById('member-search-input');
        if (si) setTimeout(() => si.focus(), 100);
        loadRecentAttendance();
      }
    }

    if (tabId === 'manager-dashboard') initManagerDashboard();
    if (tabId === 'manager-plans') loadPlansTable();
    if (tabId === 'manager-staff') loadStaffTable();
    if (tabId === 'manager-financial') initFinancialDashboard();
    if (tabId === 'manager-audit') loadAuditLogs();
    if (tabId === 'employee-register') { loadPlansDropdown(); loadTrainersDropdown(); }
    if (tabId === 'employee-members') loadMembersLists();
    if (tabId === 'trainer-members') initTrainerDashboard();

  }

  tabLinks.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      switchTab(tabId);
    });
  });

  // ================================================================
  //  Date display
  // ================================================================
  const dashDate = document.getElementById('dashboard-date');
  if (dashDate) {
    const now = new Date();
    dashDate.textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  // ================================================================
  //  TAB: MANAGER DASHBOARD  -  full dashboard with charts
  // ================================================================
  let peakHoursChartInstance = null;
  let revenueSpreadChartInstance = null;
  let financialTrendChartInstance = null;

  async function initManagerDashboard() {
    try {
      const [statsRes, peakRes, revenueRes, staffRes] = await Promise.all([
        apiFetch(API_BASE + '/manager/dashboard-stats'),
        apiFetch(API_BASE + '/manager/analytics/peak-hours'),
        apiFetch(API_BASE + '/manager/analytics/revenue-spread'),
        apiFetch(API_BASE + '/manager/staff-today')
      ]);

      const stats = await statsRes.json();
      const peak = await peakRes.json();
      const revenue = await revenueRes.json();
      const staff = await staffRes.json();

      // KPI Cards
      if (stats.success) {
        document.getElementById('stat-income').textContent = Number(stats.monthly_income).toFixed(2);
        document.getElementById('stat-active').textContent = stats.active_count;
        document.getElementById('stat-expired').textContent = stats.expired_count;
      }

      // Staff Table
      const tbody = document.getElementById('staff-tbody');
      if (tbody) {
        if (staff.success && staff.staff.length > 0) {
          tbody.innerHTML = '';
          staff.staff.forEach((emp) => {
            const tr = document.createElement('tr');
            tr.className = 'border-b border-slate-800/30';
            const spec = emp.specialization || '—';
            const clockTime = emp.last_clock_in ? new Date(emp.last_clock_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
            tr.innerHTML =
              '<td class="py-3 px-4 text-slate-300">' + emp.id + '</td>' +
              '<td class="py-3 px-4 text-slate-100">' + emp.name + '</td>' +
              '<td class="py-3 px-4 text-slate-400">' + emp.role + '</td>' +
              '<td class="py-3 px-4 text-slate-500 text-xs">' + spec + '</td>' +
              '<td class="py-3 px-4"><span class="px-2.5 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-400">نشط' + (clockTime ? ' ' + clockTime : '') + '</span></td>';
            tbody.appendChild(tr);
          });
        } else {
          tbody.innerHTML = '<tr><td class="py-8 px-4 text-center text-slate-600" colspan="4">لا يوجد موظفون نشطون اليوم</td></tr>';
        }
      }

      // Peak Hours Chart
      if (peak.success && peak.peak_hours) {
        renderPeakHoursChart(peak.peak_hours);
      }

      // Revenue Spread Chart
      if (revenue.success && revenue.revenue_spread) {
        renderRevenueSpreadChart(revenue.revenue_spread);
      }


    } catch (_) {
      document.getElementById('stat-income').textContent = '--';
      document.getElementById('stat-active').textContent = '--';
      document.getElementById('stat-expired').textContent = '--';
    }
  }

  function renderPeakHoursChart(data) {
    if (peakHoursChartInstance) peakHoursChartInstance.destroy();

    const labels = [];
    const values = [];
    for (let h = 8; h <= 22; h++) {
      const found = data.find(d => d.hour === h);
      labels.push(h.toString().padStart(2, '0') + ':00');
      values.push(found ? found.count : 0);
    }

    const ctx = document.getElementById('peakHoursChart');
    if (!ctx) return;

    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, '#06b6d4');
    gradient.addColorStop(1, '#0891b2');

    peakHoursChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'عدد الزوار',
          data: values,
          backgroundColor: gradient,
          borderColor: '#22d3ee',
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#94a3b8', font: { size: 10 } } } },
        scales: {
          x: { ticks: { color: '#64748b', font: { size: 9 } }, grid: { color: '#1e293b' } },
          y: { ticks: { color: '#64748b', font: { size: 9 }, stepSize: 1 }, grid: { color: '#1e293b' }, beginAtZero: true }
        }
      }
    });
  }

  function renderRevenueSpreadChart(data) {
    if (revenueSpreadChartInstance) revenueSpreadChartInstance.destroy();

    const labels = data.map(d => d.sub_type || 'غير محدد');
    const values = data.map(d => parseFloat(d.total) || 0);
    const colors = ['#10b981', '#06b6d4', '#f59e0b'];

    const ctx = document.getElementById('revenueSpreadChart');
    if (!ctx) return;

    revenueSpreadChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: colors.slice(0, labels.length),
          borderColor: '#0f172a',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#94a3b8', font: { size: 10 }, padding: 12 }
          }
        }
      }
    });
  }

  // ================================================================
  //  TAB: MANAGER FINANCIAL  -  full financial intelligence dashboard
  // ================================================================
  async function initFinancialDashboard() {
    const periodEl = document.getElementById('financial-period');
    if (periodEl) {
      const now = new Date();
      periodEl.textContent = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    try {
      const [intelRes, expensesRes] = await Promise.all([
        apiFetch(API_BASE + '/manager/financial-intelligence'),
        apiFetch(API_BASE + '/manager/expenses')
      ]);

      const intel = await intelRes.json();
      const expensesData = await expensesRes.json();

      // KPI Cards
      if (intel.success) {
        const revenue = parseFloat(intel.total_revenue) || 0;
        const expenses = parseFloat(intel.total_expenses) || 0;
        const netProfit = revenue - expenses;

        document.getElementById('fin-revenue').textContent = revenue.toFixed(2);
        document.getElementById('fin-expenses').textContent = expenses.toFixed(2);

        const profitEl = document.getElementById('fin-profit');
        const profitCard = document.getElementById('fin-profit-card');
        const profitLabel = document.getElementById('fin-profit-label');
        const profitIcon = document.getElementById('fin-profit-icon');
        const profitSub = document.getElementById('fin-profit-sub');

        profitEl.textContent = netProfit.toFixed(2);

        if (netProfit >= 0) {
          profitCard.className = 'bg-gradient-to-br from-emerald-950/60 to-slate-900/80 border border-emerald-800/40 rounded-xl p-5 glow-card';
          profitEl.className = 'text-3xl font-bold text-emerald-300';
          profitLabel.textContent = 'صافي الأرباح';
          profitLabel.className = 'text-xs font-cyber tracking-widest text-emerald-400/80';
          profitIcon.textContent = '💰';
          profitSub.textContent = 'دينار ليبي';
        } else {
          profitCard.className = 'bg-gradient-to-br from-rose-950/60 to-slate-900/80 border border-rose-500/60 rounded-xl p-5 animate-pulse';
          profitEl.className = 'text-3xl font-bold text-rose-400';
          profitLabel.textContent = 'عجز مالي';
          profitLabel.className = 'text-xs font-cyber tracking-widest text-rose-400/80';
          profitIcon.textContent = '⚠️';
          profitSub.textContent = 'دينار ليبي';
        }
      }

      // Trend Chart
      if (intel.success && intel.monthly_trend) {
        renderFinancialTrendChart(intel.monthly_trend);
      }

      // Expenses Ledger
      if (expensesData.success && expensesData.expenses) {
        renderExpensesTable(expensesData.expenses);
      }
    } catch (_) {
      document.getElementById('fin-revenue').textContent = '--';
      document.getElementById('fin-expenses').textContent = '--';
      document.getElementById('fin-profit').textContent = '--';
    }
  }

  function renderFinancialTrendChart(data) {
    if (financialTrendChartInstance) financialTrendChartInstance.destroy();

    const labels = data.map(d => d.month || '');
    const revenues = data.map(d => parseFloat(d.revenue) || 0);
    const expenses = data.map(d => parseFloat(d.expenses) || 0);

    const ctx = document.getElementById('financialTrendChart');
    if (!ctx) return;

    financialTrendChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'الإيرادات',
            data: revenues,
            backgroundColor: 'rgba(16, 185, 129, 0.7)',
            borderColor: '#10b981',
            borderWidth: 1,
            borderRadius: 4
          },
          {
            label: 'المصروفات',
            data: expenses,
            backgroundColor: 'rgba(239, 68, 68, 0.7)',
            borderColor: '#ef4444',
            borderWidth: 1,
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#94a3b8', font: { size: 10 } } }
        },
        scales: {
          x: { ticks: { color: '#64748b', font: { size: 9 } }, grid: { color: '#1e293b' } },
          y: { ticks: { color: '#64748b', font: { size: 9 } }, grid: { color: '#1e293b' }, beginAtZero: true }
        }
      }
    });
  }

  function renderExpensesTable(expenses) {
    const tbody = document.getElementById('expenses-tbody');
    const countEl = document.getElementById('expenses-count');
    if (!tbody) return;

    if (!expenses || expenses.length === 0) {
      tbody.innerHTML = '<tr><td class="py-8 px-4 text-center text-slate-600" colspan="7">لا توجد مصروفات مسجلة</td></tr>';
      if (countEl) countEl.textContent = 'لا توجد عمليات';
      return;
    }

    if (countEl) countEl.textContent = 'آخر ' + expenses.length + ' عملية';
    tbody.innerHTML = '';

    expenses.forEach((exp) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-800/30';
      const categoryLabels = {
        Rent: 'إيجار', Utilities: 'مرافق', Salaries: 'رواتب',
        Marketing: 'تسويق', Equipment: 'معدات', Other: 'أخرى'
      };
      tr.innerHTML =
        '<td class="py-3 px-4 text-slate-400">' + exp.id + '</td>' +
        '<td class="py-3 px-4 text-slate-100">' + exp.description + '</td>' +
        '<td class="py-3 px-4 text-slate-400">' + (categoryLabels[exp.category] || exp.category) + '</td>' +
        '<td class="py-3 px-4 text-rose-400">' + parseFloat(exp.amount).toFixed(2) + '</td>' +
        '<td class="py-3 px-4 text-slate-500 text-xs">' + (exp.expense_date || '—') + '</td>' +
        '<td class="py-3 px-4 text-slate-500 text-xs">' + (exp.created_by || '—') + '</td>' +
        '<td class="py-3 px-4"><button class="delete-expense-btn bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 px-2.5 py-1 rounded text-xs transition-colors" data-id="' + exp.id + '">حذف</button></td>';
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.delete-expense-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!confirm('هل أنت متأكد من حذف هذا المصروف؟')) return;
        try {
          const res = await apiFetch(API_BASE + '/manager/expenses/' + id, { method: 'DELETE' });
          const data = await res.json();
          const resultDiv = document.getElementById('expense-result');
          if (resultDiv) {
            resultDiv.className = 'mt-3 p-3 rounded-lg ' + (data.success ? 'bg-emerald-950/60 border border-emerald-800/40 text-emerald-200' : 'bg-rose-950/60 border border-rose-800/40 text-rose-200') + ' text-sm';
            resultDiv.textContent = data.message;
            resultDiv.classList.remove('hidden');
            setTimeout(() => resultDiv.classList.add('hidden'), 5000);
          }
          if (data.success) initFinancialDashboard();
        } catch (_) {
          const resultDiv = document.getElementById('expense-result');
          if (resultDiv) {
            resultDiv.className = 'mt-3 p-3 rounded-lg bg-rose-950/60 border border-rose-800/40 text-rose-200 text-sm';
            resultDiv.textContent = 'تعذر الاتصال بالخادم';
            resultDiv.classList.remove('hidden');
          }
        }
      });
    });
  }

  const expenseForm = document.getElementById('expense-form');
  if (expenseForm) {
    expenseForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const desc = document.getElementById('exp-desc').value.trim();
      const category = document.getElementById('exp-category').value;
      const amount = document.getElementById('exp-amount').value.trim();
      const expense_date = document.getElementById('exp-date').value;
      const resultDiv = document.getElementById('expense-result');
      if (resultDiv) resultDiv.classList.add('hidden');

      if (!desc || !category || !amount || !expense_date) {
        if (resultDiv) {
          resultDiv.className = 'mt-3 p-3 rounded-lg bg-rose-950/60 border border-rose-800/40 text-rose-200 text-sm';
          resultDiv.textContent = 'يرجى ملء جميع الحقول';
          resultDiv.classList.remove('hidden');
        }
        return;
      }

      try {
        const res = await apiFetch(API_BASE + '/manager/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: desc, amount: parseFloat(amount), category, expense_date })
        });
        const data = await res.json();
        if (resultDiv) {
          resultDiv.className = 'mt-3 p-3 rounded-lg ' + (data.success ? 'bg-emerald-950/60 border border-emerald-800/40 text-emerald-200' : 'bg-rose-950/60 border border-rose-800/40 text-rose-200') + ' text-sm';
          resultDiv.textContent = data.message;
          resultDiv.classList.remove('hidden');
          setTimeout(() => resultDiv.classList.add('hidden'), 5000);
        }
        if (data.success) {
          document.getElementById('exp-desc').value = '';
          document.getElementById('exp-amount').value = '';
          document.getElementById('exp-date').value = '';
          initFinancialDashboard();
        }
      } catch (_) {
        if (resultDiv) {
          resultDiv.className = 'mt-3 p-3 rounded-lg bg-rose-950/60 border border-rose-800/40 text-rose-200 text-sm';
          resultDiv.textContent = 'تعذر الاتصال بالخادم';
          resultDiv.classList.remove('hidden');
        }
      }
    });
  }

  // Export Report
  const exportBtn = document.getElementById('export-report-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const income = document.getElementById('stat-income').textContent;
      const active = document.getElementById('stat-active').textContent;
      const expired = document.getElementById('stat-expired').textContent;
      const date = new Date().toLocaleDateString('en-US');

      const csv = 'التقرير المالي,القيمة\n' +
        'تاريخ التقرير,' + date + '\n' +
        'الدخل الشهري,' + income + '\n' +
        'الأعضاء النشطون,' + active + '\n' +
        'الاشتراكات المنتهية,' + expired + '\n';

      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'Gym_Manager_Report.csv';
      link.click();
      URL.revokeObjectURL(link.href);
    });
  }

  // ================================================================
  //  TAB: EMPLOYEE SCANNER  -  Smart Member Search + Check-in
  // ================================================================
  const memberSearchInput = document.getElementById('member-search-input');
  const searchResultsBody = document.getElementById('search-results-body');
  const searchCount = document.getElementById('search-count');
  const selectedMemberCard = document.getElementById('selected-member-card');
  const selectedMemberName = document.getElementById('selected-member-name');
  const selectedMemberDetails = document.getElementById('selected-member-details');
  const confirmEntryBtn = document.getElementById('confirm-entry-btn');
  const searchSpinner = document.getElementById('search-spinner');
  const statusCard = document.getElementById('status-card');
  const statusIcon = document.getElementById('status-icon');
  const statusMessage = document.getElementById('status-message');
  const statusSubtext = document.getElementById('status-subtext');
  const logsBody = document.getElementById('logs-body');

  let searchTimeout = null;
  let selectedMember = null;

  function fmtDate(d) {
    if (!d) return '—';
    return d.split('T')[0];
  }

  async function loadRecentAttendance() {
    try {
      const res = await apiFetch(API_BASE + '/attendance/recent?limit=5');
      const data = await res.json();
      if (data.logs && data.logs.length > 0) {
        if (logsBody) logsBody.innerHTML = '';
        data.logs.forEach(log => {
          const row = document.createElement('tr');
          row.className = 'border-b border-slate-800/30';
          const time = new Date(log.timestamp).toLocaleDateString('en-US') + ' ' + new Date(log.timestamp).toLocaleTimeString('en-US');
          row.innerHTML =
            '<td class="py-2 px-4">' + (log.member_id || '—') + '</td>' +
            '<td class="py-2 px-4">' + (log.name || '—') + '</td>' +
            '<td class="py-2 px-4">' + time + '</td>' +
            '<td class="py-2 px-4 text-emerald-400">مقبول</td>';
          if (logsBody) logsBody.appendChild(row);
        });
      } else {
        if (logsBody) logsBody.innerHTML = '<tr><td class="py-8 px-4 text-center text-slate-600" colspan="4">لا توجد عمليات دخول مسجلة بعد</td></tr>';
      }
    } catch (_) {
      if (logsBody) logsBody.innerHTML = '<tr><td class="py-8 px-4 text-center text-slate-600" colspan="4">لا توجد عمليات دخول مسجلة بعد</td></tr>';
    }
  }

  if (memberSearchInput) {
    memberSearchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      const q = memberSearchInput.value.trim();
      if (q.length < 1) {
        if (searchResultsBody) searchResultsBody.innerHTML = '<tr><td class="py-8 px-4 text-center text-slate-600" colspan="5">ابدأ بكتابة الاسم أو رقم الهاتف للبحث</td></tr>';
        if (searchCount) searchCount.textContent = '';
        if (searchSpinner) searchSpinner.classList.add('hidden');
        return;
      }
      if (searchSpinner) searchSpinner.classList.remove('hidden');
      searchTimeout = setTimeout(async () => {
        try {
          let members = [];
          const res = await apiFetch(API_BASE + '/members/search?q=' + encodeURIComponent(q));
          const data = await res.json();
          members = data.members || [];
          renderSearchResults(members);
        } catch (err) {
          console.error('search error:', err);
          if (searchResultsBody) searchResultsBody.innerHTML = '<tr><td class="py-8 px-4 text-center text-rose-500" colspan="5">خطأ في البحث</td></tr>';
        } finally {
          if (searchSpinner) searchSpinner.classList.add('hidden');
        }
      }, 300);
    });
  }

  function renderSearchResults(members) {
    if (!searchResultsBody) return;
    if (members.length === 0) {
      searchResultsBody.innerHTML = '<tr><td class="py-8 px-4 text-center text-slate-600" colspan="5">لا توجد نتائج</td></tr>';
      if (searchCount) searchCount.textContent = '';
      return;
    }
    if (searchCount) searchCount.textContent = members.length + ' نتيجة';
    searchResultsBody.innerHTML = '';
    members.forEach((m) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-800/30 cursor-pointer hover:bg-slate-800/40 transition-colors';
      const isExpired = m.status === 'expired' || (m.expiry_date && m.expiry_date < new Date().toISOString().split('T')[0]);
      tr.innerHTML =
        '<td class="py-3 px-4 text-slate-100">' + m.name + '</td>' +
        '<td class="py-3 px-4 text-slate-400">' + (m.phone || '—') + '</td>' +
        '<td class="py-3 px-4"><span class="px-2.5 py-0.5 rounded-full text-xs ' +
        (isExpired ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400') + '">' +
        (isExpired ? 'منتهي' : 'نشط') + '</span></td>' +
        '<td class="py-3 px-4 text-slate-500 text-xs">' + fmtDate(m.expiry_date) + '</td>' +
        '<td class="py-3 px-4"><button class="select-member-btn bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 px-3 py-1 rounded text-xs transition-colors" data-id="' + m.id + '">اختيار</button></td>';
      tr.querySelector('.select-member-btn').addEventListener('click', () => selectMember(m));
      searchResultsBody.appendChild(tr);
    });
  }

  function selectMember(m) {
    selectedMember = m;
    if (selectedMemberName) selectedMemberName.textContent = m.name;
    if (selectedMemberDetails) {
      const planInfo = m.plan_name ? ' · ' + m.plan_name : '';
      selectedMemberDetails.textContent = 'رقم العضوية: ' + m.id + planInfo + ' | الهاتف: ' + (m.phone || '—') + ' | ينتهي: ' + fmtDate(m.expiry_date);
    }
    if (selectedMemberCard) selectedMemberCard.classList.remove('hidden');
  }

  if (confirmEntryBtn) {
    confirmEntryBtn.addEventListener('click', async () => {
      if (!selectedMember) return;
      const id = selectedMember.id;
      try {
        const response = await apiFetch(API_BASE + '/checkin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });

        const data = await response.json();

        if (data.success) {
          if (statusCard) statusCard.className = 'p-5 rounded-xl border-2 bg-emerald-950/80 border-emerald-500 text-emerald-200 transition-all duration-300 ease-in-out';
          if (statusIcon) statusIcon.textContent = '\u2713';
          if (statusMessage) statusMessage.textContent = 'أهلاً، ' + data.name;
          if (statusSubtext) statusSubtext.textContent = data.message;
        } else {
          if (statusCard) statusCard.className = 'p-5 rounded-xl border-2 bg-rose-950/80 border-rose-500 text-rose-200 transition-all duration-300 ease-in-out';
          if (statusIcon) statusIcon.textContent = '\u2717';
          if (statusMessage) statusMessage.textContent = 'تم الرفض';
          if (statusSubtext) statusSubtext.textContent = data.message;
        }

        const now = new Date();
        const timestamp = now.toLocaleDateString('en-US') + ' ' + now.toLocaleTimeString('en-US');

        if (data.success && logsBody) {
          if (logsBody.querySelector('td[colspan]')) {
            logsBody.innerHTML = '';
          }
          const row = document.createElement('tr');
          row.className = 'border-b border-emerald-900/30';
          row.innerHTML =
            '<td class="py-2 px-4">' + id + '</td>' +
            '<td class="py-2 px-4">' + data.name + '</td>' +
            '<td class="py-2 px-4">' + timestamp + '</td>' +
            '<td class="py-2 px-4"><span class="text-emerald-400">مقبول</span></td>';
          logsBody.insertBefore(row, logsBody.firstChild);

          while (logsBody.children.length > 5) {
            logsBody.removeChild(logsBody.lastChild);
          }
        }
      } catch (_) {
        if (statusCard) statusCard.className = 'p-5 rounded-xl border-2 bg-rose-950/80 border-rose-500 text-rose-200 transition-all duration-300 ease-in-out';
        if (statusIcon) statusIcon.textContent = '\u2717';
        if (statusMessage) statusMessage.textContent = 'خطأ في الاتصال';
        if (statusSubtext) statusSubtext.textContent = 'تعذر الوصول إلى الخادم';
      }

      selectedMember = null;
      if (selectedMemberCard) selectedMemberCard.classList.add('hidden');
      if (memberSearchInput) {
        memberSearchInput.value = '';
        memberSearchInput.focus();
      }
    });
  }

  // ================================================================
  //  TAB: EMPLOYEE REGISTER  -  new member form
  // ================================================================
  const registerForm = document.getElementById('register-form');
  const regName = document.getElementById('reg-name');
  const regPhone = document.getElementById('reg-phone');
  const regPlanId = document.getElementById('reg-plan-id');
  const regResult = document.getElementById('reg-result');

  async function loadPlansDropdown() {
    if (!regPlanId) return;
    try {
      const res = await fetch(API_BASE + '/plans/active');
      const data = await res.json();
      if (data.success && data.plans.length > 0) {
        regPlanId.innerHTML = '<option value="" disabled selected>-- اختر الباقة --</option>';
        data.plans.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.setAttribute('data-price', p.price);
          opt.textContent = parseFloat(p.price).toFixed(2) + ' د.ل ' + ' - ' + p.name;
          regPlanId.appendChild(opt);
        });
      } else {
        regPlanId.innerHTML = '<option value="" disabled>لا توجد باقات متاحة</option>';
      }
    } catch (_) {
      regPlanId.innerHTML = '<option value="" disabled>خطأ في تحميل الباقات</option>';
    }
  }

  if (registerForm) {
    loadPlansDropdown();

    const regPaymentSection = document.getElementById('reg-payment-section');
    const regPlanPrice = document.getElementById('reg-plan-price');
    const regAmountReceived = document.getElementById('reg-amount-received');
    const regChangeDisplay = document.getElementById('reg-change-display');
    const regChangeAmount = document.getElementById('reg-change-amount');
    const regCashFields = document.getElementById('reg-cash-fields');
    const paymentMethodRadios = document.querySelectorAll('input[name="reg-payment-method"]');

    function updatePaymentSection() {
      const val = regPlanId.value;
      if (!val) { regPaymentSection.classList.add('hidden'); return; }
      const opt = regPlanId.querySelector('option[value="' + val + '"]');
      if (!opt) { regPaymentSection.classList.add('hidden'); return; }
      const price = opt.getAttribute('data-price');
      regPlanPrice.textContent = parseFloat(price).toFixed(2) + ' د.ل';
      regAmountReceived.value = price;
      regPaymentSection.classList.remove('hidden');
      calcChange();
    }

    function calcChange() {
      const val = regPlanId.value;
      if (!val) return;
      const opt = regPlanId.querySelector('option[value="' + val + '"]');
      if (!opt) return;
      const price = parseFloat(opt.getAttribute('data-price'));
      const received = parseFloat(regAmountReceived.value) || 0;
      if (received > price) {
        regChangeAmount.textContent = (received - price).toFixed(2) + ' د.ل';
        regChangeDisplay.classList.remove('hidden');
      } else {
        regChangeDisplay.classList.add('hidden');
      }
    }

    regPlanId.addEventListener('change', updatePaymentSection);
    if (regAmountReceived) regAmountReceived.addEventListener('input', calcChange);

    paymentMethodRadios.forEach(r => {
      r.addEventListener('change', () => {
        if (r.value === 'cash') {
          regCashFields.classList.remove('hidden');
          calcChange();
        } else {
          regCashFields.classList.add('hidden');
          regChangeDisplay.classList.add('hidden');
        }
      });
    });

    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = regName.value.trim();
      const phone = regPhone.value.trim();
      const plan_id = regPlanId.value;
      const trainer_id = document.getElementById('reg-trainer-id') ? document.getElementById('reg-trainer-id').value : '';

      if (!name || !phone || !plan_id) {
        if (regResult) {
          regResult.className = 'mt-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800/40 text-rose-200 text-sm';
          regResult.textContent = 'يرجى ملء جميع الحقول';
          regResult.classList.remove('hidden');
        }
        return;
      }

      if (regResult) regResult.classList.add('hidden');

      const selectedMethod = document.querySelector('input[name="reg-payment-method"]:checked');
      const payment_method = selectedMethod ? selectedMethod.value : 'cash';
      const amount_received = parseFloat(regAmountReceived.value) || 0;

      try {
        const res = await apiFetch(API_BASE + '/members/register-and-pay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name, phone, plan_id: parseInt(plan_id, 10),
            trainer_id: trainer_id || undefined,
            payment_method,
            amount_received
          })
        });

        const data = await res.json();

        if (data.success) {
          if (regResult) {
            let msg = 'تم تسجيل العضو بنجاح. رقم العضوية: <strong>' + data.member.id + '</strong> | تاريخ الانتهاء: ' + data.member.expiry_date;
            if (data.payment && data.payment.change > 0) {
              msg += '<br><span class="text-amber-300">الباقي: ' + data.payment.change.toFixed(2) + ' د.ل</span>';
            }
            regResult.className = 'mt-4 p-3 rounded-lg bg-emerald-950/60 border border-emerald-800/40 text-emerald-200 text-sm';
            regResult.innerHTML = msg;
            regResult.classList.remove('hidden');
          }
          regName.value = '';
          regPhone.value = '';
          regPlanId.value = '';
          regAmountReceived.value = '';
          regChangeDisplay.classList.add('hidden');
          regPaymentSection.classList.add('hidden');
          document.querySelector('input[name="reg-payment-method"][value="cash"]').checked = true;
          regCashFields.classList.remove('hidden');
        } else {
          if (regResult) {
            regResult.className = 'mt-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800/40 text-rose-200 text-sm';
            regResult.textContent = data.message || 'فشل التسجيل';
            regResult.classList.remove('hidden');
          }
        }
      } catch (_) {
        if (regResult) {
          regResult.className = 'mt-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800/40 text-rose-200 text-sm';
          regResult.textContent = 'تعذر الاتصال بالخادم';
          regResult.classList.remove('hidden');
        }
      }
    });
  }

  // ================================================================
  //  TAB: EMPLOYEE FINANCIAL  -  Financial Inventory + Treasury Deposit
  // ================================================================
  const finTab = document.getElementById('tab-employee-financial');
  const finError = document.getElementById('financial-error');
  const finSuccess = document.getElementById('financial-success');
  const finCashTotal = document.getElementById('fin-cash-total');
  const finCardTotal = document.getElementById('fin-card-total');
  const finExpensesTotal = document.getElementById('fin-expenses-total');
  const finNetCash = document.getElementById('fin-net-cash');
  const finActualCash = document.getElementById('fin-actual-cash');
  const finDiscrepancyDisplay = document.getElementById('fin-discrepancy-display');
  const finDiscrepancyAmount = document.getElementById('fin-discrepancy-amount');
  const finDepositBtn = document.getElementById('fin-deposit-btn');
  const finReconciliationSection = document.getElementById('fin-reconciliation-section');
  const finDepositedMsg = document.getElementById('fin-deposited-msg');
  const finDepositedAmount = document.getElementById('fin-deposited-amount');

  async function loadFinancialSummary() {
    if (!finTab || finTab.classList.contains('hidden')) return;
    finError.classList.add('hidden');
    finSuccess.classList.add('hidden');
    try {
      const res = await apiFetch(API_BASE + '/shift/financial-summary');
      const data = await res.json();
      if (data.success) {
        finCashTotal.textContent = data.cash_total.toFixed(2);
        finCardTotal.textContent = data.card_total.toFixed(2);
        finExpensesTotal.textContent = data.expenses_total.toFixed(2);
        finNetCash.textContent = data.net_cash_expected.toFixed(2);

        if (data.deposit) {
          finReconciliationSection.classList.add('hidden');
          finDepositedMsg.classList.remove('hidden');
          finDepositedAmount.textContent = parseFloat(data.deposit.amount).toFixed(2) + ' د.ل';
        } else {
          finReconciliationSection.classList.remove('hidden');
          finDepositedMsg.classList.add('hidden');
          finActualCash.value = data.net_cash_expected.toFixed(2);
          calcDiscrepancy();
        }
      } else {
        showFinError('فشل تحميل بيانات الجرد');
      }
    } catch (_) {
      showFinError('تعذر الاتصال بالخادم');
    }
  }

  function showFinError(msg) {
    finError.textContent = msg;
    finError.classList.remove('hidden');
  }

  function calcDiscrepancy() {
    const netCash = parseFloat(finNetCash.textContent.replace(/[^0-9.]/g, '')) || 0;
    const actual = parseFloat(finActualCash.value) || 0;
    const diff = parseFloat((actual - netCash).toFixed(2));
    if (actual > 0) {
      finDiscrepancyDisplay.classList.remove('hidden');
      if (diff === 0) {
        finDiscrepancyDisplay.className = 'flex items-center justify-between rounded-lg px-4 py-3 bg-emerald-950/40 border border-emerald-700/30';
        finDiscrepancyAmount.className = 'text-lg font-bold text-emerald-200';
        finDiscrepancyAmount.textContent = '0.00 د.ل (متطابق)';
      } else if (diff > 0) {
        finDiscrepancyDisplay.className = 'flex items-center justify-between rounded-lg px-4 py-3 bg-amber-950/40 border border-amber-700/30';
        finDiscrepancyAmount.className = 'text-lg font-bold text-amber-200';
        finDiscrepancyAmount.textContent = diff.toFixed(2) + ' د.ل (فائض)';
      } else {
        finDiscrepancyDisplay.className = 'flex items-center justify-between rounded-lg px-4 py-3 bg-rose-950/40 border border-rose-700/30';
        finDiscrepancyAmount.className = 'text-lg font-bold text-rose-200';
        finDiscrepancyAmount.textContent = Math.abs(diff).toFixed(2) + ' د.ل (عجز)';
      }
    } else {
      finDiscrepancyDisplay.classList.add('hidden');
    }
  }

  if (finActualCash) finActualCash.addEventListener('input', calcDiscrepancy);

  if (finDepositBtn) {
    finDepositBtn.addEventListener('click', async () => {
      const actual = parseFloat(finActualCash.value);
      if (isNaN(actual) || actual <= 0) {
        showFinError('يرجى إدخال المبلغ النقدي الفعلي');
        return;
      }
      finDepositBtn.disabled = true;
      finDepositBtn.textContent = 'جاري الإيداع...';
      finError.classList.add('hidden');
      finSuccess.classList.add('hidden');
      try {
        const res = await apiFetch(API_BASE + '/shift/reconcile-and-deposit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actual_cash: actual })
        });
        const data = await res.json();
        if (data.success) {
          finSuccess.textContent = data.message;
          finSuccess.classList.remove('hidden');
          finReconciliationSection.classList.add('hidden');
          finDepositedMsg.classList.remove('hidden');
          finDepositedAmount.textContent = actual.toFixed(2) + ' د.ل';
        } else {
          showFinError(data.message || 'فشل الإيداع');
        }
      } catch (_) {
        showFinError('تعذر الاتصال بالخادم');
      } finally {
        finDepositBtn.disabled = false;
        finDepositBtn.textContent = 'إيداع في الخزينة';
      }
    });
  }

  // Auto-refresh when tab becomes active
  if (finTab) {
    const observer = new MutationObserver(() => {
      if (!finTab.classList.contains('hidden')) loadFinancialSummary();
    });
    observer.observe(finTab, { attributes: true, attributeFilter: ['class'] });
  }

  // Expense recording for receptionist
  const finExpenseDesc = document.getElementById('fin-expense-desc');
  const finExpenseAmount = document.getElementById('fin-expense-amount');
  const finExpenseBtn = document.getElementById('fin-expense-btn');
  const finExpenseMsg = document.getElementById('fin-expense-msg');

  if (finExpenseBtn) {
    finExpenseBtn.addEventListener('click', async () => {
      const desc = finExpenseDesc.value.trim();
      const amount = parseFloat(finExpenseAmount.value);
      if (!desc || isNaN(amount) || amount <= 0) {
        finExpenseMsg.className = 'mt-3 text-xs text-rose-400';
        finExpenseMsg.textContent = 'يرجى إدخال الوصف والمبلغ';
        finExpenseMsg.classList.remove('hidden');
        return;
      }
      finExpenseBtn.disabled = true;
      finExpenseBtn.textContent = 'جاري...';
      finExpenseMsg.classList.add('hidden');
      try {
        const res = await apiFetch(API_BASE + '/shift/expense', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: desc, amount })
        });
        const data = await res.json();
        if (data.success) {
          finExpenseDesc.value = '';
          finExpenseAmount.value = '';
          finExpenseMsg.className = 'mt-3 text-xs text-emerald-400';
          finExpenseMsg.textContent = 'تم تسجيل المصروف';
          finExpenseMsg.classList.remove('hidden');
          loadFinancialSummary();
        } else {
          finExpenseMsg.className = 'mt-3 text-xs text-rose-400';
          finExpenseMsg.textContent = data.message || 'فشل تسجيل المصروف';
          finExpenseMsg.classList.remove('hidden');
        }
      } catch (_) {
        finExpenseMsg.className = 'mt-3 text-xs text-rose-400';
        finExpenseMsg.textContent = 'تعذر الاتصال بالخادم';
        finExpenseMsg.classList.remove('hidden');
      } finally {
        finExpenseBtn.disabled = false;
        finExpenseBtn.textContent = 'تسجيل';
      }
    });
  }

  // Monthly toggle / load
  const finPeriodToggle = document.getElementById('fin-period-toggle');
  const finDailyView = document.getElementById('fin-daily-view');
  const finMonthlyView = document.getElementById('fin-monthly-view');
  const finMonthYear = document.getElementById('fin-month-year');
  const finMonthMonth = document.getElementById('fin-month-month');
  const finMonthlyRefresh = document.getElementById('fin-monthly-refresh');
  const finMonthlyCash = document.getElementById('fin-monthly-cash');
  const finMonthlyCard = document.getElementById('fin-monthly-card');
  const finMonthlyExpenses = document.getElementById('fin-monthly-expenses');
  const finMonthlyNet = document.getElementById('fin-monthly-net');
  const finMonthlyDeposits = document.getElementById('fin-monthly-deposits');

  // Populate year dropdown
  if (finMonthYear) {
    const curYear = new Date().getFullYear();
    for (let y = curYear - 2; y <= curYear + 1; y++) {
      const opt = document.createElement('option');
      opt.value = y; opt.textContent = y;
      if (y === curYear) opt.selected = true;
      finMonthYear.appendChild(opt);
    }
    finMonthMonth.value = new Date().getMonth() + 1;
  }

  if (finPeriodToggle) {
    finPeriodToggle.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-period]');
      if (!btn) return;
      finPeriodToggle.querySelectorAll('button').forEach(b => {
        b.className = 'px-3 py-1.5 text-xs font-semibold rounded-md transition-all ' + (b === btn ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200');
      });
      if (btn.dataset.period === 'monthly') {
        finDailyView.classList.add('hidden');
        finMonthlyView.classList.remove('hidden');
        loadMonthlySummary();
      } else {
        finMonthlyView.classList.add('hidden');
        finDailyView.classList.remove('hidden');
        loadFinancialSummary();
      }
    });
  }

  async function loadMonthlySummary() {
    try {
      const year = finMonthYear.value;
      const month = finMonthMonth.value;
      const res = await apiFetch(API_BASE + '/shift/monthly-summary?year=' + year + '&month=' + month);
      const data = await res.json();
      if (data.success) {
        finMonthlyCash.textContent = data.cash_total.toFixed(2);
        finMonthlyCard.textContent = data.card_total.toFixed(2);
        finMonthlyExpenses.textContent = data.expenses_total.toFixed(2);
        finMonthlyNet.textContent = data.net_cash_expected.toFixed(2);
        finMonthlyDeposits.textContent = data.total_deposits.toFixed(2);
      }
    } catch (_) {}
  }

  if (finMonthlyRefresh) finMonthlyRefresh.addEventListener('click', loadMonthlySummary);

  // ================================================================
  //  TAB: EMPLOYEE MEMBERS  -  active / expired lists with renew
  // ================================================================
  const activeMembersDiv = document.getElementById('active-members-list');
  const expiredMembersDiv = document.getElementById('expired-members-list');
  const refreshMembersBtn = document.getElementById('refresh-members-btn');

  async function loadMembersLists() {
    if (!activeMembersDiv || !expiredMembersDiv) return;
    activeMembersDiv.innerHTML = '<p class="text-slate-600 text-sm py-4 text-center">جاري التحميل...</p>';
    expiredMembersDiv.innerHTML = '<p class="text-slate-600 text-sm py-4 text-center">جاري التحميل...</p>';

    try {
      const res = await fetch(API_BASE + '/employee/members');
      const data = await res.json();

      if (data.success) {
        if (data.activeMembers.length === 0) {
          activeMembersDiv.innerHTML = '<p class="text-slate-600 text-sm py-4 text-center">لا يوجد أعضاء نشطون</p>';
        } else {
          activeMembersDiv.innerHTML = '';
          data.activeMembers.forEach((m) => {
            const card = document.createElement('div');
            card.className = 'bg-slate-800/40 border border-slate-700/40 rounded-lg p-3 flex items-center justify-between';
            card.innerHTML =
              '<div class="flex items-center gap-2.5"><span class="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span><div><div class="text-sm text-slate-100">' + m.name + '</div><div class="text-[11px] text-slate-500">' + m.id + ' · ' + (m.plan_name || 'بدون باقة') + ' · حتى ' + fmtDate(m.expiry_date) + '</div></div></div>' +
              '<div class="flex items-center gap-1.5"><span class="text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">نشط</span><button class="edit-member-btn text-amber-400 hover:text-amber-300 text-xs px-1.5 py-0.5 rounded transition-colors" data-id="' + m.id + '" data-phone="' + (m.phone || '') + '" data-plan="' + (m.plan_id || '') + '" data-trainer="' + (m.trainer_id || '') + '" title="تعديل">تعديل</button><button class="delete-member-btn text-rose-500 hover:text-rose-400 text-xs px-1.5 py-0.5 rounded transition-colors" data-id="' + m.id + '" data-name="' + m.name.replace(/"/g, '&quot;') + '" title="حذف">✕</button></div>';
            activeMembersDiv.appendChild(card);
          });
        }

        if (data.expiredMembers.length === 0) {
          expiredMembersDiv.innerHTML = '<p class="text-slate-600 text-sm py-4 text-center">لا يوجد أعضاء منتهية اشتراكاتهم</p>';
        } else {
          expiredMembersDiv.innerHTML = '';
          data.expiredMembers.forEach((m) => {
            const card = document.createElement('div');
            card.className = 'bg-slate-800/40 border border-slate-700/40 rounded-lg p-3';
            card.innerHTML =
              '<div class="flex items-center justify-between mb-2"><div class="flex items-center gap-2.5"><span class="w-2 h-2 rounded-full bg-rose-500 shrink-0"></span><div><div class="text-sm text-slate-100">' + m.name + '</div><div class="text-[11px] text-slate-500">' + m.id + ' · ' + (m.plan_name || 'بدون باقة') + ' · انتهى ' + fmtDate(m.expiry_date) + '</div></div></div><span class="text-[11px] text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full">منتهي</span></div>' +
              '<div class="flex gap-1.5 mt-1"><button class="pay-member-btn bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 px-2.5 py-1.5 rounded-lg text-xs transition-colors" data-id="' + m.id + '" data-name="' + m.name.replace(/"/g, '&quot;') + '" title="دفع">💳 دفع</button><button class="edit-member-btn bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 px-2.5 py-1.5 rounded-lg text-xs transition-colors" data-id="' + m.id + '" data-phone="' + (m.phone || '') + '" data-plan="' + (m.plan_id || '') + '" data-trainer="' + (m.trainer_id || '') + '" title="تعديل">تعديل</button><button class="renew-btn flex-1 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold py-2 rounded-lg transition-colors duration-200" data-id="' + m.id + '">تجديد الاشتراك</button><button class="delete-member-btn bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 px-2.5 py-1.5 rounded-lg text-xs transition-colors" data-id="' + m.id + '" data-name="' + m.name.replace(/"/g, '&quot;') + '" title="حذف">حذف</button></div>';
            expiredMembersDiv.appendChild(card);
          });

          document.querySelectorAll('.renew-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const memberId = btn.getAttribute('data-id');
              btn.disabled = true;
              btn.textContent = 'جاري التجديد...';
              btn.className = 'renew-btn w-full mt-1 bg-slate-600 text-white text-xs font-semibold py-2 rounded-lg';

              try {
                const res = await apiFetch(API_BASE + '/members/renew', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: memberId })
                });
                const data = await res.json();

                if (data.success) {
                  await loadMembersLists();
                } else {
                  btn.disabled = false;
                  btn.textContent = 'تجديد الاشتراك';
                  btn.className = 'w-full mt-1 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold py-2 rounded-lg transition-colors duration-200';
                  const errDiv = document.getElementById('members-error');
                  if (errDiv) {
                    errDiv.textContent = data.message;
                    errDiv.classList.remove('hidden');
                    setTimeout(() => errDiv.classList.add('hidden'), 5000);
                  }
                }
              } catch (_) {
                btn.disabled = false;
                btn.textContent = 'تجديد الاشتراك';
                btn.className = 'w-full mt-1 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold py-2 rounded-lg transition-colors duration-200';
                const errDiv = document.getElementById('members-error');
                if (errDiv) {
                  errDiv.textContent = 'تعذر الاتصال بالخادم';
                  errDiv.classList.remove('hidden');
                  setTimeout(() => errDiv.classList.add('hidden'), 5000);
                }
              }
            });
          });
        }

        document.querySelectorAll('.delete-member-btn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            const name = btn.getAttribute('data-name');
            if (!confirm('هل أنت متأكد من حذف العضو "' + name + '"؟')) return;
            try {
              const res = await apiFetch(API_BASE + '/members/' + id, { method: 'DELETE' });
              const data = await res.json();
              const errDiv = document.getElementById('members-error');
              if (errDiv) {
                errDiv.className = 'mt-2 p-3 rounded-lg ' + (data.success ? 'bg-emerald-950/60 border border-emerald-800/40 text-emerald-200' : 'bg-rose-950/60 border border-rose-800/40 text-rose-200') + ' text-sm';
                errDiv.textContent = data.message;
                errDiv.classList.remove('hidden');
                setTimeout(() => errDiv.classList.add('hidden'), 5000);
              }
              if (data.success) loadMembersLists();
            } catch (_) {
              const errDiv = document.getElementById('members-error');
              if (errDiv) {
                errDiv.className = 'mt-2 p-3 rounded-lg bg-rose-950/60 border border-rose-800/40 text-rose-200 text-sm';
                errDiv.textContent = 'تعذر الاتصال بالخادم';
                errDiv.classList.remove('hidden');
                setTimeout(() => errDiv.classList.add('hidden'), 5000);
              }
            }
          });
        });

        document.querySelectorAll('.edit-member-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const nameCell = btn.closest('[class*="bg-slate-800"]').querySelector('.text-sm.text-slate-100');
            const name = nameCell ? nameCell.textContent.trim() : '';
            const phone = btn.getAttribute('data-phone') || '';
            const planId = btn.getAttribute('data-plan') || '';
            const trainerId = btn.getAttribute('data-trainer') || '';
            openEditMemberModal(id, name, phone, planId, trainerId);
          });
        });

        document.querySelectorAll('.pay-member-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const name = btn.getAttribute('data-name');
            openPaymentModal(id, name);
          });
        });
      } else {
        activeMembersDiv.innerHTML = '<p class="text-slate-600 text-sm py-4 text-center">فشل تحميل البيانات</p>';
        expiredMembersDiv.innerHTML = '<p class="text-slate-600 text-sm py-4 text-center">فشل تحميل البيانات</p>';
      }
    } catch (_) {
      activeMembersDiv.innerHTML = '<p class="text-rose-500 text-sm py-4 text-center">تعذر الاتصال بالخادم</p>';
      expiredMembersDiv.innerHTML = '<p class="text-rose-500 text-sm py-4 text-center">تعذر الاتصال بالخادم</p>';
    }
  }

  if (refreshMembersBtn) {
    refreshMembersBtn.addEventListener('click', loadMembersLists);
  }

  // ================================================================
  //  Members by-plan classification
  // ================================================================
  async function loadMembersByPlan() {
    const container = document.getElementById('members-by-plan-container');
    if (!container) return;
    container.innerHTML = '<p class="text-slate-600 text-sm py-4 text-center">جاري التحميل...</p>';
    try {
      const res = await fetch(API_BASE + '/employee/members/by-plan');
      const data = await res.json();
      if (data.success && data.plans.length > 0) {
        container.innerHTML = '';
        data.plans.forEach((plan) => {
          const section = document.createElement('div');
          section.className = 'bg-slate-900/40 border border-slate-700/40 rounded-xl p-5';
          const activeCount = plan.active_count || 0;
          const expiredCount = plan.expired_count || 0;
          section.innerHTML =
            '<div class="flex items-center justify-between mb-3">' +
            '<h3 class="font-cyber text-sm tracking-widest text-emerald-400">' + plan.name + '</h3>' +
            '<div class="flex gap-2 text-xs"><span class="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">نشط: ' + activeCount + '</span><span class="text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full">منتهي: ' + expiredCount + '</span></div>' +
            '</div>';
          if (plan.members.length === 0) {
            section.innerHTML += '<p class="text-slate-600 text-sm py-2 text-center">لا يوجد أعضاء في هذه الباقة</p>';
          } else {
            const list = document.createElement('div');
            list.className = 'space-y-1.5';
            plan.members.forEach((m) => {
              const isExpired = m.status === 'expired';
              const item = document.createElement('div');
              item.className = 'flex items-center justify-between bg-slate-800/20 rounded-lg px-3 py-2';
              item.innerHTML =
                '<div class="flex items-center gap-2.5"><span class="w-1.5 h-1.5 rounded-full ' + (isExpired ? 'bg-rose-500' : 'bg-emerald-500') + ' shrink-0"></span><div><div class="text-sm text-slate-100">' + m.name + ' <span class="text-[11px] text-slate-500">(' + m.id + ')</span></div><div class="text-[11px] text-slate-500">' + (m.trainer_name || 'بدون مدرب') + ' · ' + (fmtDate(m.expiry_date) || '—') + '</div></div></div>' +
                '<span class="text-[11px] ' + (isExpired ? 'text-rose-400 bg-rose-500/10' : 'text-emerald-400 bg-emerald-500/10') + ' px-2 py-0.5 rounded-full">' + (isExpired ? 'منتهي' : 'نشط') + '</span>';
              list.appendChild(item);
            });
            section.appendChild(list);
          }
          container.appendChild(section);
        });
      } else {
        container.innerHTML = '<p class="text-slate-600 text-sm py-4 text-center">لا توجد باقات</p>';
      }
    } catch (err) {
      console.error('loadMembersByPlan error:', err);
      container.innerHTML = '<p class="text-rose-500 text-sm py-4 text-center">تعذر تحميل البيانات</p>';
    }
  }

  const showAllBtn = document.getElementById('show-members-all-btn');
  const showByPlanBtn = document.getElementById('show-members-by-plan-btn');
  if (showAllBtn && showByPlanBtn) {
    showAllBtn.addEventListener('click', () => {
      document.getElementById('members-all-view').classList.remove('hidden');
      document.getElementById('members-by-plan-view').classList.add('hidden');
      showAllBtn.className = 'text-xs text-emerald-400 border border-emerald-700/50 hover:bg-emerald-900/30 px-3 py-1.5 rounded-lg transition-colors';
      showByPlanBtn.className = 'text-xs text-slate-500 border border-slate-700/50 hover:bg-slate-800/40 px-3 py-1.5 rounded-lg transition-colors';
    });
    showByPlanBtn.addEventListener('click', () => {
      document.getElementById('members-all-view').classList.add('hidden');
      document.getElementById('members-by-plan-view').classList.remove('hidden');
      showByPlanBtn.className = 'text-xs text-emerald-400 border border-emerald-700/50 hover:bg-emerald-900/30 px-3 py-1.5 rounded-lg transition-colors';
      showAllBtn.className = 'text-xs text-slate-500 border border-slate-700/50 hover:bg-slate-800/40 px-3 py-1.5 rounded-lg transition-colors';
      loadMembersByPlan();
    });
  }

  // ================================================================
  //  EDIT MEMBER MODAL  -  receptionist edits member data
  // ================================================================
  const editMemberModal = document.getElementById('edit-member-modal');
  const editMemberForm = document.getElementById('edit-member-form');
  const editMemberCancel = document.getElementById('edit-member-cancel');
  const editMemberResult = document.getElementById('edit-member-result');

  async function populateEditMemberDropdowns(selectedPlanId, selectedTrainerId) {
    const planSelect = document.getElementById('edit-member-plan-id');
    const trainerSelect = document.getElementById('edit-member-trainer-id');
    if (!planSelect) return;
    try {
      const [plansRes, trainersRes] = await Promise.all([
        fetch(API_BASE + '/plans/active'),
        fetch(API_BASE + '/employee/trainers')
      ]);
      const plansData = await plansRes.json();
      const trainersData = await trainersRes.json();

      planSelect.innerHTML = '';
      if (plansData.success && plansData.plans) {
        plansData.plans.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = p.name + ' - ' + p.price + ' د.ل';
          if (String(p.id) === String(selectedPlanId)) opt.selected = true;
          planSelect.appendChild(opt);
        });
      }

      trainerSelect.innerHTML = '<option value="">-- بدون مدرب --</option>';
      if (trainersData.success && trainersData.trainers) {
        trainersData.trainers.forEach(e => {
          const opt = document.createElement('option');
          opt.value = e.id;
          const spec = e.specialization ? ' [' + e.specialization + ']' : '';
          opt.textContent = e.name + spec + ' (' + e.id + ')';
          if (e.id === selectedTrainerId) opt.selected = true;
          trainerSelect.appendChild(opt);
        });
      }
    } catch (_) {}
  }

  function openEditMemberModal(id, name, phone, planId, trainerId) {
    document.getElementById('edit-member-id').value = id;
    document.getElementById('edit-member-name').value = name;
    document.getElementById('edit-member-phone').value = phone;
    editMemberResult.classList.add('hidden');
    editMemberModal.classList.remove('hidden');
    populateEditMemberDropdowns(planId, trainerId);
  }

  function closeEditMemberModal() {
    editMemberModal.classList.add('hidden');
    editMemberResult.classList.add('hidden');
  }

  if (editMemberForm) {
    editMemberForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('edit-member-id').value;
      const name = document.getElementById('edit-member-name').value.trim();
      const phone = document.getElementById('edit-member-phone').value.trim();
      const plan_id = document.getElementById('edit-member-plan-id').value;
      const trainer_id = document.getElementById('edit-member-trainer-id').value;
      editMemberResult.classList.add('hidden');

      if (!name || !phone || !plan_id) {
        editMemberResult.className = 'mt-3 p-3 rounded-lg bg-rose-950/60 border border-rose-800/40 text-rose-200 text-sm';
        editMemberResult.textContent = 'يرجى ملء جميع الحقول';
        editMemberResult.classList.remove('hidden');
        return;
      }

      try {
        const res = await apiFetch(API_BASE + '/members/' + id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, phone, plan_id, trainer_id: trainer_id || null })
        });
        const data = await res.json();
        editMemberResult.className = 'mt-3 p-3 rounded-lg ' + (data.success ? 'bg-emerald-950/60 border border-emerald-800/40 text-emerald-200' : 'bg-rose-950/60 border border-rose-800/40 text-rose-200') + ' text-sm';
        editMemberResult.textContent = data.message;
        editMemberResult.classList.remove('hidden');

        if (data.success) {
          setTimeout(() => { closeEditMemberModal(); loadMembersLists(); }, 1200);
        }
      } catch (_) {
        editMemberResult.className = 'mt-3 p-3 rounded-lg bg-rose-950/60 border border-rose-800/40 text-rose-200 text-sm';
        editMemberResult.textContent = 'تعذر الاتصال بالخادم';
        editMemberResult.classList.remove('hidden');
      }
    });
  }

  if (editMemberCancel) {
    editMemberCancel.addEventListener('click', closeEditMemberModal);
  }

  // Click on backdrop to close
  if (editMemberModal) {
    editMemberModal.addEventListener('click', (e) => {
      if (e.target === editMemberModal) closeEditMemberModal();
    });
  }

  // ================================================================
  //  TAB: MANAGER PLANS  -  CRUD operations
  // ================================================================
  async function loadPlansTable() {
    const tbody = document.getElementById('plans-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td class="py-8 px-4 text-center text-slate-600" colspan="6">جاري التحميل...</td></tr>';
    try {
      const res = await apiFetch(API_BASE + '/plans/active');
      const data = await res.json();
      if (data.success && data.plans.length > 0) {
        tbody.innerHTML = '';
        data.plans.forEach((p) => {
          const tr = document.createElement('tr');
          tr.className = 'border-b border-slate-800/30';
          tr.innerHTML =
            '<td class="py-3 px-4 text-slate-400">' + p.id + '</td>' +
            '<td class="py-3 px-4 text-slate-100">' + p.name + '</td>' +
            '<td class="py-3 px-4 text-slate-300">' + p.duration_days + ' يوم</td>' +
            '<td class="py-3 px-4 text-emerald-400">' + parseFloat(p.price).toFixed(2) + ' د.ل</td>' +
            '<td class="py-3 px-4"><span class="text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full text-xs">نشط</span></td>' +
            '<td class="py-3 px-4"><div class="flex gap-2">' +
            '<button class="plan-edit-btn bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 px-2.5 py-1 rounded text-xs transition-colors" data-id="' + p.id + '" data-name="' + p.name.replace(/"/g, '&quot;') + '" data-duration="' + p.duration_days + '" data-price="' + p.price + '">تعديل</button>' +
            '<button class="plan-delete-btn bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 px-2.5 py-1 rounded text-xs transition-colors" data-id="' + p.id + '">حذف</button>' +
            '</div></td>';
          tbody.appendChild(tr);
        });

        tbody.querySelectorAll('.plan-edit-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            document.getElementById('plan-name').value = btn.getAttribute('data-name');
            document.getElementById('plan-duration').value = btn.getAttribute('data-duration');
            document.getElementById('plan-price').value = btn.getAttribute('data-price');
            document.getElementById('plan-edit-id').value = btn.getAttribute('data-id');
            document.getElementById('plan-save-btn').textContent = 'تحديث الباقة';
            document.getElementById('plan-cancel-btn').classList.remove('hidden');
          });
        });

        tbody.querySelectorAll('.plan-delete-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (!confirm('هل أنت متأكد من حذف هذه الباقة؟')) return;
            const id = btn.getAttribute('data-id');
            try {
              const res = await apiFetch(API_BASE + '/manager/plans/' + id, { method: 'DELETE' });
              const data = await res.json();
              const resultDiv = document.getElementById('plan-result');
              if (resultDiv) {
                resultDiv.className = 'mt-4 p-3 rounded-lg ' + (data.success ? 'bg-emerald-950/60 border border-emerald-800/40 text-emerald-200' : 'bg-rose-950/60 border border-rose-800/40 text-rose-200') + ' text-sm';
                resultDiv.textContent = data.message;
                resultDiv.classList.remove('hidden');
                setTimeout(() => resultDiv.classList.add('hidden'), 5000);
              }
              if (data.success) {
                loadPlansTable();
                loadPlansDropdown();
              }
            } catch (_) {
              const resultDiv = document.getElementById('plan-result');
              if (resultDiv) {
                resultDiv.className = 'mt-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800/40 text-rose-200 text-sm';
                resultDiv.textContent = 'تعذر الاتصال بالخادم';
                resultDiv.classList.remove('hidden');
              }
            }
          });
        });
      } else {
        tbody.innerHTML = '<tr><td class="py-8 px-4 text-center text-slate-600" colspan="6">لا توجد باقات مضافة</td></tr>';
      }
    } catch (_) {
      tbody.innerHTML = '<tr><td class="py-8 px-4 text-center text-rose-500" colspan="6">تعذر تحميل البيانات</td></tr>';
    }
  }

  const planForm = document.getElementById('plan-form');
  const planCancelBtn = document.getElementById('plan-cancel-btn');

  if (planForm) {
    planForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('plan-name').value.trim();
      const duration_days = document.getElementById('plan-duration').value.trim();
      const price = document.getElementById('plan-price').value.trim();
      const editId = document.getElementById('plan-edit-id').value;

      if (!name || !duration_days || price === '') {
        const resultDiv = document.getElementById('plan-result');
        if (resultDiv) {
          resultDiv.className = 'mt-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800/40 text-rose-200 text-sm';
          resultDiv.textContent = 'يرجى ملء جميع الحقول';
          resultDiv.classList.remove('hidden');
        }
        return;
      }

      const resultDiv = document.getElementById('plan-result');
      if (resultDiv) resultDiv.classList.add('hidden');

      try {
        const isUpdate = editId !== '';
        const url = isUpdate ? API_BASE + '/manager/plans/' + editId : API_BASE + '/manager/plans';
        const method = isUpdate ? 'PUT' : 'POST';

        const res = await apiFetch(url, {
          method: method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, duration_days: parseInt(duration_days, 10), price: parseFloat(price) })
        });

        const data = await res.json();

        if (resultDiv) {
          resultDiv.className = 'mt-4 p-3 rounded-lg ' + (data.success ? 'bg-emerald-950/60 border border-emerald-800/40 text-emerald-200' : 'bg-rose-950/60 border border-rose-800/40 text-rose-200') + ' text-sm';
          resultDiv.textContent = data.message;
          resultDiv.classList.remove('hidden');
          setTimeout(() => resultDiv.classList.add('hidden'), 5000);
        }

        if (data.success) {
          document.getElementById('plan-name').value = '';
          document.getElementById('plan-duration').value = '';
          document.getElementById('plan-price').value = '';
          document.getElementById('plan-edit-id').value = '';
          document.getElementById('plan-save-btn').textContent = 'إضافة الباقة';
          if (planCancelBtn) planCancelBtn.classList.add('hidden');
          loadPlansTable();
          loadPlansDropdown();
        }
      } catch (_) {
        if (resultDiv) {
          resultDiv.className = 'mt-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800/40 text-rose-200 text-sm';
          resultDiv.textContent = 'تعذر الاتصال بالخادم';
          resultDiv.classList.remove('hidden');
        }
      }
    });

    if (planCancelBtn) {
      planCancelBtn.addEventListener('click', () => {
        document.getElementById('plan-name').value = '';
        document.getElementById('plan-duration').value = '';
        document.getElementById('plan-price').value = '';
        document.getElementById('plan-edit-id').value = '';
        document.getElementById('plan-save-btn').textContent = 'إضافة الباقة';
        planCancelBtn.classList.add('hidden');
        const resultDiv = document.getElementById('plan-result');
        if (resultDiv) resultDiv.classList.add('hidden');
      });
    }
  }

  // ================================================================
  //  TAB: MANAGER STAFF  -  employee management
  // ================================================================
  async function loadStaffTable() {
    const tbody = document.getElementById('staff-management-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td class="py-8 px-4 text-center text-slate-600" colspan="8">جاري التحميل...</td></tr>';
    try {
      const res = await apiFetch(API_BASE + '/manager/employees/all');
      const data = await res.json();
      if (data.success && data.employees.length > 0) {
        const filtered = data.employees.filter(emp => emp.id !== 'ADMIN');
        if (filtered.length === 0) {
          tbody.innerHTML = '<tr><td class="py-8 px-4 text-center text-slate-600" colspan="8">لا يوجد موظفون</td></tr>';
        } else {
          tbody.innerHTML = '';
          filtered.forEach((emp) => {
          const tr = document.createElement('tr');
          tr.className = 'border-b border-slate-800/30';
          const isClockedIn = emp.is_clocked_in === 1;
          const schedule = (emp.work_start && emp.work_end) ? emp.work_start.substring(0,5) + ' - ' + emp.work_end.substring(0,5) : '—';
          const specialization = emp.specialization || '—';
          const clockTime = isClockedIn && emp.last_clock_in ? ' منذ ' + new Date(emp.last_clock_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
          tr.innerHTML =
            '<td class="py-3 px-4 text-slate-300">' + emp.id + '</td>' +
            '<td class="py-3 px-4 text-slate-100">' + emp.name + '</td>' +
            '<td class="py-3 px-4 text-slate-400 text-xs">' + (emp.phone || '—') + '</td>' +
            '<td class="py-3 px-4 text-slate-400">' + emp.role + '</td>' +
            '<td class="py-3 px-4 text-slate-500 text-xs">' + specialization + '</td>' +
            '<td class="py-3 px-4 text-slate-500 text-xs">' + schedule + '</td>' +
            '<td class="py-3 px-4"><span class="px-2.5 py-0.5 rounded-full text-xs ' +
            (isClockedIn ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-600/20 text-rose-400') + '">' +
            (isClockedIn ? '🟢 نشط' + clockTime : '🔴 غير نشط') + '</span></td>' +
            '<td class="py-3 px-4 flex gap-1.5"><button class="edit-staff-btn bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 px-2.5 py-1 rounded text-xs transition-colors" data-id="' + emp.id + '">تعديل</button><button class="delete-staff-btn bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 px-2.5 py-1 rounded text-xs transition-colors" data-id="' + emp.id + '" data-name="' + emp.name.replace(/"/g, '&quot;') + '">حذف</button></td>';
          tbody.appendChild(tr);
        });

        tbody.querySelectorAll('.delete-staff-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            const name = btn.getAttribute('data-name');
            if (!confirm('هل أنت متأكد من حذف الموظف "' + name + '"؟')) return;
            try {
              const res = await apiFetch(API_BASE + '/manager/employees/' + id, { method: 'DELETE' });
              const data = await res.json();
              const resultDiv = document.getElementById('staff-result');
              if (resultDiv) {
                resultDiv.className = 'mt-4 p-3 rounded-lg ' + (data.success ? 'bg-emerald-950/60 border border-emerald-800/40 text-emerald-200' : 'bg-rose-950/60 border border-rose-800/40 text-rose-200') + ' text-sm';
                resultDiv.textContent = data.message;
                resultDiv.classList.remove('hidden');
                setTimeout(() => resultDiv.classList.add('hidden'), 5000);
              }
              if (data.success) {
                loadStaffTable();
                if (typeof initManagerDashboard === 'function') initManagerDashboard();
              }
            } catch (_) {
              const resultDiv = document.getElementById('staff-result');
              if (resultDiv) {
                resultDiv.className = 'mt-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800/40 text-rose-200 text-sm';
                resultDiv.textContent = 'تعذر الاتصال بالخادم';
                resultDiv.classList.remove('hidden');
              }
            }
          });
        });

        tbody.querySelectorAll('.edit-staff-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const tr = btn.closest('tr');
            const cells = tr.querySelectorAll('td');
            document.getElementById('staff-edit-id').value = id;
            document.getElementById('staff-name').value = cells[1].textContent.trim();
            document.getElementById('staff-phone').value = cells[2].textContent.trim() !== '—' ? cells[2].textContent.trim() : '';
            document.getElementById('staff-role').value = cells[3].textContent.trim();
            const spec = cells[4].textContent.trim();
            if (spec && spec !== '—') {
              document.getElementById('staff-specialization').value = spec;
            } else {
              document.getElementById('staff-specialization').value = '';
            }
            const schedule = cells[5].textContent.trim();
            if (schedule && schedule !== '—') {
              const parts = schedule.split(' - ');
              document.getElementById('staff-work-start').value = parts[0] || '';
              document.getElementById('staff-work-end').value = parts[1] || '';
            } else {
              document.getElementById('staff-work-start').value = '';
              document.getElementById('staff-work-end').value = '';
            }
            document.getElementById('staff-password').value = '';
            document.getElementById('staff-form-title').textContent = 'تعديل موظف - ' + id;
            document.getElementById('staff-submit-btn').textContent = 'تحديث الموظف';
            document.getElementById('staff-cancel-btn').classList.remove('hidden');
            document.getElementById('staff-result').classList.add('hidden');
            document.getElementById('staff-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
        });
      }
    } else {
      tbody.innerHTML = '<tr><td class="py-8 px-4 text-center text-slate-600" colspan="8">لا يوجد موظفون</td></tr>';
    }
    } catch (_) {
      tbody.innerHTML = '<tr><td class="py-8 px-4 text-center text-rose-500" colspan="8">تعذر تحميل البيانات</td></tr>';
    }
  }

  // ================================================================
  //  TAB: TRAINER MEMBERS  -  trainer dashboard with KPIs & attendance
  // ================================================================
  async function loadTrainerMembers() {
    const tbody = document.getElementById('trainer-members-tbody');
    if (!tbody) { console.warn('trainer-members-tbody not found'); return; }
    tbody.innerHTML = '<tr><td class="py-8 px-4 text-center text-slate-600" colspan="8">جاري التحميل...</td></tr>';
    try {
      const res = await apiFetch(API_BASE + '/employee/members/' + currentUser.id);
      const data = await res.json();
      if (data.success && data.members.length > 0) {
        let totalToday = 0;
        let activeCount = 0;
        const todayStr = new Date().toISOString().split('T')[0];

        tbody.innerHTML = '';
        data.members.forEach((m) => {
          const tr = document.createElement('tr');
          tr.className = 'border-b border-slate-800/30';
          const isExpired = fmtDate(m.expiry_date) < todayStr;
          const attended = m.attended_today == 1 || m.attended_today === true;
          if (attended) totalToday++;
          if (!isExpired) activeCount++;

          tr.innerHTML =
            '<td class="py-3 px-4 text-slate-400">' + m.id + '</td>' +
            '<td class="py-3 px-4 text-slate-100">' + m.name + '</td>' +
            '<td class="py-3 px-4 text-slate-400">' + (m.phone || '—') + '</td>' +
            '<td class="py-3 px-4 text-slate-300">' + (m.plan_name || '—') + '</td>' +
            '<td class="py-3 px-4 text-slate-500 text-xs">' + (fmtDate(m.registration_date) || '—') + '</td>' +
            '<td class="py-3 px-4 text-slate-500 text-xs">' + fmtDate(m.expiry_date) + '</td>' +
            '<td class="py-3 px-4"><span class="px-2.5 py-0.5 rounded-full text-xs ' +
            (isExpired ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400') + '">' +
            (isExpired ? 'منتهي' : 'نشط') + '</span></td>' +
            '<td class="py-3 px-4">' +
            (attended
              ? '<span class="view-history-btn cursor-pointer text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full text-xs hover:bg-emerald-500/20 transition-colors" data-member="' + m.id + '" data-name="' + m.name.replace(/"/g, '&quot;') + '">✔ حاضر</span>'
              : '<button class="mark-attendance-btn bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 px-2.5 py-1 rounded text-xs transition-colors" data-member="' + m.id + '">تسجيل حضور</button>') +
            '</td>';
          tbody.appendChild(tr);
        });

        // Update KPI cards
        setKpiValue('trainer-kpi-total', data.members.length);
        setKpiValue('trainer-kpi-today', totalToday);
        setKpiValue('trainer-kpi-active', activeCount);
        const rate = data.members.length > 0 ? Math.round((totalToday / data.members.length) * 100) : 0;
        setKpiValue('trainer-kpi-rate', rate + '%');

        tbody.querySelectorAll('.mark-attendance-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const memberId = btn.getAttribute('data-member');
            btn.disabled = true;
            btn.textContent = 'جاري...';
            try {
              const res = await apiFetch(API_BASE + '/employee/attendance/mark', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ trainerId: currentUser.id, memberId })
              });
              const data = await res.json();
              if (data.success) {
                initTrainerDashboard();
              } else {
                const errorDiv = document.getElementById('trainer-members-error');
                if (errorDiv) {
                  errorDiv.textContent = data.message;
                  errorDiv.classList.remove('hidden');
                  setTimeout(() => errorDiv.classList.add('hidden'), 5000);
                }
                btn.disabled = false;
                btn.textContent = 'تسجيل حضور';
              }
            } catch (_) {
              const errorDiv = document.getElementById('trainer-members-error');
              if (errorDiv) {
                errorDiv.textContent = 'تعذر الاتصال بالخادم';
                errorDiv.classList.remove('hidden');
                setTimeout(() => errorDiv.classList.add('hidden'), 5000);
              }
              btn.disabled = false;
              btn.textContent = 'تسجيل حضور';
            }
          });
        });

        tbody.querySelectorAll('.view-history-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const memberId = btn.getAttribute('data-member');
            const name = btn.getAttribute('data-name');
            openAttendanceHistory(memberId, name);
          });
        });

        const countEl = document.getElementById('trainer-members-count');
        if (countEl) countEl.textContent = 'إجمالي ' + data.members.length + ' متدرب';
      } else {
        tbody.innerHTML = '<tr><td class="py-8 px-4 text-center text-slate-600" colspan="8">لا يوجد متدربون</td></tr>';
        const countEl = document.getElementById('trainer-members-count');
        if (countEl) countEl.textContent = '';
        setKpiValue('trainer-kpi-total', '0');
        setKpiValue('trainer-kpi-today', '0');
        setKpiValue('trainer-kpi-active', '0');
        setKpiValue('trainer-kpi-rate', '0%');
      }
    } catch (_) {
      tbody.innerHTML = '<tr><td class="py-8 px-4 text-center text-rose-500" colspan="8">تعذر تحميل البيانات</td></tr>';
      setKpiValue('trainer-kpi-total', '0');
      setKpiValue('trainer-kpi-today', '0');
      setKpiValue('trainer-kpi-active', '0');
      setKpiValue('trainer-kpi-rate', '0%');
    }
  }

  function setKpiValue(id, val) {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = val;
    } else {
      console.warn('KPI element not found: #' + id);
    }
  }

  async function initTrainerDashboard() {
    await loadTrainerMembers();
    await loadTrainerAttendanceToday();
  }

  async function loadTrainerAttendanceToday() {
    const tbody = document.getElementById('trainer-today-tbody');
    const countEl = document.getElementById('trainer-today-count');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td class="py-6 px-4 text-center text-slate-600" colspan="3">جاري التحميل...</td></tr>';
    try {
      const res = await apiFetch(API_BASE + '/employee/attendance/today/' + currentUser.id);
      const data = await res.json();
      if (data.success && data.attendance.length > 0) {
        tbody.innerHTML = '';
        data.attendance.forEach((a, idx) => {
          const tr = document.createElement('tr');
          tr.className = 'border-b border-slate-800/30';
          const time = a.timestamp ? new Date(a.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—';
          tr.innerHTML =
            '<td class="py-2 px-4 text-slate-500 text-xs">' + (idx + 1) + '</td>' +
            '<td class="py-2 px-4 text-slate-100">' + (a.member_name || '—') + '</td>' +
            '<td class="py-2 px-4 text-slate-400 text-xs">' + time + '</td>';
          tbody.appendChild(tr);
        });
        if (countEl) countEl.textContent = 'إجمالي ' + data.attendance.length + ' حضور';
      } else {
        tbody.innerHTML = '<tr><td class="py-6 px-4 text-center text-slate-600" colspan="3">لا يوجد حضور اليوم</td></tr>';
        if (countEl) countEl.textContent = '';
      }
    } catch (_) {
      tbody.innerHTML = '<tr><td class="py-6 px-4 text-center text-rose-500" colspan="3">خطأ في التحميل</td></tr>';
    }
  }

  // Attendance History Modal
  const historyModal = document.getElementById('attendance-history-modal');
  const historyTbody = document.getElementById('history-tbody');
  const historyCloseBtn = document.getElementById('history-close-btn');
  const historyMemberLabel = document.getElementById('history-member-label');

  async function openAttendanceHistory(memberId, memberName) {
    if (!historyModal || !historyTbody) return;
    historyModal.classList.remove('hidden');
    if (historyMemberLabel) historyMemberLabel.textContent = memberName + ' (' + memberId + ')';
    historyTbody.innerHTML = '<tr><td class="py-8 px-4 text-center text-slate-600" colspan="2">جاري التحميل...</td></tr>';
    try {
      const res = await apiFetch(API_BASE + '/employee/attendance/history/' + memberId + '/' + currentUser.id);
      const data = await res.json();
      if (data.success && data.records.length > 0) {
        historyTbody.innerHTML = '';
        data.records.forEach((r) => {
          const tr = document.createElement('tr');
          tr.className = 'border-b border-slate-800/30';
          const date = r.attendance_date || '—';
          const time = r.timestamp ? new Date(r.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—';
          tr.innerHTML =
            '<td class="py-3 px-4 text-slate-200">' + date + '</td>' +
            '<td class="py-3 px-4 text-slate-400 text-xs">' + time + '</td>';
          historyTbody.appendChild(tr);
        });
      } else {
        historyTbody.innerHTML = '<tr><td class="py-8 px-4 text-center text-slate-600" colspan="2">لا توجد سجلات حضور سابقة</td></tr>';
      }
    } catch (_) {
      historyTbody.innerHTML = '<tr><td class="py-8 px-4 text-center text-rose-500" colspan="2">خطأ في تحميل السجل</td></tr>';
    }
  }

  function closeAttendanceHistory() {
    if (historyModal) historyModal.classList.add('hidden');
  }

  if (historyCloseBtn) {
    historyCloseBtn.addEventListener('click', closeAttendanceHistory);
  }

  if (historyModal) {
    historyModal.addEventListener('click', (e) => {
      if (e.target === historyModal) closeAttendanceHistory();
    });
  }

  // Refresh trainer dashboard
  const refreshTrainerBtn = document.getElementById('refresh-trainer-btn');
  if (refreshTrainerBtn) {
    refreshTrainerBtn.addEventListener('click', initTrainerDashboard);
  }

  // ================================================================
  //  Load trainers dropdown for member registration
  // ================================================================
  async function loadTrainersDropdown() {
    const select = document.getElementById('reg-trainer-id');
    if (!select) return;
    try {
      const res = await fetch(API_BASE + '/employee/trainers');
      const data = await res.json();
      if (data.success && data.trainers && data.trainers.length > 0) {
        select.innerHTML = '<option value="">-- بدون مدرب --</option>';
        data.trainers.forEach(e => {
          const opt = document.createElement('option');
          opt.value = e.id;
          const spec = e.specialization ? ' [' + e.specialization + ']' : '';
          opt.textContent = e.name + spec + ' (' + e.id + ')';
          select.appendChild(opt);
        });
      }
    } catch (_) {}
  }

  function resetStaffForm() {
    document.getElementById('staff-edit-id').value = '';
    document.getElementById('staff-name').value = '';
    document.getElementById('staff-phone').value = '';
    document.getElementById('staff-role').value = '';
    document.getElementById('staff-specialization').value = '';
    document.getElementById('staff-work-start').value = '';
    document.getElementById('staff-work-end').value = '';
    document.getElementById('staff-password').value = '';
    document.getElementById('staff-form-title').textContent = 'إضافة موظف جديد';
    document.getElementById('staff-submit-btn').textContent = 'إضافة الموظف';
    document.getElementById('staff-cancel-btn').classList.add('hidden');
    document.getElementById('staff-result').classList.add('hidden');
  }

  const staffForm = document.getElementById('staff-form');
  if (staffForm) {
    staffForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const editId = document.getElementById('staff-edit-id').value;
      const name = document.getElementById('staff-name').value.trim();
      const role = document.getElementById('staff-role').value.trim();
      const specialization = document.getElementById('staff-specialization').value || null;
      const work_start = document.getElementById('staff-work-start').value || null;
      const work_end = document.getElementById('staff-work-end').value || null;
      const password = document.getElementById('staff-password').value.trim();
      const submitBtn = document.getElementById('staff-submit-btn');
      const resultDiv = document.getElementById('staff-result');
      if (resultDiv) resultDiv.classList.add('hidden');
      if (!name || !role) {
        if (resultDiv) {
          resultDiv.className = 'mt-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800/40 text-rose-200 text-sm';
          resultDiv.textContent = 'يرجى ملء جميع الحقول';
          resultDiv.classList.remove('hidden');
        }
        return;
      }
      if (!editId && (!password || password.length < 3)) {
        if (resultDiv) {
          resultDiv.className = 'mt-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800/40 text-rose-200 text-sm';
          resultDiv.textContent = 'كلمة المرور يجب أن تكون 3 أحرف على الأقل';
          resultDiv.classList.remove('hidden');
        }
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = 'جاري الإضافة...';
      submitBtn.classList.remove('bg-emerald-600', 'hover:bg-emerald-500');
      submitBtn.classList.add('bg-slate-600', 'cursor-not-allowed');
      try {
        const url = editId ? API_BASE + '/manager/employees/' + editId : API_BASE + '/manager/employees';
        const method = editId ? 'PUT' : 'POST';
        const phone = document.getElementById('staff-phone').value.trim();
        const body = { name, role, phone, specialization, work_start, work_end };
        if (password) body.password = password;
        const res = await apiFetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        if (resultDiv) {
          resultDiv.className = 'mt-4 p-3 rounded-lg ' + (data.success ? 'bg-emerald-950/60 border border-emerald-800/40 text-emerald-200' : 'bg-rose-950/60 border border-rose-800/40 text-rose-200') + ' text-sm';
          resultDiv.textContent = data.message;
          resultDiv.classList.remove('hidden');
          setTimeout(() => resultDiv.classList.add('hidden'), 5000);
        }
        if (data.success) {
          resetStaffForm();
          loadStaffTable();
        }
      } catch (_) {
        if (resultDiv) {
          resultDiv.className = 'mt-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800/40 text-rose-200 text-sm';
          resultDiv.textContent = 'تعذر الاتصال بالخادم';
          resultDiv.classList.remove('hidden');
        }
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = editId ? 'تحديث الموظف' : 'إضافة الموظف';
        submitBtn.classList.remove('bg-slate-600', 'cursor-not-allowed');
        submitBtn.classList.add('bg-emerald-600', 'hover:bg-emerald-500');
      }
    });
  }

  const staffCancelBtn = document.getElementById('staff-cancel-btn');
  if (staffCancelBtn) {
    staffCancelBtn.addEventListener('click', resetStaffForm);
  }

  // ================================================================
  //  TAB: MANAGER AUDIT LOGS  -  security audit terminal
  // ================================================================
  function getAuditFilterParams() {
    const params = new URLSearchParams();
    const search = document.getElementById('audit-filter-search');
    const role = document.getElementById('audit-filter-role');
    const user = document.getElementById('audit-filter-user');
    const dateFrom = document.getElementById('audit-filter-from');
    const dateTo = document.getElementById('audit-filter-to');
    if (search && search.value.trim()) params.set('search', search.value.trim());
    if (role && role.value) params.set('filterRole', role.value);
    if (user && user.value.trim()) params.set('user', user.value.trim());
    if (dateFrom && dateFrom.value) params.set('dateFrom', dateFrom.value);
    if (dateTo && dateTo.value) params.set('dateTo', dateTo.value);
    return params.toString();
  }

  function resetAuditFilters() {
    ['audit-filter-search', 'audit-filter-user', 'audit-filter-from', 'audit-filter-to'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const role = document.getElementById('audit-filter-role');
    if (role) role.value = '';
    loadAuditLogs();
  }

  async function loadAuditLogs() {
    const tbody = document.getElementById('audit-logs-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td class="py-8 px-4 text-center text-slate-600" colspan="3">جاري التحميل...</td></tr>';
    const countEl = document.getElementById('audit-count');
    try {
      const qs = getAuditFilterParams();
      const res = await apiFetch(API_BASE + '/manager/audit-logs' + (qs ? '?' + qs : ''));
      const data = await res.json();
      if (data.success && data.logs.length > 0) {
        tbody.innerHTML = '';
        data.logs.forEach((log) => {
          const tr = document.createElement('tr');
          tr.className = 'border-b border-slate-800/30';
          const ts = log.timestamp ? new Date(log.timestamp).toLocaleString('en-US') : '—';
          tr.innerHTML =
            '<td class="py-3 px-4 text-cyan-400/70 text-xs">' + ts + '</td>' +
            '<td class="py-3 px-4 text-cyan-300">' + log.user_name + ' <span class="text-slate-500 text-[10px]">(' + log.user_role + ')</span></td>' +
            '<td class="py-3 px-4 text-slate-300">' + log.action_details + '</td>';
          tbody.appendChild(tr);
        });
        if (countEl) countEl.textContent = 'عدد السجلات: ' + data.logs.length;
      } else {
        tbody.innerHTML = '<tr><td class="py-8 px-4 text-center text-slate-600" colspan="3">لا توجد سجلات</td></tr>';
        if (countEl) countEl.textContent = '';
      }
    } catch (_) {
      tbody.innerHTML = '<tr><td class="py-8 px-4 text-center text-rose-500" colspan="3">تعذر تحميل السجلات</td></tr>';
      if (countEl) countEl.textContent = '';
    }
  }

  const refreshAuditBtn = document.getElementById('refresh-audit-btn');
  if (refreshAuditBtn) {
    refreshAuditBtn.addEventListener('click', loadAuditLogs);
  }

  const auditApplyBtn = document.getElementById('audit-filter-apply');
  if (auditApplyBtn) {
    auditApplyBtn.addEventListener('click', loadAuditLogs);
  }

  const auditResetBtn = document.getElementById('audit-filter-reset');
  if (auditResetBtn) {
    auditResetBtn.addEventListener('click', resetAuditFilters);
  }

  // ================================================================
  //  PAYMENT CHECKOUT MODAL  -  process payment + activate subscription
  // ================================================================
  const paymentModal = document.getElementById('payment-modal');
  const paymentMemberId = document.getElementById('payment-member-id');
  const paymentMemberLabel = document.getElementById('payment-member-label');
  const paymentPlanSelect = document.getElementById('payment-plan-id');
  const paymentAmount = document.getElementById('payment-amount');
  const paymentForm = document.getElementById('payment-form');
  const paymentCancelBtn = document.getElementById('payment-cancel-btn');
  const paymentResult = document.getElementById('payment-result');
  const paymentSubmitBtn = document.getElementById('payment-submit-btn');
  const paymentSuccessAnim = document.getElementById('payment-success-anim');
  const summaryPlan = document.getElementById('summary-plan');
  const summaryDuration = document.getElementById('summary-duration');
  const summaryAmount = document.getElementById('summary-amount');
  const summaryExpiry = document.getElementById('summary-expiry');

  let paymentPlansCache = [];

  async function loadPaymentPlans() {
    if (!paymentPlanSelect) return;
    try {
      const res = await fetch(API_BASE + '/plans/active');
      const data = await res.json();
      if (data.success && data.plans.length > 0) {
        paymentPlansCache = data.plans;
        paymentPlanSelect.innerHTML = '<option value="" disabled selected>-- اختر الباقة --</option>';
        data.plans.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.setAttribute('data-duration', p.duration_days);
          opt.setAttribute('data-price', p.price);
          opt.textContent = p.name + ' - ' + parseFloat(p.price).toFixed(2) + ' د.ل (' + p.duration_days + ' يوم)';
          paymentPlanSelect.appendChild(opt);
        });
      }
    } catch (_) {}
  }

  function updatePaymentSummary() {
    const selected = paymentPlanSelect.options[paymentPlanSelect.selectedIndex];
    if (!selected || !selected.value) {
      paymentAmount.value = '';
      summaryPlan.textContent = '—';
      summaryDuration.textContent = '—';
      summaryAmount.textContent = '—';
      summaryExpiry.textContent = '—';
      return;
    }
    const duration = parseInt(selected.getAttribute('data-duration'), 10) || 0;
    const price = parseFloat(selected.getAttribute('data-price')) || 0;
    paymentAmount.value = price.toFixed(2);
    summaryPlan.textContent = selected.textContent.split(' - ')[0];
    summaryDuration.textContent = duration + ' يوم';
    summaryAmount.textContent = price.toFixed(2) + ' د.ل';

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + duration);
    summaryExpiry.textContent = expiry.toISOString().split('T')[0];
  }

  function openPaymentModal(memberId, memberName) {
    if (paymentMemberId) paymentMemberId.value = memberId;
    if (paymentMemberLabel) paymentMemberLabel.textContent = 'العضو: ' + memberName + ' (' + memberId + ')';
    if (paymentResult) paymentResult.classList.add('hidden');
    if (paymentPlanSelect) paymentPlanSelect.value = '';
    if (paymentAmount) paymentAmount.value = '';
    summaryPlan.textContent = '—';
    summaryDuration.textContent = '—';
    summaryAmount.textContent = '—';
    summaryExpiry.textContent = '—';
    if (paymentSubmitBtn) paymentSubmitBtn.disabled = false;
    loadPaymentPlans();
    if (paymentModal) paymentModal.classList.remove('hidden');
  }

  function closePaymentModal() {
    if (paymentModal) paymentModal.classList.add('hidden');
    if (paymentResult) paymentResult.classList.add('hidden');
  }

  if (paymentPlanSelect) {
    paymentPlanSelect.addEventListener('change', updatePaymentSummary);
  }

  if (paymentCancelBtn) {
    paymentCancelBtn.addEventListener('click', closePaymentModal);
  }

  // ================================================================
  //  TRAINER WORKDAYS  -  Manager adds, receptionist views
  // ================================================================
  const DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  function renderDayCheckboxes(container, selectedDays) {
    if (!container) return;
    container.innerHTML = '';
    DAY_NAMES.forEach((name, idx) => {
      const label = document.createElement('label');
      label.className = 'flex items-center gap-2 cursor-pointer bg-slate-800/40 rounded-lg px-3 py-2 hover:bg-slate-700/40 transition-colors';
      const checked = selectedDays.includes(idx) ? 'checked' : '';
      label.innerHTML =
        '<input type="checkbox" value="' + idx + '" ' + checked + ' class="accent-emerald-500 w-4 h-4">' +
        '<span class="text-sm text-slate-200">' + name + '</span>';
      container.appendChild(label);
    });
  }

  async function loadWorkdaysManager() {
    const tbody = document.getElementById('workdays-mgr-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td class="py-8 px-4 text-center text-slate-600" colspan="4">جاري التحميل...</td></tr>';
    try {
      const res = await apiFetch(API_BASE + '/employee/trainers/workdays');
      const data = await res.json();
      if (data.success && data.trainers.length > 0) {
        tbody.innerHTML = '';
        data.trainers.forEach((t) => {
          const tr = document.createElement('tr');
          tr.className = 'border-b border-slate-800/30';
          const dayLabels = t.workdays.length > 0 ? t.workdays.sort().map(d => DAY_NAMES[d]).join(' - ') : '—';
          tr.innerHTML =
            '<td class="py-3 px-4 text-slate-100">' + t.name + '</td>' +
            '<td class="py-3 px-4 text-slate-500 text-xs">' + (t.specialization || '—') + '</td>' +
            '<td class="py-3 px-4 text-slate-300 text-xs" id="wd-display-' + t.id + '">' + dayLabels + '</td>' +
            '<td class="py-3 px-4"><button class="edit-workday-btn bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 px-2.5 py-1 rounded text-xs transition-colors" data-id="' + t.id + '" data-name="' + t.name.replace(/"/g, '&quot;') + '">تعديل</button></td>';
          tbody.appendChild(tr);
        });

        tbody.querySelectorAll('.edit-workday-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const name = btn.getAttribute('data-name');
            openWorkdayModal(id, name);
          });
        });
      } else {
        tbody.innerHTML = '<tr><td class="py-8 px-4 text-center text-slate-600" colspan="4">لا يوجد مدربون</td></tr>';
      }
    } catch (_) {
      tbody.innerHTML = '<tr><td class="py-8 px-4 text-center text-rose-500" colspan="4">خطأ في التحميل</td></tr>';
    }
  }

  async function loadWorkdaysReception() {
    const tbody = document.getElementById('workdays-reception-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td class="py-8 px-4 text-center text-slate-600" colspan="4">جاري التحميل...</td></tr>';
    try {
      const res = await apiFetch(API_BASE + '/employee/trainers/workdays');
      const data = await res.json();
      if (data.success && data.trainers.length > 0) {
        tbody.innerHTML = '';
        data.trainers.forEach((t) => {
          const tr = document.createElement('tr');
          tr.className = 'border-b border-slate-800/30';
          const dayLabels = t.workdays.length > 0 ? t.workdays.sort().map(d => DAY_NAMES[d]).join(' - ') : '—';
          const schedule = (t.work_start && t.work_end) ? t.work_start.substring(0, 5) + ' - ' + t.work_end.substring(0, 5) : '—';
          tr.innerHTML =
            '<td class="py-3 px-4 text-slate-100">' + t.name + '</td>' +
            '<td class="py-3 px-4 text-slate-500 text-xs">' + (t.specialization || '—') + '</td>' +
            '<td class="py-3 px-4 text-slate-300 text-xs">' + dayLabels + '</td>' +
            '<td class="py-3 px-4 text-slate-400 text-xs">' + schedule + '</td>';
          tbody.appendChild(tr);
        });
      } else {
        tbody.innerHTML = '<tr><td class="py-8 px-4 text-center text-slate-600" colspan="4">لا يوجد مدربون</td></tr>';
      }
    } catch (_) {
      tbody.innerHTML = '<tr><td class="py-8 px-4 text-center text-rose-500" colspan="4">خطأ في التحميل</td></tr>';
    }
  }

  let editingWorkdayId = null;

  function openWorkdayModal(id, name) {
    editingWorkdayId = id;
    document.getElementById('workday-modal-title').textContent = 'تعديل أيام العمل';
    document.getElementById('workday-modal-trainer').textContent = 'المدرب: ' + name;
    document.getElementById('workday-result').classList.add('hidden');
    document.getElementById('workday-modal').classList.remove('hidden');

    apiFetch(API_BASE + '/manager/employees/workdays/' + id)
      .then(r => r.json())
      .then(data => {
        const days = data.success ? data.days : [];
        const container = document.getElementById('workday-checkboxes');
        renderDayCheckboxes(container, days);
      })
      .catch(() => {
        const container = document.getElementById('workday-checkboxes');
        renderDayCheckboxes(container, []);
      });
  }

  function closeWorkdayModal() {
    document.getElementById('workday-modal').classList.add('hidden');
    editingWorkdayId = null;
  }

  const workdaySaveBtn = document.getElementById('workday-save-btn');
  if (workdaySaveBtn) {
    workdaySaveBtn.addEventListener('click', async () => {
      if (!editingWorkdayId) return;
      const checks = document.querySelectorAll('#workday-checkboxes input[type="checkbox"]:checked');
      const days = Array.from(checks).map(c => parseInt(c.value, 10));
      const resultDiv = document.getElementById('workday-result');
      resultDiv.classList.add('hidden');
      try {
        const res = await apiFetch(API_BASE + '/manager/employees/workdays', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ employee_id: editingWorkdayId, days })
        });
        const data = await res.json();
        if (data.success) {
          resultDiv.className = 'mt-3 p-3 rounded-lg bg-emerald-950/60 border border-emerald-800/40 text-emerald-200 text-sm';
          resultDiv.textContent = 'تم الحفظ';
          resultDiv.classList.remove('hidden');
          const displayEl = document.getElementById('wd-display-' + editingWorkdayId);
          if (displayEl) displayEl.textContent = days.length > 0 ? days.sort().map(d => DAY_NAMES[d]).join(' - ') : '—';
          closeWorkdayModal();
        } else {
          resultDiv.className = 'mt-3 p-3 rounded-lg bg-rose-950/60 border border-rose-800/40 text-rose-200 text-sm';
          resultDiv.textContent = data.message;
          resultDiv.classList.remove('hidden');
        }
      } catch (_) {
        resultDiv.className = 'mt-3 p-3 rounded-lg bg-rose-950/60 border border-rose-800/40 text-rose-200 text-sm';
        resultDiv.textContent = 'تعذر الاتصال بالخادم';
        resultDiv.classList.remove('hidden');
      }
    });
  }

  const workdayCancelBtn = document.getElementById('workday-cancel-btn');
  if (workdayCancelBtn) {
    workdayCancelBtn.addEventListener('click', closeWorkdayModal);
  }

  const workdayModal = document.getElementById('workday-modal');
  if (workdayModal) {
    workdayModal.addEventListener('click', (e) => {
      if (e.target === workdayModal) closeWorkdayModal();
    });
  }

  const refreshWorkdaysMgrBtn = document.getElementById('refresh-workdays-mgr-btn');
  if (refreshWorkdaysMgrBtn) {
    refreshWorkdaysMgrBtn.addEventListener('click', loadWorkdaysManager);
  }

  // Load workdays on relevant tab switches
  const origSwitchTab = switchTab;
  switchTab = function(tabId) {
    origSwitchTab(tabId);
    if (tabId === 'manager-staff') {
      loadWorkdaysManager();
    }
    if (tabId === 'employee-scanner') {
      loadWorkdaysReception();
    }
  };

  if (paymentModal) {
    paymentModal.addEventListener('click', (e) => {
      if (e.target === paymentModal) closePaymentModal();
    });
  }

  if (paymentForm) {
    paymentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const member_id = paymentMemberId.value;
      const plan_id = paymentPlanSelect.value;
      const amount = paymentAmount.value;
      const methodEl = document.querySelector('input[name="payment-method"]:checked');
      const method = methodEl ? methodEl.value : 'cash';

      if (!member_id || !plan_id || !amount) {
        if (paymentResult) {
          paymentResult.className = 'mt-3 p-3 rounded-lg bg-rose-950/60 border border-rose-800/40 text-rose-200 text-sm';
          paymentResult.textContent = 'يرجى اختيار الباقة';
          paymentResult.classList.remove('hidden');
        }
        return;
      }

      if (paymentSubmitBtn) paymentSubmitBtn.disabled = true;
      if (paymentResult) paymentResult.classList.add('hidden');

      try {
        let data;
        if (window.api && window.api.processMembershipPayment) {
          data = await window.api.processMembershipPayment({ member_id, plan_id: parseInt(plan_id, 10), amount: parseFloat(amount), method });
        } else {
          const res = await apiFetch(API_BASE + '/payments/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ member_id, plan_id: parseInt(plan_id, 10), amount: parseFloat(amount), method })
          });
          data = await res.json();
        }

        if (data.success) {
          if (paymentResult) {
            paymentResult.className = 'mt-3 p-3 rounded-lg bg-emerald-950/60 border border-emerald-800/40 text-emerald-200 text-sm';
            paymentResult.textContent = data.message;
            paymentResult.classList.remove('hidden');
          }
          if (paymentSuccessAnim) {
            paymentSuccessAnim.classList.remove('hidden');
            setTimeout(() => paymentSuccessAnim.classList.add('hidden'), 1500);
          }
          setTimeout(() => {
            closePaymentModal();
            loadMembersLists();
          }, 1800);
        } else {
          if (paymentResult) {
            if (data.code === 'SUBSCRIPTION_STILL_ACTIVE') {
              paymentResult.className = 'mt-3 p-3 rounded-lg bg-amber-950/60 border border-amber-700/40 text-amber-200 text-sm';
            } else {
              paymentResult.className = 'mt-3 p-3 rounded-lg bg-rose-950/60 border border-rose-800/40 text-rose-200 text-sm';
            }
            paymentResult.textContent = data.message || 'فشلت عملية الدفع';
            paymentResult.classList.remove('hidden');
          }
        }
      } catch (err) {
        console.error('Payment error:', err);
        if (paymentResult) {
          paymentResult.className = 'mt-3 p-3 rounded-lg bg-rose-950/60 border border-rose-800/40 text-rose-200 text-sm';
          paymentResult.textContent = 'تعذر الاتصال بالخادم';
          paymentResult.classList.remove('hidden');
        }
      } finally {
        if (paymentSubmitBtn) paymentSubmitBtn.disabled = false;
      }
    });
  }
});
