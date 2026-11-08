'use strict';

// Narrow bridge: the renderer gets exactly these functions, nothing else.
const { contextBridge, ipcRenderer } = require('electron');

const INVOKE_CHANNELS = new Set([
  'settings:get', 'settings:set',
  'keys:status', 'keys:set', 'keys:clear',
  'chat:send', 'audio:chunk',
  'transcript:clear', 'window:close', 'window:quit',
  'guard:status'
]);

const ON_CHANNELS = new Set([
  'transcript:append', 'suggestion', 'suggestion:error',
  'settings:changed', 'guard:changed'
]);

contextBridge.exposeInMainWorld('sidekick', {
  invoke: (channel, ...args) => {
    if (!INVOKE_CHANNELS.has(channel)) return Promise.reject(new Error('blocked channel'));
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (channel, fn) => {
    if (!ON_CHANNELS.has(channel)) return () => {};
    const listener = (_e, payload) => fn(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
});
