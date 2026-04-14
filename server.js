'use strict';

const express = require('express');
const path = require('path');
const { execSync, spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { WebSocketServer } = require('ws');
const http = require('http');

// ── Config ──────────────────────────────────────────────────
const PORT = parseInt(process.env.PS_PORT || '3080', 10);
const JWT_SECRET = process.env.PS_JWT_SECRET || 'project-saver-secret-key-change-me';
const NEXUS_DIR = process.env.NEXUS_DIR || '/opt/nexus';
const NEXUS_DB = process.env.NEXUS_DB || path.join(NEXUS_DIR, 'packages/core/data/nexus.db');

// Default user — seeded on first run
const DEFAULT_EMAIL = 'devin@marrazzo.net';
const DEFAULT_PASSWORD = 'Nexus2026!';

// ── Database ────────────────────────────────────────────────
const Database = require('better-sqlite3');
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'project-saver.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Seed default user
const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(DEFAULT_EMAIL);
if (!existing) {
  const hash = bcrypt.hashSync(DEFAULT_PASSWORD, 12);
  db.prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)').run(DEFAULT_EMAIL, hash, 'Devin Marrazzo');
  console.log(`[seed] Created default user: ${DEFAULT_EMAIL}`);
}

// Settings helpers
function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}
function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

// ── Auth middleware ─────────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ── Shell helpers ───────────────────────────────────────────
function sh(cmd, opts = {}) {
  try {
    return {
      ok: true,
      output: execSync(cmd, {
        timeout: opts.timeout || 30000,
        encoding: 'utf8',
        cwd: opts.cwd || '/',
        env: { ...process.env, ...opts.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim(),
    };
  } catch (err) {
    return { ok: false, output: (err.stderr || err.stdout || err.message || '').trim() };
  }
}

// ── Express app ─────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth routes ─────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ── System info ─────────────────────────────────────────────
app.get('/api/system', requireAuth, (_req, res) => {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const uptime = os.uptime();

  // Disk usage
  let disk = { total: 0, used: 0, free: 0, percent: 0 };
  try {
    const dfOut = execSync("df -B1 / | tail -1", { encoding: 'utf8', timeout: 5000 });
    const parts = dfOut.trim().split(/\s+/);
    disk = {
      total: parseInt(parts[1]) || 0,
      used: parseInt(parts[2]) || 0,
      free: parseInt(parts[3]) || 0,
      percent: parseInt(parts[4]) || 0,
    };
  } catch { /* ignore on Windows */ }

  // Load average
  const loadAvg = os.loadavg();

  res.json({
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    cpuCount: cpus.length,
    cpuModel: cpus[0]?.model || 'unknown',
    totalMemory: totalMem,
    freeMemory: freeMem,
    usedMemory: totalMem - freeMem,
    memoryPercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
    disk,
    loadAvg,
    uptime,
    uptimeFormatted: formatUptime(uptime),
  });
});

function formatUptime(s) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

// ── Docker containers ───────────────────────────────────────
app.get('/api/containers', requireAuth, (_req, res) => {
  const result = sh('docker ps -a --format "{{json .}}"');
  if (!result.ok) return res.json({ containers: [], error: result.output });

  const containers = result.output
    .split('\n')
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean)
    .map(c => ({
      id: c.ID,
      name: c.Names,
      image: c.Image,
      status: c.Status,
      state: c.State,
      ports: c.Ports,
      created: c.CreatedAt,
      size: c.Size,
    }));

  res.json({ containers });
});

app.post('/api/containers/:id/:action', requireAuth, (req, res) => {
  const { id, action } = req.params;
  const allowed = ['start', 'stop', 'restart', 'pause', 'unpause'];
  if (!allowed.includes(action)) return res.status(400).json({ error: 'Invalid action' });

  // Sanitize container id
  if (!/^[a-zA-Z0-9_.-]+$/.test(id)) return res.status(400).json({ error: 'Invalid container ID' });

  const result = sh(`docker ${action} ${id}`, { timeout: 60000 });
  res.json({ ok: result.ok, output: result.output });
});

app.get('/api/containers/:id/logs', requireAuth, (req, res) => {
  const { id } = req.params;
  if (!/^[a-zA-Z0-9_.-]+$/.test(id)) return res.status(400).json({ error: 'Invalid container ID' });

  const tail = Math.min(parseInt(req.query.tail) || 100, 500);
  const result = sh(`docker logs --tail ${tail} ${id} 2>&1`, { timeout: 10000 });
  res.json({ ok: result.ok, logs: result.output });
});

app.get('/api/containers/:id/inspect', requireAuth, (req, res) => {
  const { id } = req.params;
  if (!/^[a-zA-Z0-9_.-]+$/.test(id)) return res.status(400).json({ error: 'Invalid container ID' });

  const result = sh(`docker inspect ${id}`);
  if (!result.ok) return res.status(500).json({ error: result.output });
  try {
    res.json({ inspect: JSON.parse(result.output)[0] });
  } catch {
    res.json({ inspect: result.output });
  }
});

// ── Docker images ───────────────────────────────────────────
app.get('/api/images', requireAuth, (_req, res) => {
  const result = sh('docker images --format "{{json .}}"');
  if (!result.ok) return res.json({ images: [], error: result.output });

  const images = result.output
    .split('\n')
    .filter(Boolean)
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);

  res.json({ images });
});

// ── PM2 services ────────────────────────────────────────────
app.get('/api/services', requireAuth, (_req, res) => {
  const result = sh('pm2 jlist');
  if (!result.ok) return res.json({ services: [], error: result.output });

  try {
    const list = JSON.parse(result.output);
    const services = list.map(p => ({
      name: p.name,
      pmId: p.pm_id,
      pid: p.pid,
      status: p.pm2_env?.status,
      memory: p.monit?.memory || 0,
      cpu: p.monit?.cpu || 0,
      uptime: p.pm2_env?.pm_uptime ? Date.now() - p.pm2_env.pm_uptime : 0,
      restarts: p.pm2_env?.restart_time || 0,
      version: p.pm2_env?.version || '',
      cwd: p.pm2_env?.pm_cwd || '',
    }));
    res.json({ services });
  } catch {
    res.json({ services: [], error: 'Failed to parse PM2 output' });
  }
});

app.post('/api/services/:name/:action', requireAuth, (req, res) => {
  const { name, action } = req.params;
  const allowed = ['restart', 'stop', 'start', 'reload'];
  if (!allowed.includes(action)) return res.status(400).json({ error: 'Invalid action' });
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) return res.status(400).json({ error: 'Invalid service name' });

  const result = sh(`pm2 ${action} ${name}`, { timeout: 30000 });
  res.json({ ok: result.ok, output: result.output });
});

