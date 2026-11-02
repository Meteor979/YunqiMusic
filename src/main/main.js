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
const QUALITY_LEVELS = new Set([
  'auto',
  'jymaster',
  'hires',
  'lossless',
  'exhigh',
  'higher',
  'standard',
])
const ROAM_MOODS = new Set([
  'random',
  'calm',
  'cafe',
  'jazz',
  'night',
  'rain',
  'electronic',
])
const ROAM_MOOD_QUERIES = {
  calm: '舒缓 放松 轻音乐',
  cafe: '咖啡屋 慵懒 城市',
  jazz: '爵士 Jazz',
  night: '深夜 夜晚 氛围',
  rain: '雨天 安静 氛围',
  electronic: '轻电子 Chill Electronic',
}
const directUrlCache = new Map()
const artistCache = new Map()
const artistAlbumsCache = new Map()
const libraryCache = new Map()
const albumCache = new Map()
const albumRequests = new Map()
const artistRequests = new Map()

let mainWindow = null
let webLoginTask = null
let qqWebLoginTask = null
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
  knownProfiles: {},
  cachedRoam: [],
  windowBounds: null,
  loudnessEnabled: true,
  equalizerEnabled: true,
  equalizerBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  qualityLevel: 'auto',
  roamMode: 'continuous',
  roamMood: 'random',
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
      qualityLevel: QUALITY_LEVELS.has(raw.qualityLevel)
        ? raw.qualityLevel
        : store.qualityLevel,
      roamMode:
        raw.roamMode === 'explore' ? 'explore' : 'continuous',
      roamMood: ROAM_MOODS.has(raw.roamMood) ? raw.roamMood : 'random',
      knownProfiles:
        raw.knownProfiles && typeof raw.knownProfiles === 'object'
          ? raw.knownProfiles
          : {},
      cachedRoam: Array.isArray(raw.cachedRoam) ? raw.cachedRoam : [],
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
    qualityLevel: store.qualityLevel,
    roamMode: store.roamMode,
    roamMood: store.roamMood,
    knownProfiles: store.knownProfiles,
    cachedRoam: store.cachedRoam,
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

function getProviderRoamTracks(provider, limit) {
  if (provider === 'kugou') return kugouProvider.roam(limit)
  if (provider === 'qq') return qqProvider.roam(limit)
  if (provider === 'qishui') return qishuiProvider.roam(limit)
  return getNeteaseRoamSongs(limit)
}

async function getMoodRoamTracks(provider, mood, limit) {
  const query = ROAM_MOOD_QUERIES[mood]
  if (!query) return getProviderRoamTracks(provider, limit)
  const tracks = await searchProvider(provider, query).catch(() => [])
  if (tracks.length) return tracks.slice(0, limit)
  return getProviderRoamTracks(provider, limit)
}

async function getRoamTracks(
  limit = 8,
  mode = store.roamMode,
  mood = store.roamMood,
) {
  const count = Math.max(1, Math.min(20, Number(limit) || 8))
  const selectedMood = ROAM_MOODS.has(mood) ? mood : 'random'
  if (mode !== 'explore') {
    return selectedMood === 'random'
      ? getProviderRoamTracks(store.primaryProvider, count)
      : getMoodRoamTracks(store.primaryProvider, selectedMood, count)
  }

  const providers = store.secondaryEnabled
    ? [
        store.primaryProvider,
        ...['netease', 'kugou', 'qq', 'qishui'].filter(
          (provider) => provider !== store.primaryProvider,
        ),
      ]
    : [store.primaryProvider]
  const responses = await Promise.allSettled(
    providers.map((provider) =>
      selectedMood === 'random'
        ? getProviderRoamTracks(
            provider,
            Math.max(4, Math.ceil(count / Math.min(2, providers.length))),
          )
        : getMoodRoamTracks(
            provider,
            selectedMood,
            Math.max(4, Math.ceil(count / Math.min(2, providers.length))),
          ),
    ),
  )
  const batches = responses
    .filter((response) => response.status === 'fulfilled')
    .map((response) => response.value || [])
  const tracks = []
  const seen = new Set()
  const largestBatch = Math.max(0, ...batches.map((batch) => batch.length))

  for (let index = 0; index < largestBatch && tracks.length < count; index += 1) {
    for (const batch of batches) {
      const track = batch[index]
      if (!track?.id) continue
      const key = `${normalizedMatchText(track.name)}|${normalizedMatchText(track.artists?.[0])}`
      if (seen.has(key)) continue
      seen.add(key)
      tracks.push(track)
      if (tracks.length >= count) break
    }
  }

  if (tracks.length) return tracks
  return selectedMood === 'random'
    ? getProviderRoamTracks(store.primaryProvider, count)
    : getMoodRoamTracks(store.primaryProvider, selectedMood, count)
}

