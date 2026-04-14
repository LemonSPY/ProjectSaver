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

// ── Page: VS Code ────────────────────────────────────────
let screenInterval = null;

pages.vscode = async (el) => {
  // Clear any previous polling
  if (screenInterval) { clearInterval(screenInterval); screenInterval = null; }

  let meta;
  try { meta = await api('/vscode/screenshot/meta'); } catch { meta = { available: false }; }

  el.innerHTML = `
    <div class="page-header">
      <h2>VS Code — Live View</h2>
      <div class="breadcrumb">Real-time screen capture from your PC</div>
    </div>

    <div class="card" style="margin-bottom:1rem;padding:.6rem">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem">
        <div style="display:flex;align-items:center;gap:.6rem">
          <span id="screen-status" class="badge ${meta.available ? 'badge-green' : 'badge-red'}">${meta.available ? '● LIVE' : '● OFFLINE'}</span>
          <span id="screen-age" style="font-size:.82rem;color:var(--text2)"></span>
        </div>
        <div class="btn-group">
          <button class="btn btn-sm ${meta.available ? 'btn-danger' : 'btn-success'}" id="screen-toggle" onclick="toggleScreenStream()">
            ${meta.available ? '⏸ Pause' : '▶ Start'}
          </button>
          <button class="btn btn-sm" onclick="screenFullscreen()">⛶ Fullscreen</button>
        </div>
      </div>
    </div>

    <div id="screen-container" style="position:relative;background:#1e1e1e;border-radius:var(--radius);overflow:hidden;border:1px solid var(--border)">
      ${meta.available
        ? '<img id="screen-img" style="width:100%;display:block;cursor:zoom-in" onclick="screenFullscreen()">'
        : `<div class="empty-state" id="screen-empty" style="padding:4rem 1rem">
            <div class="empty-icon">🖥️</div>
            <p style="margin-bottom:.5rem">Screen agent not connected</p>
            <p style="font-size:.85rem;color:var(--text2);max-width:400px;margin:0 auto">
              Run the screen agent on your PC to start streaming:<br>
              <code style="background:var(--bg);padding:.2rem .5rem;border-radius:4px;margin-top:.4rem;display:inline-block">node screen-agent.js</code>
            </p>
          </div>`
      }
    </div>

    <div class="card" style="margin-top:1rem">
      <div class="card-title">Screen Agent Setup</div>
      <div style="font-size:.9rem;line-height:1.7;color:var(--text2)">
        <p>The screen agent captures your PC's screen and streams it here. Run it from the ProjectSaver folder:</p>
        <div class="log-view" style="margin:.5rem 0;max-height:80px;font-size:.82rem">cd c:\\VsCodeProjects\\ProjectSaver
node screen-agent.js</div>
        <p style="margin-top:.5rem">Options (environment variables):</p>
        <div class="log-view" style="margin:.5rem 0;max-height:100px;font-size:.82rem">PS_INTERVAL=2000    # ms between captures (default: 2000)
PS_QUALITY=50       # JPEG quality 1-100 (default: 50)
PS_WIDTH=1280       # max width in px (default: 1280)</div>
      </div>
    </div>
  `;

  // Start live polling if available
  if (meta.available) startScreenPolling();
};

let screenStreamActive = true;

