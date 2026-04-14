'use strict';

const screenshot = require('screenshot-desktop');
const sharp = require('sharp');
const http = require('http');
const https = require('https');
const { URL } = require('url');

// ── Config ──────────────────────────────────────────────
const SERVER_URL = process.env.PS_SERVER || 'http://45.79.138.133';
const EMAIL = process.env.PS_EMAIL || 'devin@marrazzo.net';
const PASSWORD = process.env.PS_PASSWORD || 'Nexus2026!';
const INTERVAL = parseInt(process.env.PS_INTERVAL || '2000', 10); // ms between captures
const QUALITY = parseInt(process.env.PS_QUALITY || '50', 10);     // JPEG quality (1-100)
const MAX_WIDTH = parseInt(process.env.PS_WIDTH || '1280', 10);   // Resize width

let token = null;
let running = true;

// ── Auth ────────────────────────────────────────────────
async function login() {
  const url = new URL('/api/login', SERVER_URL);
  const body = JSON.stringify({ email: EMAIL, password: PASSWORD });

  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j.token) { token = j.token; resolve(true); }
          else reject(new Error(j.error || 'Login failed'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Upload screenshot ───────────────────────────────────
async function upload(buffer) {
  const url = new URL('/api/vscode/screenshot', SERVER_URL);

  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'image/jpeg',
        'Content-Length': buffer.length,
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode === 401) { token = null; }
        resolve(res.statusCode);
      });
    });
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
}

// ── Capture + send loop ─────────────────────────────────
async function captureAndSend() {
  try {
    // Capture full screen as PNG buffer
    const png = await screenshot({ format: 'png' });

    // Resize + compress to JPEG
    const jpg = await sharp(png)
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: QUALITY })
      .toBuffer();

    // Re-login if needed
    if (!token) {
      await login();
      console.log('[agent] Authenticated');
    }

    const status = await upload(jpg);
    if (status === 401) {
      await login();
      await upload(jpg);
    }

    const kb = (jpg.length / 1024).toFixed(1);
    process.stdout.write(`\r[agent] Sent ${kb} KB @ ${new Date().toLocaleTimeString()}  `);
  } catch (err) {
    console.error('\n[agent] Error:', err.message);
  }
}

// ── Main ────────────────────────────────────────────────
async function main() {
  console.log('[agent] VS Code Screen Agent starting...');
  console.log(`[agent] Server: ${SERVER_URL}`);
  console.log(`[agent] Interval: ${INTERVAL}ms | Quality: ${QUALITY} | Max width: ${MAX_WIDTH}px`);

  try {
    await login();
    console.log('[agent] Authenticated successfully');
  } catch (err) {
    console.error('[agent] Login failed:', err.message);
    process.exit(1);
  }

  console.log('[agent] Streaming... (Ctrl+C to stop)');

  const loop = async () => {
    while (running) {
      await captureAndSend();
      await new Promise(r => setTimeout(r, INTERVAL));
    }
  };
  loop();
}

process.on('SIGINT', () => { running = false; console.log('\n[agent] Stopped.'); process.exit(0); });
main();
