/* ── Project Saver — Frontend App ─────────────────────────── */
'use strict';

// ── State ────────────────────────────────────────────────
const state = {
  token: localStorage.getItem('ps_token') || null,
  user: JSON.parse(localStorage.getItem('ps_user') || 'null'),
  page: 'dashboard',
};

// ── API helper ───────────────────────────────────────────
async function api(path, opts = {}) {
  const url = '/api' + path;
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;

  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401) {
    logout();
    throw new Error('Session expired');
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── Auth ─────────────────────────────────────────────────
function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('ps_token');
  localStorage.removeItem('ps_user');
  showLogin();
}

function showLogin() {
  document.getElementById('login-page').style.display = '';
  document.getElementById('app-shell').style.display = 'none';
}

function showApp() {
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('app-shell').style.display = '';
  if (state.user) {
    document.getElementById('user-name').textContent = state.user.name || state.user.email;
    document.getElementById('user-avatar').textContent = (state.user.name || state.user.email)[0].toUpperCase();
  }
  navigate(location.hash.slice(1) || 'dashboard');
}

// Login form
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Signing in…';

  try {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const data = await api('/login', { method: 'POST', body: { email, password } });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('ps_token', data.token);
    localStorage.setItem('ps_user', JSON.stringify(data.user));
    showApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
});

document.getElementById('logout-btn').addEventListener('click', (e) => {
  e.preventDefault();
  logout();
});

// ── Navigation ───────────────────────────────────────────
const pages = {};

function navigate(page) {
  page = page || 'dashboard';
  state.page = page;
  location.hash = page;

  // Update sidebar
  document.querySelectorAll('.sidebar nav a').forEach(a => {
    a.classList.toggle('active', a.dataset.page === page);
  });

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');

  // Render page
  const main = document.getElementById('main-content');
  if (pages[page]) {
    pages[page](main);
  } else {
    main.innerHTML = '<div class="empty-state"><div class="empty-icon">🚧</div><p>Page not found</p></div>';
  }
}

// Sidebar nav clicks
document.querySelectorAll('.sidebar nav a').forEach(a => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    navigate(a.dataset.page);
  });
});

// Hamburger
document.getElementById('hamburger-btn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
});
document.getElementById('sidebar-overlay').addEventListener('click', () => {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
});

// ── Toast ────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span> ${esc(msg)}`;
  container.appendChild(el);
  setTimeout(() => { el.remove(); }, 4000);
}

// ── Helpers ──────────────────────────────────────────────
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function fmtBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
  return (b / 1073741824).toFixed(1) + ' GB';
}