function startScreenPolling() {
  if (screenInterval) clearInterval(screenInterval);
  screenStreamActive = true;

  const refresh = async () => {
    const img = document.getElementById('screen-img');
    if (!img || !screenStreamActive || state.page !== 'vscode') {
      clearInterval(screenInterval);
      screenInterval = null;
      return;
    }

    try {
      // Fetch image with auth header
      const res = await fetch('/api/vscode/screenshot?t=' + Date.now(), {
        headers: { 'Authorization': 'Bearer ' + state.token }
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      // Revoke old blob URL to prevent memory leak
      if (img._blobUrl) URL.revokeObjectURL(img._blobUrl);
      img._blobUrl = url;
      img.src = url;

      // Update age indicator from headers
      const age = parseInt(res.headers.get('X-Screenshot-Age') || '0');
      const size = blob.size;
      const ageEl = document.getElementById('screen-age');
      const statusEl = document.getElementById('screen-status');
      if (ageEl) {
        const sec = (age / 1000).toFixed(0);
        ageEl.textContent = `${(size / 1024).toFixed(0)} KB • ${sec}s ago`;
      }
      if (statusEl) {
        statusEl.className = 'badge ' + (age < 10000 ? 'badge-green' : 'badge-yellow');
        statusEl.textContent = age < 10000 ? '● LIVE' : '● STALE';
      }
    } catch { /* ignore fetch errors */ }
  };

  refresh();
  screenInterval = setInterval(refresh, 2500);
}

window.toggleScreenStream = function() {
  screenStreamActive = !screenStreamActive;
  const btn = document.getElementById('screen-toggle');
  if (btn) {
    btn.className = `btn btn-sm ${screenStreamActive ? 'btn-danger' : 'btn-success'}`;
    btn.innerHTML = screenStreamActive ? '⏸ Pause' : '▶ Resume';
  }
  if (screenStreamActive) startScreenPolling();
};

window.screenFullscreen = function() {
  const container = document.getElementById('screen-container');
  if (!container) return;
  if (container.requestFullscreen) container.requestFullscreen();
  else if (container.webkitRequestFullscreen) container.webkitRequestFullscreen();
};

// Clean up polling when navigating away
const origNavigate = navigate;
navigate = function(page) {
  if (page !== 'vscode' && screenInterval) {
    clearInterval(screenInterval);
    screenInterval = null;
  }
  // Clean up chat WS when leaving chat
  if (page !== 'chat') {
    if (chatWs) { try { chatWs.close(); } catch {} chatWs = null; }
    if (chatWsReconnect) { clearTimeout(chatWsReconnect); chatWsReconnect = null; }
  }
  origNavigate(page);
};

window.saveVSCodeSettings = async function() {
  try {
    const tunnelUrl = document.getElementById('vscode-tunnel-url')?.value.trim() || '';
    const machineName = document.getElementById('vscode-machine-name')?.value.trim() || '';
    await api('/vscode/settings', { method: 'PUT', body: { tunnelUrl, machineName } });
    toast('VS Code settings saved', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
};

// ── Page: Chat ───────────────────────────────────────────
let chatWs = null;
let chatWsReconnect = null;
let chatStreamingId = null;
let chatStreamingText = '';
let chatIncludeContext = true;

pages.chat = async (el) => {
  // Disconnect previous WS
  if (chatWs) { try { chatWs.close(); } catch {} chatWs = null; }
  if (chatWsReconnect) { clearTimeout(chatWsReconnect); chatWsReconnect = null; }

  el.innerHTML = `
    <div class="chat-page">
      <div class="chat-header" id="chat-header">
        <div class="chat-header-left">
          <div class="chat-status-dot" id="chat-ext-dot"></div>
          <div>
            <div class="chat-title" id="chat-title">Copilot Chat</div>
            <div class="chat-subtitle" id="chat-subtitle">Connecting…</div>
          </div>
        </div>
        <div class="chat-header-right">
          <button class="btn btn-sm" id="chat-ctx-toggle" onclick="toggleChatContext()" title="Include workspace context">📎 Context</button>
          <button class="btn btn-sm btn-danger" onclick="clearChatHistory()" title="Clear history">🗑️</button>
        </div>
      </div>

      <div class="chat-messages" id="chat-messages">
        <div class="chat-empty" id="chat-empty">
          <div style="font-size:2.5rem;margin-bottom:.6rem">💬</div>
          <p>Chat with Copilot through VS Code</p>
          <p class="chat-empty-sub">Messages are sent to Copilot via your VS Code extension bridge</p>
        </div>
      </div>

      <div class="chat-input-bar" id="chat-input-bar">
        <div class="chat-workspace-badge" id="chat-workspace-badge" style="display:none"></div>
        <div class="chat-input-row">
          <textarea id="chat-input" placeholder="Ask Copilot anything…" rows="1"
            autocomplete="off" autocorrect="on" spellcheck="true"></textarea>
          <button class="chat-send-btn" id="chat-send-btn" onclick="sendChatMessage()" disabled>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;

  // Auto-resize textarea
  const textarea = document.getElementById('chat-input');
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    document.getElementById('chat-send-btn').disabled = !textarea.value.trim();
  });
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (textarea.value.trim()) sendChatMessage();
    }
  });

  // Connect WebSocket
  connectChatWs();
};

window.toggleChatContext = function() {
  chatIncludeContext = !chatIncludeContext;
  const btn = document.getElementById('chat-ctx-toggle');
  if (btn) {
    btn.className = `btn btn-sm ${chatIncludeContext ? '' : 'btn-danger'}`;
    btn.innerHTML = chatIncludeContext ? '📎 Context' : '📎 No Context';
  }
  toast(chatIncludeContext ? 'Workspace context included' : 'Context disabled', 'info');
};

function connectChatWs() {
  if (!state.token) return;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${proto}//${location.host}/ws/chat?token=${encodeURIComponent(state.token)}`;

  chatWs = new WebSocket(wsUrl);

  chatWs.onopen = () => {
    updateChatHeader(null, 'Connected');
  };

  chatWs.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      handleChatWsMessage(msg);
    } catch {}
  };

  chatWs.onclose = () => {
    updateChatHeader(false, 'Reconnecting…');
    if (state.page === 'chat') {
      chatWsReconnect = setTimeout(connectChatWs, 3000);
    }
  };

  chatWs.onerror = () => {};
}

function handleChatWsMessage(msg) {
  switch (msg.type) {
    case 'init':
      updateExtensionStatus(msg.connected);
      updateWorkspaceInfo(msg.workspace);
      renderChatMessages(msg.messages || []);
      break;

    case 'extension-status':
      updateExtensionStatus(msg.connected);
      break;

    case 'workspace-state':
      updateWorkspaceInfo(msg.workspace);
      break;

    case 'chat-message':
      appendChatMessage(msg.message);
      // If we were streaming this ID, stop
      if (msg.message.role === 'assistant' && chatStreamingId) {
        const streamEl = document.getElementById('chat-streaming');
        if (streamEl) streamEl.remove();
        chatStreamingId = null;
        chatStreamingText = '';
        enableChatInput(true);
      }
      break;

    case 'chat-stream':
      handleChatStream(msg);
      break;

    case 'chat-clear':
      const msgContainer = document.getElementById('chat-messages');
      if (msgContainer) {
        msgContainer.innerHTML = `
          <div class="chat-empty" id="chat-empty">
            <div style="font-size:2.5rem;margin-bottom:.6rem">💬</div>
            <p>Chat with Copilot through VS Code</p>
            <p class="chat-empty-sub">Messages are sent to Copilot via your VS Code extension bridge</p>
          </div>`;
      }
      break;
  }
}

function updateExtensionStatus(connected) {
  const dot = document.getElementById('chat-ext-dot');
  if (dot) {
    dot.className = 'chat-status-dot ' + (connected ? 'online' : 'offline');
    dot.title = connected ? 'VS Code extension connected' : 'VS Code extension disconnected';
  }
}

function updateWorkspaceInfo(ws) {
  if (!ws) return;
  const title = document.getElementById('chat-title');
  const subtitle = document.getElementById('chat-subtitle');
  const badge = document.getElementById('chat-workspace-badge');

  if (title && ws.workspace) {
    title.textContent = ws.workspace || 'Copilot Chat';
  }
  if (subtitle) {
    const parts = [];
    if (ws.activeFile) parts.push(ws.activeFile);
    if (ws.activeLanguage) parts.push(ws.activeLanguage);
    subtitle.textContent = parts.join(' • ') || 'No file open';
  }
  if (badge && ws.activeFile) {
    badge.style.display = '';
    badge.innerHTML = `<span class="badge badge-blue" style="font-size:.72rem">📄 ${esc(ws.activeFile)}</span>`;
  }
}

function updateChatHeader(connected, statusText) {
  const subtitle = document.getElementById('chat-subtitle');
  if (subtitle && statusText) subtitle.textContent = statusText;
  if (connected !== null) updateExtensionStatus(connected);
}

function renderChatMessages(messages) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  if (messages.length === 0) return;

  const empty = document.getElementById('chat-empty');
  if (empty) empty.style.display = 'none';

  const fragment = document.createDocumentFragment();
  for (const msg of messages) {
    fragment.appendChild(createChatBubble(msg));
  }
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
  div.className = `chat-bubble chat-bubble-${msg.role}`;
  div.setAttribute('data-id', msg.id || '');

  const label = document.createElement('div');
  label.className = 'chat-bubble-label';
  label.textContent = msg.role === 'user' ? 'You' : 'Copilot';

  const content = document.createElement('div');
  content.className = 'chat-bubble-content';
  if (msg.role === 'assistant') {
    content.innerHTML = renderMarkdown(msg.text || '');
  } else {
    content.textContent = msg.text || '';
  }

  const time = document.createElement('div');
  time.className = 'chat-bubble-time';
  const d = new Date(msg.timestamp || Date.now());
  time.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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
    streamEl.innerHTML = `
      <div class="chat-bubble-label">Copilot</div>
      <div class="chat-bubble-content"></div>
      <div class="chat-typing-indicator"><span></span><span></span><span></span></div>`;
    container.appendChild(streamEl);
  }

  const content = streamEl.querySelector('.chat-bubble-content');
  if (content) content.innerHTML = renderMarkdown(chatStreamingText);

  const typing = streamEl.querySelector('.chat-typing-indicator');
  if (typing && chatStreamingText.length > 0) typing.style.display = 'none';

  container.scrollTop = container.scrollHeight;
}

