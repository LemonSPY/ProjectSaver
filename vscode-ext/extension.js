const vscode = require('vscode');
const http = require('http');
const https = require('https');
const { URL } = require('url');

let statusBar;
let ws = null;
let token = null;
let reconnectTimer = null;
let stateTimer = null;
let chatHistory = [];

// ── Helpers ─────────────────────────────────────────────
function getConfig(key) {
  return vscode.workspace.getConfiguration('projectSaver').get(key);
}

function httpRequest(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const body = opts.body ? JSON.stringify(opts.body) : undefined;
    const headers = { 'Content-Type': 'application/json', ...opts.headers };
    if (body) headers['Content-Length'] = Buffer.byteLength(body);

    const req = mod.request(u, { method: opts.method || 'GET', headers }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Auth ────────────────────────────────────────────────
async function login() {
  const serverUrl = getConfig('serverUrl');
  const email = getConfig('email');
  const password = getConfig('password');

  const res = await httpRequest(`${serverUrl}/api/login`, {
    method: 'POST',
    body: { email, password },
  });

  if (res.status === 200 && res.data.token) {
    token = res.data.token;
    return true;
  }
  throw new Error(res.data.error || 'Login failed');
}

// ── WebSocket Connection ────────────────────────────────
function connect() {
  if (ws) { try { ws.close(); } catch {} }

  const serverUrl = getConfig('serverUrl');
  const wsUrl = serverUrl.replace(/^http/, 'ws') + '/ws/extension?token=' + encodeURIComponent(token);

  const WebSocket = require('./ws-polyfill');
  ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    setStatus('connected');
    sendWorkspaceState();
    // Send state every 10s
    if (stateTimer) clearInterval(stateTimer);
    stateTimer = setInterval(sendWorkspaceState, 10000);
  });

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      await handleMessage(msg);
    } catch (err) {
      console.error('[ProjectSaver] Bad message:', err);
    }
  });

  ws.on('close', () => {
    setStatus('disconnected');
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.error('[ProjectSaver] WS error:', err.message);
    setStatus('error');
  });
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(async () => {
    try {
      if (!token) await login();
      connect();
    } catch { scheduleReconnect(); }
  }, 5000);
}

function disconnect() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (stateTimer) { clearInterval(stateTimer); stateTimer = null; }
  if (ws) { try { ws.close(); } catch {} ws = null; }
  setStatus('disconnected');
}

// ── Status Bar ──────────────────────────────────────────
function setStatus(state) {
  if (!statusBar) return;
  switch (state) {
    case 'connected':
      statusBar.text = '$(plug) PS: Connected';
      statusBar.backgroundColor = undefined;
      statusBar.tooltip = 'Project Saver Bridge — Connected';
      break;
    case 'disconnected':
      statusBar.text = '$(debug-disconnect) PS: Disconnected';
      statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      statusBar.tooltip = 'Project Saver Bridge — Disconnected (reconnecting…)';
      break;
    case 'error':
      statusBar.text = '$(error) PS: Error';
      statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      break;
    case 'chatting':
      statusBar.text = '$(loading~spin) PS: Chatting…';
      statusBar.backgroundColor = undefined;
      break;
    default:
      statusBar.text = '$(plug) PS';
  }
}

// ── Workspace State ─────────────────────────────────────
function sendWorkspaceState() {
  if (!ws || ws.readyState !== 1) return;

  const editor = vscode.window.activeTextEditor;
  const folders = vscode.workspace.workspaceFolders || [];

  const state = {
    type: 'workspace-state',
    workspace: folders.map(f => f.name).join(', ') || 'No workspace',
    workspacePath: folders[0]?.uri.fsPath || '',
    activeFile: editor ? vscode.workspace.asRelativePath(editor.document.uri) : null,
    activeLanguage: editor?.document.languageId || null,
    activeLine: editor?.selection.active.line || null,
    dirty: editor?.document.isDirty || false,
    openFiles: vscode.window.tabGroups.all
      .flatMap(g => g.tabs)
      .filter(t => t.input && t.input.uri)
      .map(t => vscode.workspace.asRelativePath(t.input.uri))
      .slice(0, 20),
    timestamp: Date.now(),
  };

  ws.send(JSON.stringify(state));
}

// ── Message Handler ─────────────────────────────────────
async function handleMessage(msg) {
  switch (msg.type) {
    case 'chat-request':
      await handleChatRequest(msg);
      break;
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }));
      break;
  }
}