function fmtMs(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h%24}h`;
  if (h > 0) return `${h}h ${m%60}m`;
  return `${m}m ${s%60}s`;
}

function statusBadge(status) {
  const s = (status || '').toLowerCase();
  if (s === 'online' || s === 'running' || s === 'up') return `<span class="badge badge-green">${esc(status)}</span>`;
  if (s === 'stopped' || s === 'exited' || s === 'errored') return `<span class="badge badge-red">${esc(status)}</span>`;
  if (s === 'launching' || s === 'restarting' || s === 'created') return `<span class="badge badge-yellow">${esc(status)}</span>`;
  return `<span class="badge badge-blue">${esc(status || 'unknown')}</span>`;
}

function progressBar(pct, color) {
  if (!color) {
    color = pct < 60 ? 'green' : pct < 85 ? 'yellow' : 'red';
  }
  return `<div class="progress-bar"><div class="progress-fill ${color}" style="width:${Math.min(pct,100)}%"></div></div>`;
}

// ── Page: Dashboard ──────────────────────────────────────
pages.dashboard = async (el) => {
  el.innerHTML = `
    <div class="page-header">
      <h2>Dashboard</h2>
      <div class="breadcrumb">Server overview at a glance</div>
    </div>
    <div class="stats-grid" id="dash-stats">
      <div class="stat-card"><div class="loading-full"><div class="spinner"></div></div></div>
    </div>
    <div class="card" id="dash-services-card" style="margin-bottom:1rem">
      <div class="card-title">PM2 Services</div>
      <div class="loading-full"><div class="spinner"></div></div>
    </div>
    <div class="card" id="dash-containers-card">
      <div class="card-title">Docker Containers</div>
      <div class="loading-full"><div class="spinner"></div></div>
    </div>
  `;

  // Load data in parallel
  const [sysData, svcData, ctrData] = await Promise.allSettled([
    api('/system'),
    api('/services'),
    api('/containers'),
  ]);

  // System stats
  if (sysData.status === 'fulfilled') {
    const s = sysData.value;
    document.getElementById('dash-stats').innerHTML = `
      <div class="stat-card">
        <div class="stat-label">CPU</div>
        <div class="stat-value">${s.cpuCount} cores</div>
        <div class="stat-sub">Load: ${s.loadAvg.map(l => l.toFixed(2)).join(', ')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Memory</div>
        <div class="stat-value">${s.memoryPercent}%</div>
        <div class="stat-sub">${fmtBytes(s.usedMemory)} / ${fmtBytes(s.totalMemory)}</div>
        ${progressBar(s.memoryPercent)}
      </div>
      <div class="stat-card">
        <div class="stat-label">Disk</div>
        <div class="stat-value">${s.disk.percent}%</div>
        <div class="stat-sub">${fmtBytes(s.disk.used)} / ${fmtBytes(s.disk.total)}</div>
        ${progressBar(s.disk.percent)}
      </div>
      <div class="stat-card">
        <div class="stat-label">Uptime</div>
        <div class="stat-value">${s.uptimeFormatted}</div>
        <div class="stat-sub">${s.hostname} • ${s.platform}</div>
      </div>
    `;
  }

  // Services
  const svcCard = document.getElementById('dash-services-card');
  if (svcData.status === 'fulfilled') {
    const svcs = svcData.value.services || [];
    if (svcs.length === 0) {
      svcCard.innerHTML = '<div class="card-title">PM2 Services</div><div class="empty-state">No PM2 services found</div>';
    } else {
      svcCard.innerHTML = `
        <div class="card-title">PM2 Services</div>
        <div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Status</th><th>CPU</th><th>Memory</th><th>Uptime</th></tr></thead>
          <tbody>${svcs.map(s => `
            <tr>
              <td><strong>${esc(s.name)}</strong></td>
              <td>${statusBadge(s.status)}</td>
              <td>${s.cpu}%</td>
              <td>${fmtBytes(s.memory)}</td>
              <td>${fmtMs(s.uptime)}</td>
            </tr>
          `).join('')}</tbody>
        </table></div>
      `;
    }
  } else {
    svcCard.innerHTML = '<div class="card-title">PM2 Services</div><div class="empty-state">Failed to load services</div>';
  }

  // Containers
  const ctrCard = document.getElementById('dash-containers-card');
  if (ctrData.status === 'fulfilled') {
    const ctrs = ctrData.value.containers || [];
    if (ctrs.length === 0) {
      ctrCard.innerHTML = '<div class="card-title">Docker Containers</div><div class="empty-state">No Docker containers found</div>';
    } else {
      ctrCard.innerHTML = `
        <div class="card-title">Docker Containers</div>
        <div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Image</th><th>Status</th><th>Ports</th></tr></thead>
          <tbody>${ctrs.map(c => `
            <tr>
              <td><strong>${esc(c.name)}</strong></td>
              <td>${esc(c.image)}</td>
              <td>${statusBadge(c.state)}</td>
              <td style="font-size:.8rem">${esc(c.ports || '-')}</td>
            </tr>
          `).join('')}</tbody>
        </table></div>
      `;
    }
  } else {
    ctrCard.innerHTML = '<div class="card-title">Docker Containers</div><div class="empty-state">Docker not available</div>';
  }
};

// ── Page: Containers ─────────────────────────────────────
pages.containers = async (el) => {
  el.innerHTML = `
    <div class="page-header">
      <h2>Docker Containers</h2>
      <div class="breadcrumb">Manage Docker containers on this server</div>
    </div>
    <div class="card" id="containers-list">
      <div class="loading-full"><div class="spinner"></div></div>
    </div>
    <div id="container-logs-section" style="display:none">
      <div class="card">
        <div class="card-title" id="container-logs-title">Logs</div>
        <div class="log-view" id="container-logs-view"></div>
      </div>
    </div>
  `;

  await loadContainers();
};

async function loadContainers() {
  const wrap = document.getElementById('containers-list');
  try {
    const data = await api('/containers');
    const ctrs = data.containers || [];

    if (ctrs.length === 0) {
      wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">🐳</div><p>No Docker containers found</p><p style="font-size:.85rem;margin-top:.5rem">Docker may not be installed or running</p></div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Image</th><th>Status</th><th>Ports</th><th>Actions</th></tr></thead>
        <tbody>${ctrs.map(c => `
          <tr>
            <td><strong>${esc(c.name)}</strong></td>
            <td style="font-size:.82rem">${esc(c.image)}</td>
            <td>${statusBadge(c.state)}</td>
            <td style="font-size:.78rem">${esc(c.ports || '-')}</td>
            <td>
              <div class="btn-group">
                ${c.state === 'running'
                  ? `<button class="btn btn-sm" onclick="containerAction('${esc(c.id)}','stop')">⏹ Stop</button>
                     <button class="btn btn-sm" onclick="containerAction('${esc(c.id)}','restart')">🔄 Restart</button>`
                  : `<button class="btn btn-sm btn-success" onclick="containerAction('${esc(c.id)}','start')">▶ Start</button>`
                }
                <button class="btn btn-sm" onclick="containerLogs('${esc(c.id)}','${esc(c.name)}')">📋 Logs</button>
              </div>
            </td>
          </tr>
        `).join('')}</tbody>
      </table></div>
    `;
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><p>${esc(err.message)}</p></div>`;
  }
}

window.containerAction = async function(id, action) {
  try {
    toast(`${action}ing container…`, 'info');
    await api(`/containers/${id}/${action}`, { method: 'POST' });
    toast(`Container ${action}ed`, 'success');
    setTimeout(loadContainers, 1500);
  } catch (err) {
    toast(err.message, 'error');
  }
};

window.containerLogs = async function(id, name) {
  const section = document.getElementById('container-logs-section');
  const title = document.getElementById('container-logs-title');
  const view = document.getElementById('container-logs-view');
  section.style.display = '';
  title.textContent = `Logs — ${name}`;
  view.textContent = 'Loading…';

  try {
    const data = await api(`/containers/${id}/logs?tail=100`);
    view.textContent = data.logs || '(empty)';
    view.scrollTop = view.scrollHeight;
  } catch (err) {
    view.textContent = 'Error: ' + err.message;
  }
};

// ── Page: Services ───────────────────────────────────────
pages.services = async (el) => {
  el.innerHTML = `
    <div class="page-header">
      <h2>PM2 Services</h2>
      <div class="breadcrumb">Manage PM2 processes</div>
    </div>
    <div class="card" id="services-list">
      <div class="loading-full"><div class="spinner"></div></div>
    </div>
    <div id="service-logs-section" style="display:none">
      <div class="card">
        <div class="card-title" id="service-logs-title">Logs</div>
        <div class="log-view" id="service-logs-view"></div>
      </div>
    </div>
  `;

  await loadServices();
};

async function loadServices() {
  const wrap = document.getElementById('services-list');
  try {
    const data = await api('/services');
    const svcs = data.services || [];

    if (svcs.length === 0) {
      wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">⚙️</div><p>No PM2 services found</p></div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>PID</th><th>Status</th><th>CPU</th><th>Memory</th><th>Restarts</th><th>Uptime</th><th>Actions</th></tr></thead>
        <tbody>${svcs.map(s => `
          <tr>
            <td><strong>${esc(s.name)}</strong></td>
            <td>${s.pid}</td>
            <td>${statusBadge(s.status)}</td>
            <td>${s.cpu}%</td>
            <td>${fmtBytes(s.memory)}</td>
            <td>${s.restarts}</td>
            <td>${fmtMs(s.uptime)}</td>
            <td>
              <div class="btn-group">
                ${s.status === 'online'
                  ? `<button class="btn btn-sm" onclick="serviceAction('${esc(s.name)}','restart')">🔄</button>
                     <button class="btn btn-sm btn-danger" onclick="serviceAction('${esc(s.name)}','stop')">⏹</button>`
                  : `<button class="btn btn-sm btn-success" onclick="serviceAction('${esc(s.name)}','start')">▶</button>`
                }
                <button class="btn btn-sm" onclick="serviceLogs('${esc(s.name)}')">📋</button>
              </div>
            </td>
          </tr>
        `).join('')}</tbody>
      </table></div>
    `;
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><p>${esc(err.message)}</p></div>`;
  }
}

window.serviceAction = async function(name, action) {
  try {
    toast(`${action}ing ${name}…`, 'info');
    await api(`/services/${name}/${action}`, { method: 'POST' });
    toast(`${name} ${action}ed`, 'success');
    setTimeout(loadServices, 1500);
  } catch (err) {
    toast(err.message, 'error');
  }
};

window.serviceLogs = async function(name) {
  const section = document.getElementById('service-logs-section');
  const title = document.getElementById('service-logs-title');
  const view = document.getElementById('service-logs-view');
  section.style.display = '';
  title.textContent = `Logs — ${name}`;
  view.textContent = 'Loading…';

  try {
    const data = await api(`/services/${name}/logs?lines=80`);
    view.textContent = data.logs || '(empty)';
    view.scrollTop = view.scrollHeight;
  } catch (err) {
    view.textContent = 'Error: ' + err.message;
  }
};

// ── Page: Nexus ──────────────────────────────────────────
pages.nexus = async (el) => {
  el.innerHTML = `
    <div class="page-header">
      <h2>Nexus Controls</h2>
      <div class="breadcrumb">Manage the Nexus application</div>
    </div>
    <div class="stats-grid" id="nexus-stats">
      <div class="stat-card"><div class="loading-full"><div class="spinner"></div></div></div>
    </div>
    <div class="card" style="margin-bottom:1rem">
      <div class="card-title">Quick Actions</div>
      <div class="btn-group">
        <button class="btn btn-accent" onclick="nexusAction('deploy')">🚀 Full Deploy</button>
        <button class="btn" onclick="nexusAction('pull')">📥 Git Pull</button>
        <button class="btn" onclick="nexusAction('install')">📦 NPM Install</button>
        <button class="btn" onclick="nexusAction('build')">🔨 Build Frontend</button>
        <button class="btn" onclick="nexusAction('restart')">🔄 Restart PM2</button>
        <button class="btn" onclick="nexusAction('migrate')">🗄️ Run Migrations</button>
      </div>
    </div>
    <div id="nexus-pipeline" style="display:none" class="card">
      <div class="card-title">Deploy Progress</div>
      <div id="nexus-pipeline-steps" class="pipeline-steps"></div>
    </div>
    <div id="nexus-output" style="display:none" class="card">
      <div class="card-title">Output</div>
      <div class="log-view" id="nexus-output-view"></div>
    </div>
    <div class="card" id="nexus-db-card" style="display:none">
      <div class="card-title">Database Stats</div>
      <div id="nexus-db-content"></div>
    </div>
    <div style="margin-top:.8rem">
      <button class="btn" onclick="loadNexusDB()">📊 Load DB Stats</button>
    </div>
  `;

  // Load status
  try {
    const data = await api('/nexus/status');
    document.getElementById('nexus-stats').innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Branch</div>
        <div class="stat-value" style="font-size:1.1rem">${esc(data.branch)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Health</div>
        <div class="stat-value" style="font-size:1rem">${data.healthCheck === 'unreachable' ? '🔴 Unreachable' : '🟢 OK'}</div>
      </div>
      <div class="stat-card" style="grid-column: span 2">
        <div class="stat-label">Recent Commits</div>
        <div style="font-family:monospace;font-size:.82rem;line-height:1.6">${data.recentCommits.map(c => esc(c)).join('<br>')}</div>
      </div>
      ${data.gitStatus ? `<div class="stat-card" style="grid-column: span 2">
        <div class="stat-label">Uncommitted Changes</div>
        <div style="font-family:monospace;font-size:.82rem;white-space:pre-wrap">${esc(data.gitStatus)}</div>
      </div>` : ''}
    `;
  } catch {
    document.getElementById('nexus-stats').innerHTML = '<div class="stat-card"><div class="empty-state">Failed to load Nexus status</div></div>';
  }
};

