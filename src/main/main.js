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
const { createKugouAdapter } = require('./kugou')
const { createQqAdapter } = require('./qq')
const { createQishuiAdapter } = require('./qishui')

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
  cookies: {
    netease: '',
    kugou: '',
    qq: '',
  },
  primaryProvider: 'netease',
  secondaryEnabled: true,
  kugouDevice: null,
  qishuiDeviceId: null,
  qishuiSession: null,
  lastTrack: null,
  windowBounds: null,
  loudnessEnabled: true,
  equalizerEnabled: true,
  equalizerBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
}
const imageCache = new Map()
let kugouProvider = null
let qqProvider = null
let qishuiProvider = null

function statePath() {
  return path.join(app.getPath('userData'), 'yunqi-state.json')
}

function decryptStoredCookie(raw) {
  if (typeof raw.cookie === 'string') return raw.cookie
  if (
    typeof raw.cookieEncrypted === 'string' &&
    safeStorage.isEncryptionAvailable()
  ) {
    try {
      return safeStorage.decryptString(
        Buffer.from(raw.cookieEncrypted, 'base64'),
      )
    } catch {
      return ''
    }
  }
  return ''
}

function decryptStoredSecrets(raw) {
  if (raw.secrets && typeof raw.secrets === 'object') return raw.secrets
  if (
    typeof raw.secretsEncrypted === 'string' &&
    safeStorage.isEncryptionAvailable()
  ) {
    try {
      const decoded = JSON.parse(
        safeStorage.decryptString(
          Buffer.from(raw.secretsEncrypted, 'base64'),
        ),
      )
      if (decoded && typeof decoded === 'object') return decoded
    } catch {
      // Fall through to the previous cookie-only encrypted format.
    }
  }
  if (
    typeof raw.cookiesEncrypted === 'string' &&
    safeStorage.isEncryptionAvailable()
  ) {
    try {
      const decoded = JSON.parse(
        safeStorage.decryptString(
          Buffer.from(raw.cookiesEncrypted, 'base64'),
        ),
      )
      if (decoded && typeof decoded === 'object') {
        return { cookies: decoded }
      }
    } catch {
      // Fall back to the original single-cookie format.
    }
  }
  return null
}

function loadStore() {
  try {
    const raw = JSON.parse(fs.readFileSync(statePath(), 'utf8'))
    const legacyCookie = decryptStoredCookie(raw)
    const secrets = decryptStoredSecrets(raw)
    const storedCookies = secrets?.cookies || secrets || null
    store = {
      ...store,
      ...raw,
      cookies: {
        netease:
          storedCookies?.netease ||
          legacyCookie ||
          '',
        kugou: storedCookies?.kugou || '',
        qq: storedCookies?.qq || '',
        qishui: '',
      },
      primaryProvider:
        ['netease', 'kugou', 'qq', 'qishui'].includes(raw.primaryProvider)
          ? raw.primaryProvider
          : 'netease',
      secondaryEnabled: raw.secondaryEnabled !== false,
      kugouDevice:
        raw.kugouDevice && typeof raw.kugouDevice === 'object'
          ? raw.kugouDevice
          : null,
      qishuiDeviceId:
        secrets?.qishuiDeviceId || raw.qishuiDeviceId || null,
      qishuiSession:
        secrets?.qishuiSession || raw.qishuiSession || null,
      equalizerBands:
        Array.isArray(raw.equalizerBands) && raw.equalizerBands.length === 10
          ? raw.equalizerBands.map((value) =>
              Math.max(-12, Math.min(12, Number(value) || 0)),
            )
          : store.equalizerBands,
    }
    delete store.cookieEncrypted
    delete store.cookiesEncrypted
    delete store.secretsEncrypted
    delete store.secrets
    delete store.cookie
  } catch {
    // First launch or an unreadable settings file.
  }
}

