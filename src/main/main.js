const {
  app,
  BrowserWindow,
  ipcMain,
  session,
  shell,
  safeStorage,
} = require('electron')
const fs = require('fs')
const path = require('path')
const ncm = require('NeteaseCloudMusicApi')
const { checkForUpdate, installUpdate } = require('./updater')

if (process.env.YUNQI_USER_DATA) {
  const userDataPath = path.resolve(process.env.YUNQI_USER_DATA)
  fs.mkdirSync(userDataPath, { recursive: true })
  app.setPath('userData', userDataPath)
}

const COOKIE_ATTRIBUTES = new Set([
  'max-age',
  'expires',
  'path',
  'domain',
  'samesite',
  'secure',
  'httponly',
])

let mainWindow = null
let webLoginTask = null
let store = {
  cookie: '',
  lastTrack: null,
  volume: 0.78,
  windowBounds: null,
}
const imageCache = new Map()

function statePath() {
  return path.join(app.getPath('userData'), 'yunqi-state.json')
}

function loadStore() {
  try {
    const raw = JSON.parse(fs.readFileSync(statePath(), 'utf8'))
    store = {
      ...store,
      ...raw,
      cookie:
        typeof raw.cookie === 'string'
          ? raw.cookie
          : typeof raw.cookieEncrypted === 'string' &&
              safeStorage.isEncryptionAvailable()
            ? safeStorage.decryptString(
                Buffer.from(raw.cookieEncrypted, 'base64'),
              )
            : '',
    }
    delete store.cookieEncrypted
  } catch {
    // First launch or an unreadable settings file.
  }
}

function saveStore() {
  const payload = {
    lastTrack: store.lastTrack,
    volume: store.volume,
    windowBounds: store.windowBounds,
  }

  if (store.cookie && safeStorage.isEncryptionAvailable()) {
    payload.cookieEncrypted = safeStorage
      .encryptString(store.cookie)
      .toString('base64')
  } else {
    payload.cookie = store.cookie
  }

  fs.mkdirSync(path.dirname(statePath()), { recursive: true })
  fs.writeFileSync(statePath(), JSON.stringify(payload, null, 2), 'utf8')
}

function cleanCookie(value) {
  if (!value) return ''

  const list = Array.isArray(value) ? value : String(value).split(';')
  const cookies = new Map()

  for (const entry of list) {
    const pair = String(entry).split(';')[0].trim()
    const separator = pair.indexOf('=')
    if (separator <= 0) continue

    const name = pair.slice(0, separator).trim()
    if (!name || COOKIE_ATTRIBUTES.has(name.toLowerCase())) continue
    cookies.set(name, pair.slice(separator + 1).trim())
  }

  return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ')
}

async function apiCall(name, options = {}) {
  const fn = ncm[name]
  if (typeof fn !== 'function') {
    throw new Error(`API method is unavailable: ${name}`)
  }

  const response = await fn({
    ...options,
    cookie: store.cookie,
  })

  if (!response || !response.body) {
    throw new Error('网易云接口没有返回有效数据')
  }

  if (response.body.code && Number(response.body.code) >= 400) {
    const error = new Error(response.body.message || response.body.msg || '请求失败')
    error.code = response.body.code
    throw error
  }

  return response.body
}

async function getProfile() {
  if (!store.cookie) return null

  try {
    const body = await apiCall('login_status')
    const profile = body.data?.profile || body.profile || null
    if (!profile) return null

    return {
      id: profile.userId,
      name: profile.nickname,
      avatar: normalizeArtwork(profile.avatarUrl),
      vip: Boolean(body.data?.account?.vipType),
    }
  } catch {
    return null
  }
}