window.nexusAction = async function(action) {
  const outputSection = document.getElementById('nexus-output');
  const outputView = document.getElementById('nexus-output-view');
  const pipelineSection = document.getElementById('nexus-pipeline');

  if (action === 'deploy') {
    // Full deploy pipeline
    pipelineSection.style.display = '';
    const stepNames = ['pull', 'install', 'migrate', 'build', 'restart'];
    document.getElementById('nexus-pipeline-steps').innerHTML = stepNames.map((s, i) =>
      `<div class="pipeline-step step-pending" id="pipe-${s}">
        <div class="step-icon">${i + 1}</div>
        <span>${s.charAt(0).toUpperCase() + s.slice(1)}</span>
        <span style="margin-left:auto;font-size:.8rem;color:var(--text2)" id="pipe-${s}-status">Pending</span>
      </div>`
    ).join('');

    // Mark all as running initially
    document.getElementById('pipe-pull').className = 'pipeline-step step-running';
    document.getElementById('pipe-pull-status').textContent = 'Running…';

    try {
      toast('Starting full deploy…', 'info');
      const data = await api('/nexus/deploy', { method: 'POST' });

      // Update step statuses
      for (const step of data.steps) {
        const stepEl = document.getElementById(`pipe-${step.step}`);
        const statusEl = document.getElementById(`pipe-${step.step}-status`);
        if (stepEl && statusEl) {
          stepEl.className = `pipeline-step ${step.ok ? 'step-done' : 'step-failed'}`;
          statusEl.textContent = step.ok ? 'Done' : 'Failed';
        }
        // Mark next step as running
        const idx = stepNames.indexOf(step.step);
        if (step.ok && idx < stepNames.length - 1) {
          const nextEl = document.getElementById(`pipe-${stepNames[idx + 1]}`);
          const nextStatus = document.getElementById(`pipe-${stepNames[idx + 1]}-status`);
          if (nextEl) nextEl.className = 'pipeline-step step-running';
          if (nextStatus) nextStatus.textContent = 'Running…';
        }
      }

      // Show output
      outputSection.style.display = '';
      outputView.textContent = data.steps.map(s => `── ${s.step} ──\n${s.output}`).join('\n\n');
      outputView.scrollTop = outputView.scrollHeight;

      toast(data.ok ? 'Deploy complete!' : 'Deploy failed at some step', data.ok ? 'success' : 'error');
    } catch (err) {
      toast('Deploy error: ' + err.message, 'error');
    }
    return;
  }

  // Single action
  outputSection.style.display = '';
  outputView.textContent = `Running ${action}…`;
  pipelineSection.style.display = 'none';

  try {
    toast(`Running ${action}…`, 'info');
    const data = await api(`/nexus/${action}`, { method: 'POST' });
    outputView.textContent = data.output || JSON.stringify(data, null, 2);
    outputView.scrollTop = outputView.scrollHeight;
    toast(data.ok ? `${action} succeeded` : `${action} failed`, data.ok ? 'success' : 'error');
  } catch (err) {
    outputView.textContent = 'Error: ' + err.message;
    toast(err.message, 'error');
  }
};