// ── Chat with Copilot LM ───────────────────────────────
async function handleChatRequest(msg) {
  const { id, text, includeContext } = msg;
  setStatus('chatting');

  try {
    // Try to get a language model (Copilot)
    const models = await vscode.lm.selectChatModels({ family: 'gpt-4o' });
    let model = models[0];
    
    // Fallback to any available model
    if (!model) {
      const allModels = await vscode.lm.selectChatModels();
      model = allModels[0];
    }

    if (!model) {
      sendChatResponse(id, 'No AI model available. Make sure GitHub Copilot is installed and signed in.', true);
      setStatus('connected');
      return;
    }

    // Build messages
    const messages = [];

    // System context
    if (includeContext !== false) {
      const editor = vscode.window.activeTextEditor;
      const folders = vscode.workspace.workspaceFolders || [];
      let contextParts = [`Workspace: ${folders.map(f => f.name).join(', ') || 'none'}`];

      if (editor) {
        const doc = editor.document;
        contextParts.push(`Active file: ${vscode.workspace.asRelativePath(doc.uri)} (${doc.languageId})`);

        // Include visible code
        const visibleRange = editor.visibleRanges[0];
        if (visibleRange) {
          const visibleText = doc.getText(visibleRange).substring(0, 2000);
          contextParts.push(`Visible code:\n\`\`\`${doc.languageId}\n${visibleText}\n\`\`\``);
        }
      }

      messages.push(vscode.LanguageModelChatMessage.User(
        `Context:\n${contextParts.join('\n')}\n\nUser request: ${text}`
      ));
    } else {
      messages.push(vscode.LanguageModelChatMessage.User(text));
    }

    // Send request and stream response
    const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

    let fullText = '';
    for await (const chunk of response.text) {
      fullText += chunk;
      // Send streaming updates
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: 'chat-response-stream',
          id,
          chunk,
          partial: fullText,
        }));
      }
    }

    sendChatResponse(id, fullText, false);

    // Store in history
    chatHistory.push(
      { role: 'user', text, timestamp: Date.now() },
      { role: 'assistant', text: fullText, timestamp: Date.now() }
    );
    // Keep last 50 messages
    if (chatHistory.length > 50) chatHistory = chatHistory.slice(-50);

  } catch (err) {
    const errorMsg = err.message || String(err);
    sendChatResponse(id, `Error: ${errorMsg}`, true);
  }

  setStatus('connected');
}

function sendChatResponse(id, text, isError) {
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({
    type: 'chat-response',
    id,
    text,
    error: isError || false,
    timestamp: Date.now(),
  }));
}

// ── Extension Activation ────────────────────────────────
function activate(context) {
  console.log('[ProjectSaver] Extension activating…');

  // Status bar
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  statusBar.command = 'projectSaver.status';
  statusBar.show();
  setStatus('disconnected');
  context.subscriptions.push(statusBar);

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('projectSaver.connect', async () => {
      try {
        await login();
        connect();
        vscode.window.showInformationMessage('Project Saver: Connected!');
      } catch (err) {
        vscode.window.showErrorMessage('Project Saver: ' + err.message);
      }
    }),

    vscode.commands.registerCommand('projectSaver.disconnect', () => {
      disconnect();
      vscode.window.showInformationMessage('Project Saver: Disconnected');
    }),

    vscode.commands.registerCommand('projectSaver.status', () => {
      const connected = ws && ws.readyState === 1;
      const items = [
        connected ? 'Disconnect' : 'Connect',
        'Show Chat History',
      ];
      vscode.window.showQuickPick(items).then(choice => {
        if (choice === 'Connect') vscode.commands.executeCommand('projectSaver.connect');
        if (choice === 'Disconnect') vscode.commands.executeCommand('projectSaver.disconnect');
      });
    })
  );

  // Watch for editor changes → send state
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => sendWorkspaceState()),
    vscode.workspace.onDidSaveTextDocument(() => sendWorkspaceState()),
    vscode.window.onDidChangeTextEditorSelection(() => {
      // Debounced — only send on next state timer
    })
  );

  // Auto-connect
  if (getConfig('autoConnect')) {
    setTimeout(async () => {
      try {
        await login();
        connect();
      } catch (err) {
        console.error('[ProjectSaver] Auto-connect failed:', err.message);
        setStatus('disconnected');
      }
    }, 2000);
  }
}

function deactivate() {
  disconnect();
}

module.exports = { activate, deactivate };