function decorateLibrary(library, provider) {
  const seen = new Set()
  const likedTracks = (library.likedTracks || []).filter((track) => {
    if (!track?.id || seen.has(track.id)) return false
    seen.add(track.id)
    return true
  })
  const profileName = library.profile?.name || ''
  return {
    ...library,
    provider,
    likedTracks,
    favoriteAlbums: albumsFromTracks(likedTracks, profileName),
    playlists: (library.playlists || []).filter(
      (playlist) => !/我喜欢|喜欢的音乐|默认收藏/.test(playlist.name || ''),
    ),
  }
}

async function loadLibrary() {
  if (store.primaryProvider === 'qishui') {
    const library = await qishuiProvider.getLibrary()
    return decorateLibrary({
      ...library,
      provider: 'qishui',
    }, 'qishui')
  }

  if (store.primaryProvider === 'qq') {
    const library = await qqProvider.getLibrary()
    return decorateLibrary({
      ...library,
      provider: 'qq',
    }, 'qq')
  }

  if (store.primaryProvider === 'kugou') {
    const library = await kugouProvider.getLibrary()
    return decorateLibrary({
      ...library,
      provider: 'kugou',
    }, 'kugou')
  }

  const profile = await getNeteaseProfile()
  let playlists = []
  let recent = []
  let likedTracks = []

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

    const likedPlaylist = playlists.find((playlist) =>
      /我喜欢|喜欢的音乐|默认收藏/.test(playlist.name),
    )
    if (likedPlaylist) {
      try {
        const body = await apiCall('playlist_track_all', {
          id: Number(likedPlaylist.providerId),
          limit: 1000,
        })
        likedTracks = (body.songs || [])
          .map(normalizeNeteaseSong)
          .filter((song) => song.id)
      } catch {
        likedTracks = []
      }
    }
  }

  return decorateLibrary({
    profile,
    provider: 'netease',
    playlists,
    recent,
    daily: await getDailySongs().catch(() => []),
    likedTracks,
  }, 'netease')
}

async function getLibrary({ force = false } = {}) {
  const cacheKey = store.primaryProvider
  const cached = libraryCache.get(cacheKey)
  if (!force && cached && cached.expiresAt > Date.now()) {
    return cached.value
  }
  const value = await loadLibrary()
  libraryCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + 3 * 60 * 1000,
  })
  return value
}