window.loadNexusDB = async function() {
  const card = document.getElementById('nexus-db-card');
  const content = document.getElementById('nexus-db-content');
  card.style.display = '';
  content.innerHTML = '<div class="loading-full"><div class="spinner"></div></div>';

  try {
    const data = await api('/nexus/db-stats');
    let html = `<div class="table-wrap"><table>
      <thead><tr><th>Table</th><th>Rows</th></tr></thead>
      <tbody>`;
    for (const [name, count] of Object.entries(data.tables || {})) {
      html += `<tr><td>${esc(name)}</td><td>${count}</td></tr>`;
    }
    html += '</tbody></table></div>';

    if (data.users && data.users.length) {
      html += '<div class="card-title" style="margin-top:1rem">Recent Users</div>';
      html += '<div class="table-wrap"><table><thead><tr><th>ID</th><th>Email</th><th>Name</th><th>Created</th></tr></thead><tbody>';
      for (const u of data.users) {
        html += `<tr><td>${u.id}</td><td>${esc(u.email)}</td><td>${esc(u.name || '-')}</td><td style="font-size:.82rem">${esc(u.created_at || '')}</td></tr>`;
      }
      html += '</tbody></table></div>';
    }

    content.innerHTML = html;
  } catch (err) {
    content.innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
  }
};


