const { contextBridge, ipcRenderer } = require('electron')

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args)

contextBridge.exposeInMainWorld('yunqi', {
  bootstrap: () => invoke('app:bootstrap'),
  bootstrapLive: () => invoke('app:bootstrap-live'),
  getDaily: () => invoke('music:daily'),
  getRoam: (limit, mode) => invoke('music:roam', limit, mode),
  setRoamMode: (mode) => invoke('music:set-roam-mode', mode),
  getLibrary: (force = false) => invoke('music:library', force),
  search: (query) => invoke('music:search', query),
  getPlaylist: (id) => invoke('music:playlist', id),
  getAlbum: (track) => invoke('music:album', track),
  getArtist: (track) => invoke('music:artist', track),
  prefetchTrackContext: (track) =>
    invoke('music:prefetch-track-context', track),
  getArtistAlbums: (artist) => invoke('music:artist-albums', artist),
  followArtist: (artist, follow) =>
    invoke('music:follow-artist', artist, follow),
  subscribeAlbum: (album, subscribed) =>
    invoke('music:subscribe-album', album, subscribed),
  getSongUrl: (track, qualityLevel) =>
    invoke('music:url', track, qualityLevel),
  getLyric: (track) => invoke('music:lyric', track),
  getLikeState: (track) => invoke('music:like-state', track),
  setLike: (track, liked) => invoke('music:like', track, liked),
  getPaletteSource: (url) => invoke('art:palette-source', url),
  checkUpdate: () => invoke('updates:check'),
  installUpdate: (update) => invoke('updates:install', update),
  getVersion: () => invoke('app:version'),
  getTogetherState: () => invoke('together:get-state'),
  createTogetherRoom: (provider) => invoke('together:create', provider),
  joinTogetherRoom: (invite, name) => invoke('together:join', invite, name),
  leaveTogetherRoom: () => invoke('together:leave'),
  syncTogether: (snapshot) => invoke('together:sync', snapshot),
  controlTogether: (action) => invoke('together:control', action),
  chatTogether: (message) => invoke('together:chat', message),
  onTogetherEvent: (callback) => {
    const listener = (_event, value) => callback(value)
    ipcRenderer.on('together:event', listener)
    return () => ipcRenderer.removeListener('together:event', listener)
  },
  webLogin: () => invoke('auth:web-login'),
  webQqLogin: () => invoke('auth:qq-web-login'),
  startKugouQrLogin: () => invoke('auth:kugou-qr-start'),
  checkKugouQrLogin: () => invoke('auth:kugou-qr-check'),
  startQqQrLogin: () => invoke('auth:qq-qr-start'),
  checkQqQrLogin: () => invoke('auth:qq-qr-check'),
  startQishuiQrLogin: () => invoke('auth:qishui-qr-start'),
  checkQishuiQrLogin: () => invoke('auth:qishui-qr-check'),
  setPrimaryProvider: (provider) =>
    invoke('platforms:set-primary', provider),
  setSecondaryEnabled: (enabled) =>
    invoke('platforms:set-secondary-enabled', enabled),
  logout: (provider) => invoke('auth:logout', provider),
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