function saveStore() {
  const payload = {
    lastTrack: store.lastTrack,
    windowBounds: store.windowBounds,
    loudnessEnabled: store.loudnessEnabled,
    equalizerEnabled: store.equalizerEnabled,
    equalizerBands: store.equalizerBands,
    primaryProvider: store.primaryProvider,
    secondaryEnabled: store.secondaryEnabled,
    kugouDevice: store.kugouDevice,
  }

  const secrets = {
    cookies: store.cookies,
    qishuiDeviceId: store.qishuiDeviceId,
    qishuiSession: store.qishuiSession,
  }
  if (safeStorage.isEncryptionAvailable()) {
    payload.secretsEncrypted = safeStorage
      .encryptString(JSON.stringify(secrets))
      .toString('base64')
  } else {
    payload.secrets = secrets
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
    cookie: store.cookies.netease,
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

async function getNeteaseProfile() {
  if (!store.cookies.netease) return null

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

function initializeProviderAdapters() {
  kugouProvider = createKugouAdapter({
    getCookie: () => store.cookies.kugou,
    getDevice: () => store.kugouDevice,
    setDevice: (device) => {
      store.kugouDevice = device
      saveStore()
    },
    setCookie: (cookie) => {
      store.cookies.kugou = cookie
      saveStore()
    },
  })
  qqProvider = createQqAdapter({
    getCookie: () => store.cookies.qq,
    setCookie: (cookie) => {
      store.cookies.qq = cookie
      saveStore()
    },
  })
  qishuiProvider = createQishuiAdapter({
    getDeviceId: () => store.qishuiDeviceId,
    setDeviceId: (deviceId) => {
      store.qishuiDeviceId = deviceId
      saveStore()
    },
    getSession: () => store.qishuiSession,
    setSession: (qishuiSession) => {
      store.qishuiSession = qishuiSession
      saveStore()
    },
  })
}

function normalizeArtwork(url) {
  if (!url) return ''
  return String(url)
    .replace(/^http:\/\//i, 'https://')
    .replace(/\?.*$/, '?param=900y900')
}

function normalizeNeteaseSong(raw) {
  const song = raw?.song || raw?.track || raw || {}
  const album = song.album || song.al || raw?.album || {}
  const artists = song.artists || song.ar || raw?.artists || []
  const providerId = String(song.id || raw?.id || '')

  return {
    id: `netease:${providerId}`,
    provider: 'netease',
    providerId,
    providerData: { id: providerId },
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

function normalizeNeteasePlaylist(raw) {
  if (!raw) return null
  const providerId = String(raw.id)
  return {
    id: `netease:${providerId}`,
    provider: 'netease',
    providerId,
    providerData: { id: providerId },
    name: raw.name || '未命名歌单',
    cover: normalizeArtwork(raw.coverImgUrl || raw.picUrl),
    description: raw.description || '',
    trackCount: Number(raw.trackCount || raw.tracks?.length || 0),
    creator: raw.creator?.nickname || raw.creator?.name || '',
    playCount: Number(raw.playCount || 0),
    tracks: Array.isArray(raw.tracks)
      ? raw.tracks.map(normalizeNeteaseSong).filter((song) => song.id)
      : [],
  }
}

async function getDailySongs() {
  if (store.cookies.netease) {
    try {
      const body = await apiCall('recommend_songs')
      const songs = body.data?.dailySongs || body.recommend || []
      if (songs.length) return songs.map(normalizeNeteaseSong)
    } catch {
      // Fall back to public recommendations.
    }
  }

  const body = await apiCall('personalized_newsong', { limit: 30 })
  return (body.result || [])
    .map(normalizeNeteaseSong)
    .filter((song) => song.id)
}

async function getNeteaseRoamSongs(limit = 8) {
  const requestCount = Math.max(4, Math.min(16, limit * 2))
  const responses = await Promise.allSettled(
    Array.from({ length: requestCount }, () => apiCall('personal_fm')),
  )

  const tracks = []
  const seen = new Set()
  for (const response of responses) {
    if (response.status !== 'fulfilled') continue
    for (const item of response.value.data || []) {
      const track = normalizeNeteaseSong(item)
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
  if (store.primaryProvider === 'qishui') {
    const library = await qishuiProvider.getLibrary()
    return {
      ...library,
      provider: 'qishui',
    }
  }

  if (store.primaryProvider === 'qq') {
    const library = await qqProvider.getLibrary()
    return {
      ...library,
      provider: 'qq',
    }
  }

  if (store.primaryProvider === 'kugou') {
    const library = await kugouProvider.getLibrary()
    return {
      ...library,
      provider: 'kugou',
    }
  }

  const profile = await getNeteaseProfile()
  let playlists = []
  let recent = []

  if (profile) {
    try {
      const body = await apiCall('user_playlist', {
        uid: profile.id,
        limit: 50,
      })
      playlists = (body.playlist || []).map(normalizeNeteasePlaylist)
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
        .map((entry) => normalizeNeteaseSong(entry.song || entry.data))
        .filter((song) => song.id)
    } catch {
      recent = []
    }
  }

  return {
    profile,
    provider: 'netease',
    playlists,
    recent,
    daily: await getDailySongs().catch(() => []),
  }
}

async function getNeteaseSongUrl(track) {
  const levels = ['jymaster', 'hires', 'lossless', 'exhigh', 'standard']
  let trialFallback = null

  for (const level of levels) {
    let item
    try {
      const body = await apiCall('song_url_v1', {
        id: Number(track.providerId),
        level,
      })
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
      gain: Number(item.gain || 0),
      peak: Number(item.peak || 0),
      closedGain: Number(item.closedGain || 0),
      limited: Boolean(item.freeTrialInfo),
      trial: item.freeTrialInfo || null,
      sourceProvider: 'netease',
    }
    if (!result.limited) return result
    trialFallback ||= result
  }

  return (
    trialFallback || {
      url: '',
      limited: true,
      sourceProvider: 'netease',
      reason: '当前账号没有这首歌的可用音源',
    }
  )
}

async function searchProvider(provider, keywords) {
  if (provider === 'kugou') return kugouProvider.search(keywords)
  if (provider === 'qq') return qqProvider.search(keywords)
  if (provider === 'qishui') return qishuiProvider.search(keywords)
  const body = await apiCall('search', {
    keywords,
    type: 1,
    limit: 40,
  })
  return (body.result?.songs || [])
    .map(normalizeNeteaseSong)
    .filter((song) => song.id)
}

function normalizedMatchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\([^)]*\)|（[^）]*）|\[[^\]]*\]/g, '')
    .replace(/[\s\-_.·,，/]/g, '')
}

async function findFallbackTrack(track, provider) {
  const keywords = `${track.name} ${track.artists?.[0] || ''}`.trim()
  const candidates = await searchProvider(provider, keywords).catch(() => [])
  const title = normalizedMatchText(track.name)
  const artist = normalizedMatchText(track.artists?.[0])
  return (
    candidates.find((candidate) => {
      const candidateTitle = normalizedMatchText(candidate.name)
      const candidateArtist = normalizedMatchText(candidate.artists?.[0])
      return (
        candidateTitle === title &&
        (!artist ||
          (candidateArtist &&
            (candidateArtist.includes(artist) ||
              artist.includes(candidateArtist))))
      )
    }) || null
  )
}

async function getProviderSongUrl(track) {
  let direct
  if (track.provider === 'kugou') direct = await kugouProvider.songUrl(track)
  else if (track.provider === 'qq') direct = await qqProvider.songUrl(track)
  else if (track.provider === 'qishui') direct = await qishuiProvider.songUrl(track)
  else direct = await getNeteaseSongUrl(track)
  if (direct?.url && !direct.limited) return direct

  if (
    store.secondaryEnabled &&
    track.provider === store.primaryProvider
  ) {
    const secondaries = ['netease', 'kugou', 'qq', 'qishui'].filter(
      (provider) => provider !== store.primaryProvider,
    )
    for (const secondary of secondaries) {
      const fallbackTrack = await findFallbackTrack(track, secondary)
      if (!fallbackTrack) continue
      let fallback
      if (secondary === 'kugou') {
        fallback = await kugouProvider.songUrl(fallbackTrack)
      } else if (secondary === 'qq') {
        fallback = await qqProvider.songUrl(fallbackTrack)
      } else if (secondary === 'qishui') {
        fallback = await qishuiProvider.songUrl(fallbackTrack)
      } else {
        fallback = await getNeteaseSongUrl(fallbackTrack)
      }
      if (fallback?.url) {
        return { ...fallback, fallbackUsed: true }
      }
    }
  }

  return direct
}

async function getProviderProfiles() {
  const [netease, kugou, qq, qishui] = await Promise.all([
    getNeteaseProfile().catch(() => null),
    kugouProvider.getProfile().catch(() => null),
    qqProvider.getProfile().catch(() => null),
    qishuiProvider.getProfile().catch(() => null),
  ])
  return { netease, kugou, qq, qishui }
}

function registerIpc() {
  ipcMain.handle('app:bootstrap', async () => {
    const [profiles, roam] = await Promise.all([
      getProviderProfiles(),
      (
        store.primaryProvider === 'kugou'
          ? kugouProvider.roam(8)
          : store.primaryProvider === 'qq'
            ? qqProvider.roam(8)
            : store.primaryProvider === 'qishui'
              ? qishuiProvider.roam(8)
              : getNeteaseRoamSongs(8)
      ).catch(() => []),
    ])
    return {
      profile: profiles[store.primaryProvider],
      profiles,
      primaryProvider: store.primaryProvider,
      secondaryEnabled: store.secondaryEnabled,
      roam,
      audio: {
        loudnessEnabled: store.loudnessEnabled,
        equalizerEnabled: store.equalizerEnabled,
        equalizerBands: store.equalizerBands,
      },
    }
  })

  ipcMain.handle('music:daily', async () => getDailySongs())
  ipcMain.handle('music:roam', async (_event, limit) => {
    const count = Math.max(1, Math.min(12, Number(limit) || 8))
    return (
      store.primaryProvider === 'kugou'
        ? kugouProvider.roam(count)
        : store.primaryProvider === 'qq'
          ? qqProvider.roam(count)
          : store.primaryProvider === 'qishui'
            ? qishuiProvider.roam(count)
            : getNeteaseRoamSongs(count)
    )
  })
  ipcMain.handle('music:library', async () => getLibrary())

  ipcMain.handle('music:search', async (_event, query) => {
    const keywords = String(query || '').trim().slice(0, 80)
    if (!keywords) return { songs: [], playlists: [] }

    const secondaryProviders = store.secondaryEnabled
      ? ['netease', 'kugou', 'qq', 'qishui'].filter(
          (provider) => provider !== store.primaryProvider,
        )
      : []
    const [primarySongs, ...secondaryResults] = await Promise.all([
      searchProvider(store.primaryProvider, keywords).catch(() => []),
      ...secondaryProviders.map((provider) =>
        searchProvider(provider, keywords).catch(() => []),
      ),
    ])
    const [playlistBody] = await Promise.all([
      (
        store.primaryProvider === 'kugou'
          ? kugouProvider.searchPlaylists(keywords)
          : store.primaryProvider === 'qq'
            ? qqProvider.searchPlaylists(keywords)
            : store.primaryProvider === 'qishui'
              ? qishuiProvider.searchPlaylists(keywords)
            : apiCall('search', {
                keywords,
                type: 1000,
                limit: 12,
              }).then((body) =>
                (body.result?.playlists || []).map(normalizeNeteasePlaylist),
              )
      ).catch(() => []),
    ])

    return {
      songs: [primarySongs, ...secondaryResults].flat(),
      playlists: (playlistBody || []).filter(Boolean),
    }
  })

  ipcMain.handle('music:playlist', async (_event, unifiedId) => {
    const [provider, ...idParts] = String(unifiedId || '').split(':')
    const playlistId = idParts.join(':')
    if (!['netease', 'kugou', 'qq', 'qishui'].includes(provider) || !playlistId) {
      throw new Error('歌单编号无效')
    }

    if (provider === 'kugou') {
      const playlist = await kugouProvider.getPlaylist(playlistId)
      if (!playlist) throw new Error('没有找到这个歌单')
      return playlist
    }
    if (provider === 'qq') {
      const playlist = await qqProvider.getPlaylist(playlistId)
      if (!playlist) throw new Error('没有找到这个歌单')
      return playlist
    }
    if (provider === 'qishui') {
      const playlist = await qishuiProvider.getPlaylist(playlistId)
      if (!playlist) throw new Error('没有找到这个歌单')
      return playlist
    }

    const body = await apiCall('playlist_detail', { id: Number(playlistId) })
    const playlist = normalizeNeteasePlaylist(body.playlist)
    if (!playlist) throw new Error('没有找到这个歌单')

    if (!playlist.tracks.length) {
      const tracksBody = await apiCall('playlist_track_all', {
        id: Number(playlistId),
        limit: 1000,
      })
      playlist.tracks = (tracksBody.songs || [])
        .map(normalizeNeteaseSong)
        .filter((song) => song.id)
    }

    return playlist
  })

  ipcMain.handle('music:url', async (_event, track) => {
    if (!track?.provider || !track?.providerId) {
      throw new Error('歌曲编号无效')
    }
    return getProviderSongUrl(track)
  })

  ipcMain.handle('music:lyric', async (_event, track) => {
    if (!track?.provider || !track?.providerId) {
      return { lrc: '', translated: '', romaji: '' }
    }
    if (track.provider === 'kugou') {
      return kugouProvider.getLyric(track)
    }
    if (track.provider === 'qq') {
      return qqProvider.getLyric(track)
    }
    if (track.provider === 'qishui') {
      return qishuiProvider.getLyric(track)
    }
    const body = await apiCall('lyric', { id: Number(track.providerId) })
    return {
      lrc: body.lrc?.lyric || '',
      translated: body.tlyric?.lyric || '',
      romaji: body.romalrc?.lyric || '',
    }
  })

  ipcMain.handle('music:like-state', async (_event, track) => {
    if (track.provider === 'kugou') {
      return kugouProvider.getLikeState(track)
    }
    if (track.provider === 'qq') {
      return { liked: false, loggedIn: Boolean(store.cookies.qq) }
    }
    if (track.provider === 'qishui') {
      return qishuiProvider.getLikeState(track)
    }
    if (!store.cookies.netease) return { liked: false, loggedIn: false }
    try {
      const body = await apiCall('song_like_check', {
        ids: String(Number(track.providerId)),
      })
      return {
        liked: Boolean(body.data ?? body.liked ?? false),
        loggedIn: true,
      }
    } catch {
      return { liked: false, loggedIn: false }
    }
  })

  ipcMain.handle('music:like', async (_event, track, liked) => {
    if (track.provider === 'kugou') {
      return kugouProvider.setLike(track, Boolean(liked))
    }
    if (track.provider === 'qq') {
      throw new Error('QQ 音乐收藏接口暂未接入')
    }
    if (track.provider === 'qishui') {
      return qishuiProvider.setLike(track, Boolean(liked))
    }
    if (!store.cookies.netease) throw new Error('登录后才能收藏歌曲')
    const body = await apiCall('like', {
      id: Number(track.providerId),
      like: Boolean(liked),
    })
    if (body.code !== 200) throw new Error(body.message || '收藏失败')
    return { liked: Boolean(liked) }
  })

  ipcMain.handle('auth:logout', async (_event, provider = store.primaryProvider) => {
    if (provider === 'netease') {
      try {
        await apiCall('logout')
      } catch {
        // Clearing local state is still useful if the remote request fails.
      }
      store.cookies.netease = ''
    } else if (provider === 'kugou') {
      store.cookies.kugou = ''
    } else if (provider === 'qq') {
      store.cookies.qq = ''
    } else if (provider === 'qishui') {
      await qishuiProvider.logout().catch(() => {})
    }
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

          store.cookies.netease = cookie
          const profile = await getNeteaseProfile()
          if (!profile) {
            store.cookies.netease = ''
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

  ipcMain.handle('platforms:set-primary', async (_event, provider) => {
    if (!['netease', 'kugou', 'qq', 'qishui'].includes(provider)) {
      throw new Error('不支持的音乐平台')
    }
    store.primaryProvider = provider
    saveStore()
    return {
      primaryProvider: store.primaryProvider,
      profiles: await getProviderProfiles(),
    }
  })

  ipcMain.handle('platforms:set-secondary-enabled', (_event, enabled) => {
    store.secondaryEnabled = Boolean(enabled)
    saveStore()
    return { secondaryEnabled: store.secondaryEnabled }
  })

  ipcMain.handle('auth:kugou-qr-start', async () => {
    if (!kugouProvider) initializeProviderAdapters()
    return kugouProvider.startQrLogin()
  })

  ipcMain.handle('auth:kugou-qr-check', async () => {
    if (!kugouProvider) initializeProviderAdapters()
    return kugouProvider.checkQrLogin()
  })

  ipcMain.handle('auth:qq-qr-start', async () => {
    if (!qqProvider) initializeProviderAdapters()
    return qqProvider.startQrLogin()
  })

  ipcMain.handle('auth:qq-qr-check', async () => {
    if (!qqProvider) initializeProviderAdapters()
    return qqProvider.checkQrLogin()
  })

  ipcMain.handle('auth:qishui-qr-start', async () => {
    if (!qishuiProvider) initializeProviderAdapters()
    return qishuiProvider.startQrLogin()
  })

  ipcMain.handle('auth:qishui-qr-check', async () => {
    if (!qishuiProvider) initializeProviderAdapters()
    return qishuiProvider.checkQrLogin()
  })

  ipcMain.handle('app:remember-track', (_event, track) => {
    if (!track?.id || !track?.provider || !track?.providerId) return
    store.lastTrack = { ...track }
    saveStore()
  })

  ipcMain.handle('app:set-audio-settings', (_event, settings = {}) => {
    if (typeof settings.loudnessEnabled === 'boolean') {
      store.loudnessEnabled = settings.loudnessEnabled
    }
    if (typeof settings.equalizerEnabled === 'boolean') {
      store.equalizerEnabled = settings.equalizerEnabled
    }
    if (
      Array.isArray(settings.equalizerBands) &&
      settings.equalizerBands.length === 10
    ) {
      store.equalizerBands = settings.equalizerBands.map((value) =>
        Math.max(-12, Math.min(12, Number(value) || 0)),
      )
    }
    saveStore()
    return {
      loudnessEnabled: store.loudnessEnabled,
      equalizerEnabled: store.equalizerEnabled,
      equalizerBands: store.equalizerBands,
    }
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
        parsed.hostname.endsWith('.music.126.net') ||
        parsed.hostname === 'kugou.com' ||
        parsed.hostname.endsWith('.kugou.com') ||
        parsed.hostname.endsWith('.kgimg.com'))
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
  initializeProviderAdapters()
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