// ── Page: VS Code (workspace view + chat) ───────────────
let chatWs = null;
let chatWsReconnect = null;
let chatStreamingId = null;
let chatStreamingText = '';
let chatIncludeContext = true;
let vscodeTab = 'workspace';

pages.vscode = async (el) => {
  if (chatWs) { try { chatWs.close(); } catch {} chatWs = null; }
  if (chatWsReconnect) { clearTimeout(chatWsReconnect); chatWsReconnect = null; }

  el.innerHTML = `
    <div class="vsc-page">
      <div class="vsc-topbar">
        <div class="vsc-topbar-left">
          <div class="chat-status-dot" id="chat-ext-dot" title="Extension status"></div>
          <div class="vsc-topbar-info">
            <div class="vsc-topbar-title" id="chat-title">VS Code</div>
            <div class="vsc-topbar-sub" id="chat-subtitle">Connecting\u2026</div>
          </div>
        </div>
        <div class="vsc-tabs">
          <button class="vsc-tab active" id="vsc-tab-workspace" onclick="switchVscTab('workspace')">\uD83D\uDCC2 Workspace</button>
          <button class="vsc-tab" id="vsc-tab-chat" onclick="switchVscTab('chat')">\uD83D\uDCAC Chat</button>
        </div>
      </div>

      <!-- Workspace Panel -->
      <div class="vsc-panel" id="vsc-panel-workspace">
        <div class="ws-info" id="ws-info">
          <div class="ws-empty" id="ws-empty">
            <div style="font-size:2rem;margin-bottom:.5rem">\u23F3</div>
            <p>Waiting for VS Code\u2026</p>
            <p class="ws-empty-sub">Install the Project Saver extension and connect</p>
          </div>
        </div>
      </div>

      <!-- Chat Panel -->
      <div class="vsc-panel vsc-panel-chat" id="vsc-panel-chat" style="display:none">
        <div class="vsc-chat-actions">
          <button class="btn btn-sm" id="chat-ctx-toggle" onclick="toggleChatContext()">\uD83D\uDCCE Context</button>
          <div class="chat-workspace-badge" id="chat-workspace-badge"></div>
          <button class="btn btn-sm btn-danger" onclick="clearChatHistory()" style="margin-left:auto">\uD83D\uDDD1\uFE0F</button>
        </div>
        <div class="chat-messages" id="chat-messages">
          <div class="chat-empty" id="chat-empty">
            <div style="font-size:2rem;margin-bottom:.4rem">\uD83D\uDCAC</div>
            <p>Chat with Copilot</p>
            <p class="chat-empty-sub">Type below to talk to the AI agent in VS Code</p>
          </div>
        </div>
        <div class="chat-input-bar">
          <div class="chat-input-row">
            <textarea id="chat-input" placeholder="Ask Copilot anything\u2026" rows="1" autocomplete="off"></textarea>
            <button class="chat-send-btn" id="chat-send-btn" onclick="sendChatMessage()" disabled>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  const textarea = document.getElementById('chat-input');
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    document.getElementById('chat-send-btn').disabled = !textarea.value.trim();
  });
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (textarea.value.trim()) sendChatMessage(); }
  });

  connectChatWs();
};

window.switchVscTab = function(tab) {
  vscodeTab = tab;
  document.getElementById('vsc-panel-workspace').style.display = tab === 'workspace' ? '' : 'none';
  document.getElementById('vsc-panel-chat').style.display = tab === 'chat' ? '' : 'none';
  document.getElementById('vsc-tab-workspace').classList.toggle('active', tab === 'workspace');
  document.getElementById('vsc-tab-chat').classList.toggle('active', tab === 'chat');
  if (tab === 'chat') {
    const msgs = document.getElementById('chat-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
    const input = document.getElementById('chat-input');
    if (input) input.focus();
  }
};

window.toggleChatContext = function() {
  chatIncludeContext = !chatIncludeContext;
  const btn = document.getElementById('chat-ctx-toggle');
  if (btn) {
    btn.className = `btn btn-sm ${chatIncludeContext ? '' : 'btn-danger'}`;
    btn.innerHTML = chatIncludeContext ? '\uD83D\uDCCE Context' : '\uD83D\uDCCE No Ctx';
  }
  toast(chatIncludeContext ? 'Context included' : 'Context disabled', 'info');
};

function connectChatWs() {
  if (!state.token) return;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${proto}//${location.host}/ws/chat?token=${encodeURIComponent(state.token)}`;
  chatWs = new WebSocket(wsUrl);
  chatWs.onopen = () => updateChatHeader(null, 'Connected');
  chatWs.onmessage = (e) => { try { handleChatWsMessage(JSON.parse(e.data)); } catch {} };
  chatWs.onclose = () => {
    updateChatHeader(false, 'Reconnecting\u2026');
    if (state.page === 'vscode') chatWsReconnect = setTimeout(connectChatWs, 3000);
  };
  chatWs.onerror = () => {};
}

