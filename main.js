const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { Client: DiscordRPCClient } = require('@xhayper/discord-rpc');

let mainWindow = null;
let rpc = null;
let rpcReady = false;
let reconnectTimer = null;
let pendingJoinSecret = null;

function loadConfig() {
  // Development: config.json sits beside main.js.
  // Packaged builds: electron-builder also ships it in resources so the
  // Discord client ID remains available outside the ASAR archive.
  const candidates = [
    path.join(process.resourcesPath, 'config.json'),
    path.join(__dirname, 'config.json')
  ];

  for (const configPath of candidates) {
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (parsed && parsed.clientId) return parsed;
    } catch (_) {}
  }

  return { clientId: '' };
}

const config = loadConfig();
const PROTOCOL = 'thebigcon';
const DISCORD_PROTOCOL = config.clientId ? ('discord-' + config.clientId) : null;

function extractJoinSecret(argv) {
  const args = Array.isArray(argv) ? argv : [];
  for (const raw of args) {
    const arg = String(raw || '');
    const m = arg.match(/^(?:thebigcon|discord-\d+):\/\/(?:join\/?)?(.+)$/i);
    if (m) {
      try { return decodeURIComponent(m[1].replace(/^secret=/i, '')); }
      catch (_) { return m[1]; }
    }
  }
  return null;
}

function deliverJoinSecret(secret) {
  if (!secret) return;
  pendingJoinSecret = secret;
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('rpc:join', secret);
  }
}

function registerOpenHandlers() {
  const extra = process.defaultApp
    ? [path.resolve(process.argv[1])]
    : [];
  try {
    if (process.defaultApp) {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, extra);
      if (DISCORD_PROTOCOL) app.setAsDefaultProtocolClient(DISCORD_PROTOCOL, process.execPath, extra);
    } else {
      app.setAsDefaultProtocolClient(PROTOCOL);
      if (DISCORD_PROTOCOL) app.setAsDefaultProtocolClient(DISCORD_PROTOCOL);
    }
  } catch (e) {
    console.warn('[protocol] registration failed:', e && e.message ? e.message : e);
  }

  const fromArgv = extractJoinSecret(process.argv);
  if (fromArgv) pendingJoinSecret = fromArgv;
}

function connectRPC() {
  if (!config.clientId) {
    console.warn(
      '[discord-rpc] config.json has no clientId set — Rich Presence is disabled.\n' +
      '[discord-rpc] See README.md for how to get one from the Discord Developer Portal.'
    );
    return;
  }

  rpc = new DiscordRPCClient({ clientId: config.clientId });

  rpc.on('ready', () => {
    rpcReady = true;
    console.log('[discord-rpc] connected' + (rpc.user ? ' as ' + rpc.user.username : ''));
    subscribeJoinEvents();
  });

  rpc.on('ACTIVITY_JOIN', (data) => {
    const secret = data && (data.secret || data.joinSecret);
    if (secret) deliverJoinSecret(secret);
  });

  rpc.on('ACTIVITY_JOIN_REQUEST', (data) => {
    const user = data && (data.user || data);
    const userId = user && user.id;
    if (!userId || !rpc) return;
    Promise.resolve(
      rpc.request
        ? rpc.request('SEND_ACTIVITY_JOIN_INVITE', { user_id: userId })
        : null
    ).catch(() => { /* ignore */ });
  });

  rpc.on('disconnected', () => {
    rpcReady = false;
    scheduleReconnect();
  });

  rpc.login().catch(() => {
    rpcReady = false;
    scheduleReconnect();
  });
}

function subscribeJoinEvents() {
  if (!rpc || typeof rpc.subscribe !== 'function') return;
  Promise.resolve(rpc.subscribe('ACTIVITY_JOIN')).catch(() => {});
  Promise.resolve(rpc.subscribe('ACTIVITY_JOIN_REQUEST')).catch(() => {});
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectRPC();
  }, 15000);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#1d201f',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingJoinSecret) mainWindow.webContents.send('rpc:join', pendingJoinSecret);
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const secret = extractJoinSecret(argv);
    if (secret) deliverJoinSecret(secret);
    else if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    const secret = extractJoinSecret([url]);
    if (secret) deliverJoinSecret(secret);
  });

  app.whenReady().then(() => {
    registerOpenHandlers();
    connectRPC();
    createWindow();

    console.log('[startup] packaged:', !process.defaultApp);
    console.log('[startup] executable:', process.execPath);
    console.log('[startup] clientId loaded:', !!config.clientId);
    console.log('[startup] thebigcon protocol:', app.isDefaultProtocolClient(PROTOCOL));
    if (DISCORD_PROTOCOL) {
      console.log('[startup] discord protocol:', app.isDefaultProtocolClient(DISCORD_PROTOCOL));
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (rpc) { try { rpc.destroy(); } catch (e) { /* ignore */ } }
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('rpc:setActivity', (_event, activity) => {
  if (!rpcReady || !rpc || !rpc.user || !activity) return;

  const payload = {
    details: activity.details,
    state: activity.state,
    largeImageKey: activity.largeImageKey || 'big_con_logo',
    largeImageText: activity.largeImageText || 'THE BIG CON',
    instance: !!activity.instance
  };
  if (activity.smallImageKey) payload.smallImageKey = activity.smallImageKey;
  if (activity.smallImageText) payload.smallImageText = activity.smallImageText;
  if (activity.startTimestamp) payload.startTimestamp = activity.startTimestamp;
  if (activity.partyId && activity.partySize && activity.partyMax) {
    payload.partyId = activity.partyId;
    payload.partySize = activity.partySize;
    payload.partyMax = activity.partyMax;
  }
  // Join secret + party is what turns presence into a Discord "Invite to
  // join" card (the Join button in chat / on a profile). Do not also send
  // custom buttons — Discord hides them when a join secret is present.
  if (activity.joinSecret && activity.partySize < activity.partyMax) {
    payload.joinSecret = String(activity.joinSecret).slice(0, 128);
    payload.instance = true;
  }
  if (Array.isArray(activity.supportedPlatforms) && activity.supportedPlatforms.length) {
    payload.supportedPlatforms = activity.supportedPlatforms;
  }

  Promise.resolve(rpc.user.setActivity(payload)).catch(() => { /* ignore */ });
});

ipcMain.on('rpc:clearActivity', () => {
  if (!rpcReady || !rpc || !rpc.user) return;
  Promise.resolve(rpc.user.clearActivity()).catch(() => { /* ignore */ });
});

ipcMain.handle('rpc:getUser', () => {
  if (!rpcReady || !rpc || !rpc.user) return null;
  return {
    username: rpc.user.username || rpc.user.globalName || '',
    id: rpc.user.id || ''
  };
});

ipcMain.handle('rpc:takePendingJoin', () => {
  const s = pendingJoinSecret;
  pendingJoinSecret = null;
  return s;
});
