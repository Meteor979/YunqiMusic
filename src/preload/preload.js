const { contextBridge, ipcRenderer } = require('electron')

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args)

contextBridge.exposeInMainWorld('yunqi', {
  bootstrap: () => invoke('app:bootstrap'),
  getDaily: () => invoke('music:daily'),
  getRoam: (limit) => invoke('music:roam', limit),
  getLibrary: () => invoke('music:library'),
  search: (query) => invoke('music:search', query),
  getPlaylist: (id) => invoke('music:playlist', id),
  getSongUrl: (id) => invoke('music:url', id),
  getLyric: (id) => invoke('music:lyric', id),
  getLikeState: (id) => invoke('music:like-state', id),
  setLike: (id, liked) => invoke('music:like', id, liked),
  getPaletteSource: (url) => invoke('art:palette-source', url),
  checkUpdate: () => invoke('updates:check'),
  installUpdate: (update) => invoke('updates:install', update),
  getVersion: () => invoke('app:version'),
  webLogin: () => invoke('auth:web-login'),
  logout: () => invoke('auth:logout'),
  rememberTrack: (track) => invoke('app:remember-track', track),
  setAudioSettings: (settings) => invoke('app:set-audio-settings', settings),
  openExternal: (url) => invoke('shell:external', url),
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
  onWindowState: (callback) => {
    const listener = (_event, value) => callback(value)
    ipcRenderer.on('window:state', listener)
    return () => ipcRenderer.removeListener('window:state', listener)
  },
})