function handleChatWsMessage(msg) {
  switch (msg.type) {
    case 'init':
      updateExtensionStatus(msg.connected);
      updateWorkspacePanel(msg.workspace);
      updateWorkspaceInfo(msg.workspace);
      renderChatMessages(msg.messages || []);
      break;
    case 'extension-status':
      updateExtensionStatus(msg.connected);
      break;
    case 'workspace-state':
      updateWorkspacePanel(msg.workspace);
      updateWorkspaceInfo(msg.workspace);
      break;
    case 'chat-message':
      appendChatMessage(msg.message);
      if (msg.message.role === 'assistant' && chatStreamingId) {
        const streamEl = document.getElementById('chat-streaming');
        if (streamEl) streamEl.remove();
        chatStreamingId = null; chatStreamingText = '';
        enableChatInput(true);
      }
      if (vscodeTab === 'workspace') {
        const tab = document.getElementById('vsc-tab-chat');
        if (tab) { tab.classList.add('tab-pulse'); setTimeout(() => tab.classList.remove('tab-pulse'), 2000); }
      }
      break;
    case 'chat-stream':
      handleChatStream(msg);
      break;
    case 'chat-clear':
      const mc = document.getElementById('chat-messages');
      if (mc) mc.innerHTML = '<div class="chat-empty" id="chat-empty"><div style="font-size:2rem;margin-bottom:.4rem">\uD83D\uDCAC</div><p>Chat with Copilot</p><p class="chat-empty-sub">Type below to talk to the AI agent in VS Code</p></div>';
      break;
  }
}

function updateExtensionStatus(connected) {
  const dot = document.getElementById('chat-ext-dot');
  if (dot) {
    dot.className = 'chat-status-dot ' + (connected ? 'online' : 'offline');
    dot.title = connected ? 'Extension connected' : 'Extension disconnected';
  }
}

function updateWorkspacePanel(ws) {
  const container = document.getElementById('ws-info');
  if (!container) return;
  if (!ws || !ws.workspace) {
    container.innerHTML = '<div class="ws-empty" id="ws-empty"><div style="font-size:2rem;margin-bottom:.5rem">\u23F3</div><p>Waiting for VS Code\u2026</p><p class="ws-empty-sub">Install the Project Saver extension and connect</p></div>';
    return;
  }

  const fileIcon = (name) => {
    if (!name) return '\uD83D\uDCC4';
    const ext = name.split('.').pop().toLowerCase();
    const icons = { js: '\uD83D\uDFE8', ts: '\uD83D\uDD35', jsx: '\u269B\uFE0F', tsx: '\u269B\uFE0F', json: '\uD83D\uDCCB', md: '\uD83D\uDCD6', css: '\uD83C\uDFA8', html: '\uD83C\uDF10', py: '\uD83D\uDC0D', sh: '\u26A1', yml: '\u2699\uFE0F', yaml: '\u2699\uFE0F' };
    return icons[ext] || '\uD83D\uDCC4';
  };

  const langBadge = ws.activeLanguage ? `<span class="badge badge-blue" style="font-size:.72rem">${esc(ws.activeLanguage)}</span>` : '';
  const dirtyBadge = ws.dirty ? '<span class="badge badge-yellow" style="font-size:.72rem">\u270F\uFE0F Unsaved</span>' : '';
  const lineInfo = ws.activeLine != null ? `<span style="font-size:.78rem;color:var(--text2)">Line ${ws.activeLine + 1}</span>` : '';
  const ago = ws.timestamp ? `<span style="font-size:.72rem;color:var(--text2)">${new Date(ws.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>` : '';

  let openFilesHtml = '';
  if (ws.openFiles && ws.openFiles.length > 0) {
    openFilesHtml = ws.openFiles.map(f => {
      const isActive = f === ws.activeFile;
      return `<div class="ws-file ${isActive ? 'ws-file-active' : ''}">${fileIcon(f)} <span>${esc(f)}</span></div>`;
    }).join('');
  } else {
    openFilesHtml = '<div class="ws-file" style="color:var(--text2)">No files open</div>';
  }

  container.innerHTML = `
    <div class="ws-project-card">
      <div class="ws-project-header">
        <div class="ws-project-icon">\uD83D\uDCC1</div>
        <div class="ws-project-meta">
          <div class="ws-project-name">${esc(ws.workspace)}</div>
          <div class="ws-project-path">${ws.workspacePath ? esc(ws.workspacePath) : ''}</div>
        </div>
        ${ago}
      </div>
    </div>

    ${ws.activeFile ? `
    <div class="ws-section">
      <div class="ws-section-title">\uD83D\uDCDD Active File</div>
      <div class="ws-active-file">
        <div class="ws-active-name">${fileIcon(ws.activeFile)} ${esc(ws.activeFile)}</div>
        <div class="ws-active-meta">${langBadge} ${dirtyBadge} ${lineInfo}</div>
      </div>
    </div>` : ''}

    <div class="ws-section">
      <div class="ws-section-title">\uD83D\uDCC2 Open Tabs <span class="badge" style="font-size:.7rem">${(ws.openFiles || []).length}</span></div>
      <div class="ws-file-list">${openFilesHtml}</div>
    </div>
  `;
}