function normalizeArtwork(url) {
  if (!url) return ''
  return String(url)
    .replace(/^http:\/\//i, 'https://')
    .replace(/\?.*$/, '?param=900y900')
}

function normalizeSong(raw) {
  const song = raw?.song || raw?.track || raw || {}
  const album = song.album || song.al || raw?.album || {}
  const artists = song.artists || song.ar || raw?.artists || []

  return {
    id: Number(song.id || raw?.id),
    name: song.name || raw?.name || '未知歌曲',
    artists: artists.map((artist) => artist.name).filter(Boolean),
    artistIds: artists.map((artist) => artist.id).filter(Boolean),
    album: album.name || song.album?.name || '',
    albumId: album.id || 0,
    cover: normalizeArtwork(
      album.picUrl || album.blurPicUrl || raw?.picUrl || song.picUrl,
    ),
    duration: Number(song.duration || song.dt || raw?.duration || 0),
    fee: Number(song.fee ?? raw?.fee ?? 0),
    mvid: Number(song.mvid || 0),
  }
}

function normalizePlaylist(raw) {
  if (!raw) return null
  return {
    id: Number(raw.id),
    name: raw.name || '未命名歌单',
    cover: normalizeArtwork(raw.coverImgUrl || raw.picUrl),
    description: raw.description || '',
    trackCount: Number(raw.trackCount || raw.tracks?.length || 0),
    creator: raw.creator?.nickname || raw.creator?.name || '',
    playCount: Number(raw.playCount || 0),
    tracks: Array.isArray(raw.tracks)
      ? raw.tracks.map(normalizeSong).filter((song) => song.id)
      : [],
  }
}

async function getDailySongs() {
  if (store.cookie) {
    try {
      const body = await apiCall('recommend_songs')
      const songs = body.data?.dailySongs || body.recommend || []
      if (songs.length) return songs.map(normalizeSong)
    } catch {
      // Fall back to public recommendations.
    }
  }

  const body = await apiCall('personalized_newsong', { limit: 30 })
  return (body.result || []).map(normalizeSong).filter((song) => song.id)
}

async function getRoamSongs(limit = 8) {
  const requestCount = Math.max(4, Math.min(16, limit * 2))
  const responses = await Promise.allSettled(
    Array.from({ length: requestCount }, () => apiCall('personal_fm')),
  )

  const tracks = []
  const seen = new Set()
  for (const response of responses) {
    if (response.status !== 'fulfilled') continue
    for (const item of response.value.data || []) {
      const track = normalizeSong(item)
      if (!track.id || seen.has(track.id)) continue
      seen.add(track.id)
      tracks.push(track)
      if (tracks.length >= limit) return tracks
    }
  }

  if (tracks.length) return tracks
  return getDailySongs()
}

async function getLibrary() {
  const profile = await getProfile()
  let playlists = []
  let recent = []

  if (profile) {
    try {
      const body = await apiCall('user_playlist', {
        uid: profile.id,
        limit: 50,
      })
      playlists = (body.playlist || []).map(normalizePlaylist)
    } catch {
      playlists = []
    }

    try {
      const body = await apiCall('user_record', {
        uid: profile.id,
        type: 1,
      })
      recent = (body.allData || [])
        .slice(0, 16)
        .map((entry) => normalizeSong(entry.song || entry.data))
        .filter((song) => song.id)
    } catch {
      recent = []
    }
  }

  return {
    profile,
    playlists,
    recent,
    daily: await getDailySongs().catch(() => []),
  }
}

function registerIpc() {
  ipcMain.handle('app:bootstrap', async () => {
    const [profile, roam] = await Promise.all([
      getProfile(),
      getRoamSongs(8).catch(() => []),
    ])
    return {
      profile,
      volume: store.volume,
      roam,
    }
  })

  ipcMain.handle('music:daily', async () => getDailySongs())
  ipcMain.handle('music:roam', async (_event, limit) => {
    const count = Math.max(1, Math.min(12, Number(limit) || 8))
    return getRoamSongs(count)
  })
  ipcMain.handle('music:library', async () => getLibrary())

  ipcMain.handle('music:search', async (_event, query) => {
    const keywords = String(query || '').trim().slice(0, 80)
    if (!keywords) return { songs: [], playlists: [] }

    const [songBody, playlistBody] = await Promise.all([
      apiCall('search', { keywords, type: 1, limit: 40 }),
      apiCall('search', { keywords, type: 1000, limit: 12 }).catch(() => ({
        result: {},
      })),
    ])

    return {
      songs: (songBody.result?.songs || [])
        .map(normalizeSong)
        .filter((song) => song.id),
      playlists: (playlistBody.result?.playlists || []).map(normalizePlaylist),
    }
  })

  ipcMain.handle('music:playlist', async (_event, id) => {
    const playlistId = Number(id)
    if (!Number.isSafeInteger(playlistId) || playlistId <= 0) {
      throw new Error('歌单编号无效')
    }

    const body = await apiCall('playlist_detail', { id: playlistId })
    const playlist = normalizePlaylist(body.playlist)
    if (!playlist) throw new Error('没有找到这个歌单')

    if (!playlist.tracks.length) {
      const tracksBody = await apiCall('playlist_track_all', {
        id: playlistId,
        limit: 1000,
      })
      playlist.tracks = (tracksBody.songs || [])
        .map(normalizeSong)
        .filter((song) => song.id)
    }

    return playlist
  })

  ipcMain.handle('music:url', async (_event, id) => {
    const songId = Number(id)
    if (!Number.isSafeInteger(songId) || songId <= 0) {
      throw new Error('歌曲编号无效')
    }

    const levels = ['jymaster', 'hires', 'lossless', 'exhigh', 'standard']
    let trialFallback = null

    for (const level of levels) {
      let item
      try {
        const body = await apiCall('song_url_v1', { id: songId, level })
        item = body.data?.[0]
      } catch {
        continue
      }

      if (!item?.url) continue

      const result = {
        url: String(item.url).replace(/^http:\/\//i, 'https://'),
        type: item.type || 'mp3',
        bitrate: Number(item.br || 0),
        size: Number(item.size || 0),
        level: item.level || level,
        limited: Boolean(item.freeTrialInfo),
        trial: item.freeTrialInfo || null,
      }

      if (!result.limited) return result
      trialFallback ||= result
    }

    return (
      trialFallback || {
        url: '',
        limited: true,
        reason: '当前账号没有这首歌的可用音源',
      }
    )
  })

  ipcMain.handle('music:lyric', async (_event, id) => {
    const body = await apiCall('lyric', { id: Number(id) })
    return {
      lrc: body.lrc?.lyric || '',
      translated: body.tlyric?.lyric || '',
      romaji: body.romalrc?.lyric || '',
    }
  })

  ipcMain.handle('music:like-state', async (_event, id) => {
    if (!store.cookie) return { liked: false, loggedIn: false }
    try {
      const body = await apiCall('song_like_check', { ids: String(Number(id)) })
      return {
        liked: Boolean(body.data ?? body.liked ?? false),
        loggedIn: true,
      }
    } catch {
      return { liked: false, loggedIn: false }
    }
  })

  ipcMain.handle('music:like', async (_event, id, liked) => {
    if (!store.cookie) throw new Error('登录后才能收藏歌曲')
    const body = await apiCall('like', {
      id: Number(id),
      like: Boolean(liked),
    })
    if (body.code !== 200) throw new Error(body.message || '收藏失败')
    return { liked: Boolean(liked) }
  })

  ipcMain.handle('auth:logout', async () => {
    try {
      await apiCall('logout')
    } catch {
      // Clearing local state is still useful if the remote request fails.
    }
    store.cookie = ''
    saveStore()
    return { ok: true }
  })

  ipcMain.handle('auth:web-login', async () => {
    if (webLoginTask) {
      return webLoginTask
    }

    webLoginTask = new Promise(async (resolve) => {
      const officialSession = session.fromPartition(
        'persist:yunqi-official-login',
      )
      await officialSession.clearStorageData({
        storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage'],
      }).catch(() => {})

      const loginWindow = new BrowserWindow({
        width: 480,
        height: 740,
        minWidth: 420,
        minHeight: 620,
        parent: mainWindow || undefined,
        show: false,
        autoHideMenuBar: true,
        title: '登录网易云音乐',
        backgroundColor: '#ffffff',
        icon: path.join(__dirname, '..', '..', 'build', 'icon.ico'),
        webPreferences: {
          partition: 'persist:yunqi-official-login',
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      })

      loginWindow.webContents.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      )
      loginWindow.webContents.setWindowOpenHandler(({ url }) => {
        try {
          const parsed = new URL(url)
          if (
            parsed.protocol === 'https:' &&
            (parsed.hostname === 'music.163.com' ||
              parsed.hostname.endsWith('.music.163.com') ||
              parsed.hostname.endsWith('.163.com'))
          ) {
            loginWindow.loadURL(parsed.href)
          }
        } catch {
          // Ignore malformed URLs.
        }
        return { action: 'deny' }
      })

      let settled = false
      let finishing = false

      const scanCookies = async () => {
        if (settled || finishing || loginWindow.isDestroyed()) return

        const cookies = await officialSession.cookies.get({})
        const musicU = cookies.find((cookie) => cookie.name === 'MUSIC_U')
        if (!musicU?.value) return

        finishing = true
        try {
          const cookie = cleanCookie(
            cookies
              .filter((item) => item.domain?.includes('163.com'))
              .map((item) => `${item.name}=${item.value}`),
          )
          if (!cookie) return

          store.cookie = cookie
          const profile = await getProfile()
          if (!profile) {
            store.cookie = ''
            return
          }

          saveStore()
          settled = true
          resolve({ ok: true, profile })
          if (!loginWindow.isDestroyed()) loginWindow.close()
        } finally {
          finishing = false
        }
      }

      const onCookieChanged = () => scanCookies().catch(() => {})
      officialSession.cookies.on('changed', onCookieChanged)
      const cookiePoll = setInterval(
        () => scanCookies().catch(() => {}),
        1000,
      )

      loginWindow.once('ready-to-show', () => loginWindow.show())
      loginWindow.on('closed', () => {
        clearInterval(cookiePoll)
        officialSession.cookies.removeListener('changed', onCookieChanged)
        if (!settled) resolve({ ok: false, cancelled: true })
      })

      try {
        await loginWindow.loadURL('https://music.163.com/#/login')
      } catch (error) {
        if (settled) return
        settled = true
        resolve({
          ok: false,
          error: `无法打开网易云官方登录页面：${error.message}`,
        })
        if (!loginWindow.isDestroyed()) loginWindow.destroy()
      }
    }).finally(() => {
      webLoginTask = null
    })

    return webLoginTask
  })

  ipcMain.handle('app:remember-track', (_event, track) => {
    if (!track || !Number.isSafeInteger(Number(track.id))) return
    store.lastTrack = { ...track, id: Number(track.id) }
    saveStore()
  })

  ipcMain.handle('app:set-volume', (_event, volume) => {
    const value = Math.max(0, Math.min(1, Number(volume) || 0))
    store.volume = value
    saveStore()
  })

  ipcMain.handle('updates:check', async () => checkForUpdate())
  ipcMain.handle('updates:install', async (_event, update) => {
    if (!update?.available || !update.assetUrl || !update.sha256) {
      throw new Error('更新信息无效')
    }
    return installUpdate(update)
  })
  ipcMain.handle('app:version', () => app.getVersion())

  ipcMain.handle('art:palette-source', async (_event, url) => {
    let parsed
    try {
      parsed = new URL(String(url))
    } catch {
      return ''
    }

    if (
      parsed.protocol !== 'https:' ||
      !(parsed.hostname === 'music.126.net' ||
        parsed.hostname.endsWith('.music.126.net'))
    ) {
      return ''
    }

    if (imageCache.has(parsed.href)) return imageCache.get(parsed.href)

    const response = await fetch(parsed.href, {
      headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg' },
    })
    if (!response.ok) return ''

    const contentType = response.headers.get('content-type') || 'image/jpeg'
    if (!contentType.startsWith('image/')) return ''

    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > 5 * 1024 * 1024) return ''

    const dataUrl = `data:${contentType};base64,${bytes.toString('base64')}`
    imageCache.set(parsed.href, dataUrl)
    if (imageCache.size > 28) {
      imageCache.delete(imageCache.keys().next().value)
    }
    return dataUrl
  })

  ipcMain.handle('shell:external', async (_event, url) => {
    try {
      const parsed = new URL(String(url))
      if (
        parsed.protocol === 'https:' &&
        (parsed.hostname === 'music.163.com' ||
          parsed.hostname.endsWith('.music.163.com'))
      ) {
        await shell.openExternal(parsed.href)
      }
    } catch {
      // Ignore malformed links.
    }
  })
}

function createWindow() {
  const saved = store.windowBounds
  mainWindow = new BrowserWindow({
    width: saved?.width || 1440,
    height: saved?.height || 900,
    x: saved?.x,
    y: saved?.y,
    minWidth: 1040,
    minHeight: 700,
    show: false,
    frame: false,
    title: '云栖音乐',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.ico'),
    backgroundColor: '#090a0d',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    if (process.env.YUNQI_CAPTURE_PATH) {
      const delay = Number(process.env.YUNQI_CAPTURE_DELAY_MS || 6500)
      setTimeout(async () => {
        if (!mainWindow) return
        const image = await mainWindow.webContents.capturePage()
        fs.mkdirSync(path.dirname(path.resolve(process.env.YUNQI_CAPTURE_PATH)), {
          recursive: true,
        })
        fs.writeFileSync(
          path.resolve(process.env.YUNQI_CAPTURE_PATH),
          image.toPNG(),
        )
        app.quit()
      }, delay)
    }
  })

  if (process.env.YUNQI_CAPTURE_PATH) {
    mainWindow.webContents.on('console-message', (_event, details) => {
      const message =
        typeof details === 'object' ? details.message : String(details)
      console.log(`[renderer] ${message}`)
    })
    mainWindow.webContents.on(
      'did-fail-load',
      (_event, code, description) => {
        console.error(`[renderer] load failed ${code}: ${description}`)
      },
    )
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (
        parsed.protocol === 'https:' &&
        parsed.hostname.endsWith('music.163.com')
      ) {
        shell.openExternal(url)
      }
    } catch {
      // Block malformed URLs.
    }
    return { action: 'deny' }
  })

  const emitWindowState = () => {
    if (!mainWindow) return
    mainWindow.webContents.send('window:state', {
      maximized: mainWindow.isMaximized(),
      focused: mainWindow.isFocused(),
    })
  }

  mainWindow.on('maximize', emitWindowState)
  mainWindow.on('unmaximize', emitWindowState)
  mainWindow.on('focus', emitWindowState)
  mainWindow.on('blur', emitWindowState)
  mainWindow.on('close', () => {
    if (!mainWindow) return
    store.windowBounds = mainWindow.getBounds()
    saveStore()
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.yunqi.music')
  loadStore()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:toggle-maximize', () => {
  if (!mainWindow) return
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
})
ipcMain.on('window:close', () => mainWindow?.close())
