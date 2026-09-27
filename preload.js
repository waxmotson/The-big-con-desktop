// Runs in a privileged context before index.html loads, and exposes a tiny,
// safe API to it via contextBridge. This is the ONLY thing that lets the
// game page (which is otherwise a plain, sandboxed web page) talk to Discord.
// If you strip this file out, or open index.html in a normal browser, the
// page just runs as the regular web version — nothing breaks.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('discordRPC', {
  available: true,

  setActivity(activity) {
    try { ipcRenderer.send('rpc:setActivity', activity || {}); } catch (e) { /* ignore */ }
  },

  clearActivity() {
    try { ipcRenderer.send('rpc:clearActivity'); } catch (e) { /* ignore */ }
  },

  getUser() {
    try { return ipcRenderer.invoke('rpc:getUser'); } catch (e) { return Promise.resolve(null); }
  },

  takePendingJoin() {
    try { return ipcRenderer.invoke('rpc:takePendingJoin'); } catch (e) { return Promise.resolve(null); }
  },

  onJoin(handler) {
    if (typeof handler !== 'function') return function () {};
    const wrapped = (_event, secret) => { try { handler(secret); } catch (e) { /* ignore */ } };
    ipcRenderer.on('rpc:join', wrapped);
    return function () { try { ipcRenderer.removeListener('rpc:join', wrapped); } catch (e) {} };
  }
});