function updateWorkspaceInfo(ws) {
  if (!ws) return;
  const title = document.getElementById('chat-title');
  const subtitle = document.getElementById('chat-subtitle');
  const badge = document.getElementById('chat-workspace-badge');
  if (title && ws.workspace) title.textContent = ws.workspace || 'VS Code';
  if (subtitle) {
    const parts = [];
    if (ws.activeFile) parts.push(ws.activeFile);
    if (ws.activeLanguage) parts.push(ws.activeLanguage);
    subtitle.textContent = parts.join(' \u2022 ') || 'No file open';
  }
  if (badge && ws.activeFile) badge.innerHTML = '<span class="badge badge-blue" style="font-size:.7rem">\uD83D\uDCC4 ' + esc(ws.activeFile) + '</span>';
}

function updateChatHeader(connected, statusText) {
  const subtitle = document.getElementById('chat-subtitle');
  if (subtitle && statusText) subtitle.textContent = statusText;
  if (connected !== null) updateExtensionStatus(connected);
}

function renderChatMessages(messages) {
  const container = document.getElementById('chat-messages');
  if (!container || messages.length === 0) return;
  const empty = document.getElementById('chat-empty');
  if (empty) empty.style.display = 'none';
  const fragment = document.createDocumentFragment();
  for (const msg of messages) fragment.appendChild(createChatBubble(msg));
  container.appendChild(fragment);
  container.scrollTop = container.scrollHeight;
}

function appendChatMessage(msg) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  const empty = document.getElementById('chat-empty');
  if (empty) empty.style.display = 'none';
  container.appendChild(createChatBubble(msg));
  container.scrollTop = container.scrollHeight;
}

function createChatBubble(msg) {
  const div = document.createElement('div');
  div.className = 'chat-bubble chat-bubble-' + msg.role;
  const label = document.createElement('div');
  label.className = 'chat-bubble-label';
  label.textContent = msg.role === 'user' ? 'You' : 'Copilot';
  const content = document.createElement('div');
  content.className = 'chat-bubble-content';
  if (msg.role === 'assistant') content.innerHTML = renderMarkdown(msg.text || '');
  else content.textContent = msg.text || '';
  const time = document.createElement('div');
  time.className = 'chat-bubble-time';
  time.textContent = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (msg.error) div.classList.add('chat-bubble-error');
  div.appendChild(label);
  div.appendChild(content);
  div.appendChild(time);
  return div;
}

function handleChatStream(msg) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  const empty = document.getElementById('chat-empty');
  if (empty) empty.style.display = 'none';
  chatStreamingId = msg.id;
  chatStreamingText = msg.partial || '';
  let streamEl = document.getElementById('chat-streaming');
  if (!streamEl) {
    streamEl = document.createElement('div');
    streamEl.id = 'chat-streaming';
    streamEl.className = 'chat-bubble chat-bubble-assistant chat-streaming';
    streamEl.innerHTML = '<div class="chat-bubble-label">Copilot</div><div class="chat-bubble-content"></div><div class="chat-typing-indicator"><span></span><span></span><span></span></div>';
    container.appendChild(streamEl);
  }
  const c = streamEl.querySelector('.chat-bubble-content');
  if (c) c.innerHTML = renderMarkdown(chatStreamingText);
  const t = streamEl.querySelector('.chat-typing-indicator');
  if (t && chatStreamingText.length > 0) t.style.display = 'none';
  container.scrollTop = container.scrollHeight;
  if (vscodeTab === 'workspace') switchVscTab('chat');
}