app.get('/api/services/:name/logs', requireAuth, (req, res) => {
  const { name } = req.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) return res.status(400).json({ error: 'Invalid service name' });

  const lines = Math.min(parseInt(req.query.lines) || 50, 200);
  const result = sh(`pm2 logs ${name} --lines ${lines} --nostream 2>&1`, { timeout: 10000 });
  res.json({ ok: result.ok, logs: result.output });
});

// ── Nexus controls ──────────────────────────────────────────
app.get('/api/nexus/status', requireAuth, (_req, res) => {
  const git = sh('git log --oneline -5', { cwd: NEXUS_DIR });
  const branch = sh('git branch --show-current', { cwd: NEXUS_DIR });
  const status = sh('git status --short', { cwd: NEXUS_DIR });
  const health = sh('curl -s http://localhost:3001/health', { timeout: 5000 });

  res.json({
    branch: branch.ok ? branch.output : 'unknown',
    recentCommits: git.ok ? git.output.split('\n') : [],
    gitStatus: status.ok ? status.output : '',
    healthCheck: health.ok ? health.output : 'unreachable',
    nexusDir: NEXUS_DIR,
  });
});

app.post('/api/nexus/pull', requireAuth, (_req, res) => {
  const result = sh('git pull origin guardian', { cwd: NEXUS_DIR, timeout: 60000 });
  res.json({ ok: result.ok, output: result.output });
});