async function getNeteaseSongUrl(track, qualityLevel = 'auto') {
  const automaticLevels = [
    'jymaster',
    'hires',
    'lossless',
    'exhigh',
    'higher',
    'standard',
  ]
  const levels =
    qualityLevel === 'auto'
      ? automaticLevels
      : automaticLevels.slice(automaticLevels.indexOf(qualityLevel))
  if (!levels.length) levels.push('standard')
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

async function loadAlbum(track) {
  const albumName = String(track?.album || '').trim()
  if (!albumName) throw new Error('这首歌没有专辑信息')

  if (
    track.provider === 'netease' &&
    Number(track.albumId || track.providerData?.albumId)
  ) {
    const albumId = Number(track.albumId || track.providerData.albumId)
    const body = await apiCall('album', { id: albumId })
    const album = body.album || {}
    const tracks = (body.songs || [])
      .map(normalizeNeteaseSong)
      .filter((song) => song.id)
    return {
      id: `netease:album:${albumId}`,
      kind: 'album',
      provider: 'netease',
      providerId: String(albumId),
      name: album.name || albumName,
      cover: normalizeArtwork(album.picUrl || album.blurPicUrl),
      description: album.description || album.briefDesc || '',
      creator:
        album.artist?.name ||
        (album.artists || []).map((artist) => artist.name).filter(Boolean).join(' / ') ||
        track.artists?.join(' / ') ||
        '',
      trackCount: Number(album.size || tracks.length),
      tracks,
    }
  }

  const keywords = `${albumName} ${track.artists?.[0] || ''}`.trim()
  const songs = await searchProvider(track.provider, keywords)
  const expectedAlbum = normalizedMatchText(albumName)
  let tracks = songs.filter(
    (song) => normalizedMatchText(song.album) === expectedAlbum,
  )
  if (!tracks.length) {
    tracks = songs.filter((song) =>
      normalizedMatchText(song.album).includes(expectedAlbum),
    )
  }
  if (!tracks.length) throw new Error('没有找到这张专辑')

  return {
    id: `${track.provider}:album:${expectedAlbum}`,
    kind: 'album',
    provider: track.provider,
    providerId: expectedAlbum,
    name: tracks[0].album || albumName,
    cover: tracks[0].cover || track.cover || '',
    description: '',
    creator: track.artists?.join(' / ') || '',
    trackCount: tracks.length,
    tracks,
  }
}

async function getAlbum(track) {
  const albumName = String(track?.album || '').trim()
  if (!albumName) throw new Error('这首歌没有专辑信息')
  const albumId = String(
    track.albumId || track.providerData?.albumId || normalizedMatchText(albumName),
  )
  const cacheKey = `${track.provider}:${albumId}`
  const cached = albumCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  if (albumRequests.has(cacheKey)) return albumRequests.get(cacheKey)

  const request = loadAlbum(track)
    .then((value) => {
      albumCache.set(cacheKey, {
        value,
        expiresAt: Date.now() + 5 * 60 * 1000,
      })
      return value
    })
    .finally(() => albumRequests.delete(cacheKey))
  albumRequests.set(cacheKey, request)
  return request
}

function albumsFromTracks(tracks, artistName) {
  const albumMap = new Map()
  for (const song of tracks) {
    if (!song.album) continue
    const album = albumMap.get(song.album) || {
      id: `${song.provider}:album:${normalizedMatchText(song.album)}`,
      provider: song.provider,
      name: song.album,
      cover: song.cover,
      artist: artistName,
      heat: 0,
      sampleTrack: song,
    }
    album.heat += 1
    albumMap.set(song.album, album)
  }
  return [...albumMap.values()].sort(
    (left, right) => right.heat - left.heat,
  )
}

async function loadArtist(track) {
  const artistName = String(track?.artists?.[0] || '').trim()
  if (!artistName) throw new Error('这首歌没有歌手信息')
  const artistId = String(
    track.artistIds?.[0] || track.providerData?.artistId || '',
  )
  const cacheKey = `${track.provider}:${artistId || normalizedMatchText(artistName)}`
  const cached = artistCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  if (track.provider === 'netease' && artistId) {
    const [detail, songsBody] = await Promise.all([
      apiCall('artist_detail', { id: Number(artistId) }),
      apiCall('artist_songs', {
        id: Number(artistId),
        limit: 40,
        order: 'hot',
      }),
    ])
    const artist = detail.data?.artist || detail.artist || {}
    const tracks = (songsBody.songs || [])
      .map(normalizeNeteaseSong)
      .filter((song) => song.id)
    const result = {
      id: `netease:artist:${artistId}`,
      kind: 'artist',
      provider: 'netease',
      providerId: artistId,
      name: artist.name || artistName,
      avatar: normalizeArtwork(artist.avatar || artist.picUrl || artist.img1v1Url),
      bio: artist.briefDesc || artist.description || '',
      albumCount: Number(artist.albumSize || 0),
      trackCount: Number(artist.musicSize || tracks.length),
      followerCount: Number(artist.fansCount || 0),
      tracks,
      albums: albumsFromTracks(tracks, artist.name || artistName),
    }
    artistCache.set(cacheKey, {
      value: result,
      expiresAt: Date.now() + 5 * 60 * 1000,
    })
    return result
  }

  if (track.provider === 'qq') {
    const artist = await qqProvider.getArtist(track).catch(() => null)
    if (artist?.tracks?.length) {
      artist.albums = albumsFromTracks(artist.tracks, artist.name)
      artistCache.set(cacheKey, {
        value: artist,
        expiresAt: Date.now() + 5 * 60 * 1000,
      })
      return artist
    }
  }

  const songs = await searchProvider(track.provider, artistName)
  const expectedArtist = normalizedMatchText(artistName)
  const tracks = songs.filter((song) =>
    song.artists?.some((name) =>
      normalizedMatchText(name).includes(expectedArtist),
    ),
  )
  if (!tracks.length) throw new Error('没有找到这位歌手')
  const result = {
    id: `${track.provider}:artist:${expectedArtist}`,
    kind: 'artist',
    provider: track.provider,
    providerId: expectedArtist,
    name: artistName,
    avatar: tracks.find((song) => song.cover)?.cover || '',
    bio: '',
    albumCount: new Set(tracks.map((song) => song.album).filter(Boolean)).size,
    trackCount: tracks.length,
    followerCount: 0,
    tracks,
    albums: albumsFromTracks(tracks, artistName),
  }
  artistCache.set(cacheKey, {
    value: result,
    expiresAt: Date.now() + 5 * 60 * 1000,
  })
  return result
}

async function getArtist(track) {
  const artistName = String(track?.artists?.[0] || '').trim()
  if (!artistName) throw new Error('这首歌没有歌手信息')
  const artistId = String(
    track.artistIds?.[0] || track.providerData?.artistId || '',
  )
  const cacheKey = `${track.provider}:${artistId || normalizedMatchText(artistName)}`
  const cached = artistCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  if (artistRequests.has(cacheKey)) return artistRequests.get(cacheKey)

  const request = loadArtist(track).finally(() =>
    artistRequests.delete(cacheKey),
  )
  artistRequests.set(cacheKey, request)
  return request
}

async function getArtistAlbums(artist) {
  if (!artist?.provider) return []
  const cacheKey = `${artist.provider}:${artist.providerId || artist.id}`
  const cached = artistAlbumsCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  if (artist.provider !== 'netease' || !artist.providerId) {
    return artist.albums || []
  }

  const body = await apiCall('artist_album', {
    id: Number(artist.providerId),
    limit: 30,
    offset: 0,
  })
  const albums = (body.hotAlbums || [])
    .map((album) => ({
      id: `netease:album:${album.id}`,
      provider: 'netease',
      name: album.name || '未命名专辑',
      cover: normalizeArtwork(album.picUrl || album.blurPicUrl),
      artist: (album.artists || [])
        .map((item) => item.name)
        .filter(Boolean)
        .join(' / '),
      publishTime: Number(album.publishTime || 0),
      sampleTrack: {
        id: `netease:album-source:${album.id}`,
        provider: 'netease',
        providerId: String(album.id),
        providerData: { id: String(album.id) },
        name: album.name || '',
        artists: (album.artists || [])
          .map((item) => item.name)
          .filter(Boolean),
        album: album.name || '',
        albumId: album.id,
        cover: normalizeArtwork(album.picUrl || album.blurPicUrl),
      },
    }))
    .filter((album) => album.sampleTrack.albumId)

  artistAlbumsCache.set(cacheKey, {
    value: albums,
    expiresAt: Date.now() + 5 * 60 * 1000,
  })
  return albums
}

function prefetchTrackContext(track) {
  if (!track?.provider || !track?.providerId) return
  const tasks = []
  if (track.album) tasks.push(getAlbum(track))
  if (track.artists?.length) tasks.push(getArtist(track))
  if (tasks.length) void Promise.allSettled(tasks)
}

async function setArtistFollow(artist, follow) {
  if (artist?.provider === 'netease' && artist.providerId) {
    await apiCall('artist_sub', {
      id: Number(artist.providerId),
      t: follow ? 1 : 0,
    })
  }
  return { following: Boolean(follow) }
}

async function setAlbumSubscribe(album, subscribed) {
  if (album?.provider === 'netease' && album.providerId) {
    await apiCall('album_sub', {
      id: Number(album.providerId),
      t: subscribed ? 1 : 0,
    })
  }
  return { subscribed: Boolean(subscribed) }
}

function groupSearchSongs(songs) {
  const groups = []
  const groupsByKey = new Map()

  for (const track of songs) {
    const title = normalizedMatchText(track.name)
    const artist = normalizedMatchText(track.artists?.[0])
    const key = title ? `${title}|${artist}` : track.id
    let group = groupsByKey.get(key)
    if (!group) {
      group = []
      groupsByKey.set(key, group)
      groups.push(group)
    }
    group.push(track)
  }

  return groups
}

async function mapWithConcurrency(items, limit, worker) {
  let nextIndex = 0
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex
        nextIndex += 1
        await worker(items[index], index)
      }
    },
  )
  await Promise.all(runners)
}