function renderMarkdown(text) {
  if (!text) return '';
  let html = esc(text);
  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="chat-code"><code>$2</code></pre>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>');
  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // Headings
  html = html.replace(/^### (.+)$/gm, '<strong style="font-size:1rem">$1</strong>');
  html = html.replace(/^## (.+)$/gm, '<strong style="font-size:1.05rem">$1</strong>');
  html = html.replace(/^# (.+)$/gm, '<strong style="font-size:1.1rem">$1</strong>');
  // Bullets
  html = html.replace(/^- (.+)$/gm, '• $1');
  html = html.replace(/^\* (.+)$/gm, '• $1');
  // Line breaks
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
    await api('/chat/send', {
      method: 'POST',
      body: { text, includeContext: chatIncludeContext },
    });
  } catch (err) {
    toast('Chat error: ' + err.message, 'error');
    enableChatInput(true);
  }
};

window.clearChatHistory = async function() {
  if (!confirm('Clear all chat history?')) return;
  try {
    await api('/chat/history', { method: 'DELETE' });
    toast('Chat cleared', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
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
        <tr><td style="color:var(--text2)">CPU</td><td>${sysInfo.cpuCount || '-'} × ${esc(sysInfo.cpuModel || '-')}</td></tr>
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
      <button class="btn" onclick="reloadNginx()">🔄 Reload Nginx</button>
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
    toast('Reloading nginx…', 'info');
    const data = await api('/server/nginx/reload', { method: 'POST' });
    toast(data.ok ? 'Nginx reloaded' : 'Reload failed', data.ok ? 'success' : 'error');
  } catch (err) {
    toast(err.message, 'error');
  }
};

// ── Boot ─────────────────────────────────────────────────
(function boot() {
  if (state.token) {
    showApp();
  } else {
    showLogin();
  }
})();