app.post('/api/nexus/install', requireAuth, (_req, res) => {
  const result = sh('npm install', { cwd: NEXUS_DIR, timeout: 120000 });
  res.json({ ok: result.ok, output: result.output });
});

app.post('/api/nexus/build', requireAuth, (_req, res) => {
  const result = sh('npx vite build', { cwd: path.join(NEXUS_DIR, 'packages/web'), timeout: 60000 });
  res.json({ ok: result.ok, output: result.output });
});

app.post('/api/nexus/restart', requireAuth, (_req, res) => {
  const result = sh('pm2 restart nexus-core nexus-guardian', { timeout: 15000 });
  res.json({ ok: result.ok, output: result.output });
});

app.post('/api/nexus/migrate', requireAuth, (_req, res) => {
  const result = sh('node packages/core/src/db/migrate.js', { cwd: NEXUS_DIR, timeout: 15000 });
  res.json({ ok: result.ok, output: result.output });
});

app.post('/api/nexus/deploy', requireAuth, (_req, res) => {
  // Full deploy pipeline: pull → install → migrate → build → restart
  const steps = [];

  const pull = sh('git pull origin guardian', { cwd: NEXUS_DIR, timeout: 60000 });
  steps.push({ step: 'pull', ...pull });
  if (!pull.ok) return res.json({ ok: false, steps });

  const install = sh('npm install', { cwd: NEXUS_DIR, timeout: 120000 });
  steps.push({ step: 'install', ...install });
  if (!install.ok) return res.json({ ok: false, steps });

  const migrate = sh('node packages/core/src/db/migrate.js', { cwd: NEXUS_DIR, timeout: 15000 });
  steps.push({ step: 'migrate', ...migrate });

  const build = sh('npx vite build', { cwd: path.join(NEXUS_DIR, 'packages/web'), timeout: 60000 });
  steps.push({ step: 'build', ...build });
  if (!build.ok) return res.json({ ok: false, steps });

  const restart = sh('pm2 restart nexus-core nexus-guardian', { timeout: 15000 });
  steps.push({ step: 'restart', ...restart });

  res.json({ ok: restart.ok, steps });
});