async function rankSearchSongs(songs, qualityLevel) {
  const groups = groupSearchSongs(songs)
  const duplicateGroups = groups.slice(0, 24).filter((group) => group.length > 1)

  await mapWithConcurrency(duplicateGroups, 3, async (group) => {
    for (let index = 0; index < group.length; index += 1) {
      const track = group[index]
      let result
      try {
        result = await getDirectProviderSongUrl(track, qualityLevel)
      } catch {
        continue
      }
      if (!result?.url || result.limited) continue
      if (index > 0) {
        group.splice(index, 1)
        group.unshift(track)
      }
      break
    }
  })

  return groups.flat()
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

async function getDirectProviderSongUrl(track, qualityLevel = 'auto') {
  const cacheKey = `${track.id}:${qualityLevel}`
  const cached = directUrlCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  let direct
  if (track.provider === 'kugou') {
    direct = await kugouProvider.songUrl(track, qualityLevel)
  } else if (track.provider === 'qq') {
    direct = await qqProvider.songUrl(track, qualityLevel)
  } else if (track.provider === 'qishui') {
    direct = await qishuiProvider.songUrl(track, qualityLevel)
  } else {
    direct = await getNeteaseSongUrl(track, qualityLevel)
  }
  if (direct) {
    directUrlCache.set(cacheKey, {
      value: direct,
      expiresAt:
        Date.now() +
        (direct.url && !direct.limited ? 5 * 60 * 1000 : 30 * 1000),
    })
  }
  return direct
}

async function getProviderSongUrl(track, qualityLevel = 'auto') {
  const direct = await getDirectProviderSongUrl(track, qualityLevel)
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
      const fallback = await getDirectProviderSongUrl(
        fallbackTrack,
        qualityLevel,
      )
      if (fallback?.url && !fallback.limited) {
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
  const profiles = { netease, kugou, qq, qishui }
  store.knownProfiles = profiles
  saveStore()
  return profiles
}

function registerIpc() {
  ipcMain.handle('app:bootstrap', () => {
    const cachedRoam = store.cachedRoam?.length
      ? store.cachedRoam
      : store.lastTrack
        ? [store.lastTrack]
        : []
    const profiles = { ...(store.knownProfiles || {}) }
    const cookieProviders = {
      netease: Boolean(store.cookies.netease),
      kugou: Boolean(store.cookies.kugou),
      qq: Boolean(store.cookies.qq),
      qishui: Boolean(store.qishuiSession),
    }
    for (const [provider, loggedIn] of Object.entries(cookieProviders)) {
      if (!profiles[provider] && loggedIn) {
        profiles[provider] = {
          id: 'cached',
          name: '已登录',
          avatar: '',
          vip: false,
        }
      }
    }
    return {
      profile: profiles[store.primaryProvider] || null,
      profiles,
      primaryProvider: store.primaryProvider,
      secondaryEnabled: store.secondaryEnabled,
      roamMode: store.roamMode,
      roamMood: store.roamMood,
      roam: cachedRoam,
      audio: {
        loudnessEnabled: store.loudnessEnabled,
        equalizerEnabled: store.equalizerEnabled,
        equalizerBands: store.equalizerBands,
        qualityLevel: store.qualityLevel,
      },
    }
  })

  ipcMain.handle('app:bootstrap-live', async () => {
    const [profiles, roam] = await Promise.all([
      getProviderProfiles(),
      getRoamTracks(8, store.roamMode, store.roamMood).catch(() => []),
    ])
    if (roam.length) {
      store.cachedRoam = roam.slice(0, 20)
      saveStore()
    }
    return {
      profile: profiles[store.primaryProvider],
      profiles,
      primaryProvider: store.primaryProvider,
      secondaryEnabled: store.secondaryEnabled,
      roamMode: store.roamMode,
      roamMood: store.roamMood,
      roam,
      audio: {
        loudnessEnabled: store.loudnessEnabled,
        equalizerEnabled: store.equalizerEnabled,
        equalizerBands: store.equalizerBands,
        qualityLevel: store.qualityLevel,
      },
    }
  })

  ipcMain.handle('music:daily', async () => getDailySongs())
  ipcMain.handle('music:roam', async (
    _event,
    limit,
    mode = store.roamMode,
    mood = store.roamMood,
  ) =>
    getRoamTracks(
      limit,
      mode === 'explore' ? 'explore' : 'continuous',
      ROAM_MOODS.has(mood) ? mood : 'random',
    ),
  )
  ipcMain.handle('music:set-roam-mode', (_event, mode) => {
    store.roamMode = mode === 'explore' ? 'explore' : 'continuous'
    saveStore()
    return { roamMode: store.roamMode }
  })
  ipcMain.handle('music:set-roam-mood', (_event, mood) => {
    store.roamMood = ROAM_MOODS.has(mood) ? mood : 'random'
    saveStore()
    return { roamMood: store.roamMood }
  })
  ipcMain.handle('music:library', async (_event, force = false) =>
    getLibrary({ force: Boolean(force) }),
  )

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
    const [songs, playlistBody] = await Promise.all([
      rankSearchSongs(
        [primarySongs, ...secondaryResults].flat(),
        store.qualityLevel,
      ),
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
      songs,
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

  ipcMain.handle('music:album', async (_event, track) => getAlbum(track))
  ipcMain.handle('music:artist', async (_event, track) => getArtist(track))
  ipcMain.handle('music:prefetch-track-context', (_event, track) => {
    prefetchTrackContext(track)
    return { started: true }
  })
  ipcMain.handle('music:artist-albums', (_event, artist) =>
    getArtistAlbums(artist),
  )
  ipcMain.handle('music:follow-artist', (_event, artist, follow) =>
    setArtistFollow(artist, follow),
  )
  ipcMain.handle('music:subscribe-album', (_event, album, subscribed) =>
    setAlbumSubscribe(album, subscribed),
  )

  ipcMain.handle('music:url', async (_event, track, qualityLevel = 'auto') => {
    if (!track?.provider || !track?.providerId) {
      throw new Error('歌曲编号无效')
    }
    return getProviderSongUrl(
      track,
      QUALITY_LEVELS.has(qualityLevel) ? qualityLevel : 'auto',
    )
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

  ipcMain.handle('auth:qq-web-login', async () => {
    if (qqWebLoginTask) return qqWebLoginTask

    qqWebLoginTask = new Promise(async (resolve) => {
      const officialSession = session.fromPartition(
        'persist:yunqi-qq-login',
      )
      await officialSession.clearStorageData({
        storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage'],
      }).catch(() => {})

      const loginWindow = new BrowserWindow({
        width: 520,
        height: 760,
        minWidth: 440,
        minHeight: 620,
        parent: mainWindow || undefined,
        show: false,
        autoHideMenuBar: true,
        title: '登录 QQ 音乐',
        backgroundColor: '#ffffff',
        icon: path.join(__dirname, '..', '..', 'build', 'icon.ico'),
        webPreferences: {
          partition: 'persist:yunqi-qq-login',
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
            (parsed.hostname === 'qq.com' ||
              parsed.hostname.endsWith('.qq.com'))
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
        const musicKey = cookies.find(
          (cookie) =>
            ['qm_keyst', 'qqmusic_key', 'musickey'].includes(cookie.name) &&
            Boolean(cookie.value),
        )
        if (!musicKey) return

        finishing = true
        try {
          const cookie = cleanCookie(
            cookies
              .filter((item) => item.domain?.includes('qq.com'))
              .map((item) => `${item.name}=${item.value}`),
          )
          if (!cookie) return

          store.cookies.qq = cookie
          saveStore()
          const profile = await qqProvider.getProfile()
          if (!profile) return
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
        await loginWindow.loadURL('https://y.qq.com/n/ryqq/login')
      } catch (error) {
        if (settled) return
        settled = true
        resolve({
          ok: false,
          error: `无法打开 QQ 音乐官方登录页面：${error.message}`,
        })
        if (!loginWindow.isDestroyed()) loginWindow.destroy()
      }
    }).finally(() => {
      qqWebLoginTask = null
    })

    return qqWebLoginTask
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
    if (QUALITY_LEVELS.has(settings.qualityLevel)) {
      store.qualityLevel = settings.qualityLevel
    }
    saveStore()
    return {
      loudnessEnabled: store.loudnessEnabled,
      equalizerEnabled: store.equalizerEnabled,
      equalizerBands: store.equalizerBands,
      qualityLevel: store.qualityLevel,
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