function renderMarkdown(text) {
  if (!text) return '';
  let html = esc(text);
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="chat-code"><code>$2</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/^### (.+)$/gm, '<strong style="font-size:1rem">$1</strong>');
  html = html.replace(/^## (.+)$/gm, '<strong style="font-size:1.05rem">$1</strong>');
  html = html.replace(/^# (.+)$/gm, '<strong style="font-size:1.1rem">$1</strong>');
  html = html.replace(/^- (.+)$/gm, '\u2022 $1');
  html = html.replace(/^\* (.+)$/gm, '\u2022 $1');
  html = html.replace(/\n/g, '<br>');
  return html;
}

function enableChatInput(enabled) {
  const input = document.getElementById('chat-input');
  const btn = document.getElementById('chat-send-btn');
  if (input) { input.disabled = !enabled; if (enabled) input.focus(); }
  if (btn) btn.disabled = !enabled || !(input && input.value.trim());
}

window.sendChatMessage = async function() {
  const input = document.getElementById('chat-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  input.style.height = 'auto';
  enableChatInput(false);
  try {
    await api('/chat/send', { method: 'POST', body: { text, includeContext: chatIncludeContext } });
  } catch (err) {
    toast('Chat error: ' + err.message, 'error');
    enableChatInput(true);
  }
};

window.clearChatHistory = async function() {
  if (!confirm('Clear all chat history?')) return;
  try { await api('/chat/history', { method: 'DELETE' }); toast('Chat cleared', 'success'); }
  catch (err) { toast(err.message, 'error'); }
};

// Clean up when navigating away
const origNavigate = navigate;
navigate = function(page) {
  if (page !== 'vscode') {
    if (chatWs) { try { chatWs.close(); } catch {} chatWs = null; }
    if (chatWsReconnect) { clearTimeout(chatWsReconnect); chatWsReconnect = null; }
  }
  origNavigate(page);
};


pages.settings = async (el) => {
  let sysInfo;
  try {
    sysInfo = await api('/system');
  } catch {
    sysInfo = {};
  }

  let nginxInfo;
  try {
    nginxInfo = await api('/server/nginx');
  } catch {
    nginxInfo = { status: 'unknown', configValid: false };
  }

  el.innerHTML = `
    <div class="page-header">
      <h2>Settings</h2>
      <div class="breadcrumb">Server configuration and info</div>
    </div>

    <div class="card" style="margin-bottom:1rem">
      <div class="card-title">Server Info</div>
      <div class="table-wrap"><table>
        <tr><td style="color:var(--text2)">Hostname</td><td>${esc(sysInfo.hostname || '-')}</td></tr>
        <tr><td style="color:var(--text2)">Platform</td><td>${esc(sysInfo.platform || '-')} / ${esc(sysInfo.arch || '-')}</td></tr>
        <tr><td style="color:var(--text2)">Node.js</td><td>${esc(sysInfo.nodeVersion || '-')}</td></tr>
        <tr><td style="color:var(--text2)">CPU</td><td>${sysInfo.cpuCount || '-'} ├ù ${esc(sysInfo.cpuModel || '-')}</td></tr>
        <tr><td style="color:var(--text2)">Total Memory</td><td>${fmtBytes(sysInfo.totalMemory || 0)}</td></tr>
        <tr><td style="color:var(--text2)">Total Disk</td><td>${fmtBytes(sysInfo.disk?.total || 0)}</td></tr>
      </table></div>
    </div>

    <div class="card" style="margin-bottom:1rem">
      <div class="card-title">Nginx</div>
      <div style="margin-bottom:.6rem">
        Status: ${nginxInfo.status === 'active' ? '<span class="badge badge-green">Active</span>' : `<span class="badge badge-red">${esc(nginxInfo.status)}</span>`}
        &nbsp; Config: ${nginxInfo.configValid ? '<span class="badge badge-green">Valid</span>' : '<span class="badge badge-red">Invalid</span>'}
      </div>
      <button class="btn" onclick="reloadNginx()">≡ƒöä Reload Nginx</button>
    </div>

    <div class="card">
      <div class="card-title">Account</div>
      <div style="margin-bottom:.8rem">${esc(state.user?.email || '')}</div>
      <button class="btn btn-danger" onclick="logout()">Sign Out</button>
    </div>
  `;
};

window.reloadNginx = async function() {
  try {
    toast('Reloading nginxΓÇª', 'info');
    const data = await api('/server/nginx/reload', { method: 'POST' });
    toast(data.ok ? 'Nginx reloaded' : 'Reload failed', data.ok ? 'success' : 'error');
  } catch (err) {
    toast(err.message, 'error');
  }
};

// ΓöÇΓöÇ Boot ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
(function boot() {
  if (state.token) {
    showApp();
  } else {
    showLogin();
  }
})();