// ── Nexus DB stats ──────────────────────────────────────────
app.get('/api/nexus/db-stats', requireAuth, (_req, res) => {
  try {
    if (!fs.existsSync(NEXUS_DB)) return res.json({ error: 'Nexus DB not found' });
    const ndb = new Database(NEXUS_DB, { readonly: true });
    const tables = ndb.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    const stats = {};
    for (const t of tables) {
      try {
        stats[t.name] = ndb.prepare(`SELECT COUNT(*) as count FROM "${t.name}"`).get().count;
      } catch { stats[t.name] = -1; }
    }
    const users = ndb.prepare('SELECT id, email, name, created_at FROM users ORDER BY created_at DESC LIMIT 20').all();
    ndb.close();
    res.json({ tables: stats, users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── VS Code tunnel settings ─────────────────────────────────
app.get('/api/vscode/settings', requireAuth, (_req, res) => {
  res.json({
    tunnelUrl: getSetting('vscode_tunnel_url', ''),
    machineName: getSetting('vscode_machine_name', ''),
    autoConnect: getSetting('vscode_auto_connect', 'false'),
  });
});

app.put('/api/vscode/settings', requireAuth, (req, res) => {
  const { tunnelUrl, machineName, autoConnect } = req.body || {};
  if (tunnelUrl !== undefined) setSetting('vscode_tunnel_url', tunnelUrl);
  if (machineName !== undefined) setSetting('vscode_machine_name', machineName);
  if (autoConnect !== undefined) setSetting('vscode_auto_connect', String(autoConnect));
  res.json({ ok: true });
});

// ── VS Code screen capture ─────────────────────────────────
let latestScreenshot = null;  // { buffer, timestamp }
const MAX_SCREENSHOT_SIZE = 5 * 1024 * 1024; // 5MB limit

app.post('/api/vscode/screenshot', requireAuth, (req, res) => {
  const chunks = [];
  let size = 0;
  req.on('data', chunk => {
    size += chunk.length;
    if (size <= MAX_SCREENSHOT_SIZE) chunks.push(chunk);
  });
  req.on('end', () => {
    if (size > MAX_SCREENSHOT_SIZE) return res.status(413).json({ error: 'Too large' });
    latestScreenshot = { buffer: Buffer.concat(chunks), timestamp: Date.now() };
    res.json({ ok: true, size });
  });
});

app.get('/api/vscode/screenshot', requireAuth, (_req, res) => {
  if (!latestScreenshot) return res.status(404).json({ error: 'No screenshot available' });
  const age = Date.now() - latestScreenshot.timestamp;
  res.set({
    'Content-Type': 'image/jpeg',
    'Cache-Control': 'no-cache',
    'X-Screenshot-Age': String(age),
    'X-Screenshot-Time': new Date(latestScreenshot.timestamp).toISOString(),
  });
  res.send(latestScreenshot.buffer);
});

app.get('/api/vscode/screenshot/meta', requireAuth, (_req, res) => {
  if (!latestScreenshot) return res.json({ available: false });
  res.json({
    available: true,
    timestamp: latestScreenshot.timestamp,
    age: Date.now() - latestScreenshot.timestamp,
    size: latestScreenshot.buffer.length,
  });
});

// ── General settings ────────────────────────────────────────
app.get('/api/settings', requireAuth, (_req, res) => {
  const all = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of all) { settings[row.key] = row.value; }
  res.json({ settings });
});

app.put('/api/settings', requireAuth, (req, res) => {
  const entries = req.body || {};
  for (const [key, value] of Object.entries(entries)) {
    if (typeof key === 'string' && key.length < 100) {
      setSetting(key, String(value));
    }
  }
  res.json({ ok: true });
});

// ── Server management ───────────────────────────────────────
app.get('/api/server/nginx', requireAuth, (_req, res) => {
  const result = sh('nginx -t 2>&1');
  const status = sh('systemctl is-active nginx');
  res.json({
    configValid: result.ok,
    configOutput: result.output,
    status: status.ok ? status.output : 'unknown',
  });
});

app.post('/api/server/nginx/reload', requireAuth, (_req, res) => {
  const result = sh('systemctl reload nginx', { timeout: 10000 });
  res.json({ ok: result.ok, output: result.output });
});

// ── SPA fallback ────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── WebSocket for live logs ─────────────────────────────────
const wss = new WebSocketServer({ server, path: '/ws/logs' });

wss.on('connection', (ws, req) => {
  // Parse token from query
  const urlParams = new URL(req.url, 'http://localhost').searchParams;
  const token = urlParams.get('token');
  try {
    jwt.verify(token, JWT_SECRET);
  } catch {
    ws.close(4001, 'Unauthorized');
    return;
  }

  let logProcess = null;

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      // { type: 'subscribe', source: 'pm2', name: 'nexus-core' }
      // { type: 'subscribe', source: 'docker', id: 'abc123' }
      if (data.type === 'subscribe') {
        // Kill previous stream
        if (logProcess) { try { logProcess.kill(); } catch {} }

        let cmd, args;
        if (data.source === 'pm2' && /^[a-zA-Z0-9_-]+$/.test(data.name)) {
          cmd = 'pm2';
          args = ['logs', data.name, '--raw'];
        } else if (data.source === 'docker' && /^[a-zA-Z0-9_.-]+$/.test(data.id)) {
          cmd = 'docker';
          args = ['logs', '-f', '--tail', '50', data.id];
        } else {
          ws.send(JSON.stringify({ type: 'error', text: 'Invalid subscribe request' }));
          return;
        }

        logProcess = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
        logProcess.stdout.on('data', d => {
          ws.send(JSON.stringify({ type: 'log', text: d.toString() }));
        });
        logProcess.stderr.on('data', d => {
          ws.send(JSON.stringify({ type: 'log', text: d.toString() }));
        });
        logProcess.on('close', () => {
          ws.send(JSON.stringify({ type: 'closed' }));
        });
      }
    } catch { /* ignore bad messages */ }
  });

  ws.on('close', () => {
    if (logProcess) { try { logProcess.kill(); } catch {} }
  });
});

// ── Start ───────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`[project-saver] Running on http://localhost:${PORT}`);
});
