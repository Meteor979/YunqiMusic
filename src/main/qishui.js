const {
  createQishuiApi,
  createQishuiDeviceId,
} = require('qishui-music-api')

function mediaUrl(value) {
  if (!value || typeof value !== 'object') return ''
  if (Array.isArray(value.urls) && value.urls[0] && value.uri) {
    const suffix = value.template_prefix
      ? `~${value.template_prefix}.image`
      : ''
    return String(value.urls[0]).replace(/^http:\/\//i, 'https://') +
      value.uri +
      suffix
  }
  if (Array.isArray(value.urls) && value.urls[0]) {
    return String(value.urls[0]).replace(/^http:\/\//i, 'https://')
  }
  return String(
    value.url || value.cover_url || value.image_url || '',
  ).replace(/^http:\/\//i, 'https://')
}

function normalizeQishuiSong(raw = {}) {
  const id = String(raw.id || raw.base_info?.id || '')
  if (!id) return null
  const base = raw.base_info || {}
  const related = raw.related_info || {}
  const display = raw.display_info || {}
  return {
    id: `qishui:${id}`,
    provider: 'qishui',
    providerId: id,
    providerData: {
      id,
      gain: Number(display.loudness?.gain || raw.loudness?.gain || 0),
      peak: Number(display.loudness?.peak || raw.loudness?.peak || 0),
    },
    name: base.name || raw.name || '未知歌曲',
    artists: (related.artist_links || [])
      .map((artist) => artist.simple_display_name || artist.name)
      .filter(Boolean),
    album: related.album_link?.name || '',
    cover: mediaUrl(display.cover_url),
    duration: Number(base.duration_ms || raw.duration_ms || 0),
    fee: 0,
  }
}

function normalizeQishuiPlaylist(raw = {}) {
  const base = raw.base_info || {}
  const id = String(base.id || raw.id || '')
  if (!id) return null
  const related = raw.relation_info || {}
  const owner = related.owner || related.artist_brief || {}
  return {
    id: `qishui:${id}`,
    provider: 'qishui',
    providerId: id,
    providerData: {
      id,
      ownerId: String(owner.id || base.owner_id || ''),
    },
    name: base.title || raw.title || '未命名歌单',
    cover: mediaUrl(raw.display_info?.url_cover),
    description: base.desc || '',
    trackCount: Number(raw.resource_cnt?.track_cnt || 0),
    creator: owner.nickname || owner.name || '',
    playCount: Number(raw.stats?.count_played || 0),
    tracks: [],
  }
}

function parseQishuiLyrics(source) {
  return String(source || '')
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^\[(\d+),(\d+)\](.*)$/)
      if (!match) return ''
      const start = Number(match[1])
      const text = match[3].replace(/<[^>]+>/g, '').trim()
      if (!text) return ''
      const minutes = Math.floor(start / 60000)
      const seconds = Math.floor((start % 60000) / 1000)
      const centiseconds = Math.floor((start % 1000) / 10)
      return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}]${text}`
    })
    .filter(Boolean)
    .join('\n')
}

function createQishuiAdapter({
  getDeviceId,
  setDeviceId,
  getSession,
  setSession,
}) {
  let revision = 0
  let deviceId = getDeviceId()
  if (!deviceId) {
    deviceId = createQishuiDeviceId()
    setDeviceId(deviceId)
  }
  let session = getSession() || null
  let loginKey = ''
  const playlistCache = new Map()

  const sessions = {
    deviceId,
    get revision() {
      return revision
    },
    get() {
      return session
    },
    set(value) {
      session = value
      revision += 1
      setSession(value)
    },
    clear() {
      session = null
      revision += 1
      setSession(null)
    },
  }
  const api = createQishuiApi({
    deviceId,
    sessions,
    fetch: globalThis.fetch,
    log: () => {},
    warn: () => {},
  })
  const retryableOperations = new Set([
    'search',
    'search_playlists',
    'feed',
    'song_detail',
    'audio',
    'lyrics',
    'playlist_detail',
    'playlist_tracks',
  ])

  async function request(operation, params = {}) {
    let result
    for (let attempt = 0; attempt < 2; attempt += 1) {
      result = await api.request(operation, params)
      if (
        result.ok ||
        !retryableOperations.has(operation) ||
        result.error?.code !== 'network' ||
        attempt > 0
      ) {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 350))
    }
    if (!result.ok) {
      throw new Error(result.error?.message || '汽水音乐请求失败')
    }
    return result.data
  }

  async function getProfile() {
    if (!session) return null
    try {
      await request('login_status')
    } catch {
      if (!session) return null
    }
    const user = session?.user
    if (!user) return null
    return {
      id: String(user.id),
      name: user.nickname || '汽水音乐用户',
      avatar: mediaUrl(user.avatar),
      vip: Boolean(user.isVip),
    }
  }

  async function search(keywords) {
    const data = await request('search', {
      query: keywords,
      limit: 30,
    })
    return (data.items || []).map(normalizeQishuiSong).filter(Boolean)
  }

  async function searchPlaylists(keywords) {
    const data = await request('search_playlists', {
      query: keywords,
      limit: 20,
    })
    const playlists = (data.items || [])
      .map(normalizeQishuiPlaylist)
      .filter(Boolean)
    playlists.forEach((playlist) => playlistCache.set(playlist.providerId, playlist))
    return playlists
  }

  async function roam(limit = 8) {
    const data = await request('feed', {
      preference: 'familiar',
      limit: Math.max(1, Math.min(20, Number(limit) || 8)),
      first: true,
    })
    return (data.items || [])
      .map(normalizeQishuiSong)
      .filter(Boolean)
  }

  async function songUrl(track) {
    try {
      const data = await request('audio', {
        id: track.providerId,
        quality: 'standard',
      })
      if (!data?.url) {
        return {
          url: '',
          limited: Boolean(data?.preview),
          reason: '汽水音乐只返回了受保护音源',
        }
      }
      return {
        url: data.url,
        urls: [data.url],
        type: 'm4a',
        bitrate: 128000,
        level: data.quality || 'standard',
        gain: Number(track.providerData?.gain || 0),
        peak: Number(track.providerData?.peak || 0),
        limited: Boolean(data.preview),
      }
    } catch (error) {
      return {
        url: '',
        limited: true,
        reason: error.message || '汽水音乐当前没有可播放音源',
      }
    }
  }

  async function getLyric(track) {
    const data = await request('lyrics', { id: track.providerId })
    return {
      lrc: parseQishuiLyrics(data.lyric_entity?.content),
      translated: '',
      romaji: '',
    }
  }

  async function getPlaylist(id) {
    const providerId = String(id).replace(/^qishui:/, '')
    const cached = playlistCache.get(providerId)
    const ownerId = cached?.providerData?.ownerId || ''
    const [detail, tracks] = await Promise.all([
      request('playlist_detail', {
        id: providerId,
        ownerId,
      }),
      request('playlist_tracks', {
        id: providerId,
        ownerId,
        limit: 1000,
      }),
    ])
    const playlist = normalizeQishuiPlaylist({
      ...(cached || {}),
      ...(detail || {}),
    })
    if (!playlist) return null
    playlist.tracks = (tracks.items || [])
      .map(normalizeQishuiSong)
      .filter(Boolean)
    return playlist
  }

  async function getLibrary() {
    const profile = await getProfile()
    if (!profile) {
      return { profile: null, playlists: [], recent: [], daily: [] }
    }
    const [playlistData, recentData, feedData, likedData] = await Promise.all([
      request('user_playlists', { limit: 100 }).catch(() => ({ items: [] })),
      request('recent_played', { limit: 20 }).catch(() => ({ items: [] })),
      request('feed', { preference: 'familiar', limit: 20 }).catch(() => ({
        items: [],
      })),
      request('liked_songs').catch(() => ({ items: [] })),
    ])
    const playlists = (playlistData.items || [])
      .map(normalizeQishuiPlaylist)
      .filter(Boolean)
    playlists.forEach((playlist) => playlistCache.set(playlist.providerId, playlist))
    return {
      profile,
      playlists,
      recent: (recentData.items || [])
        .map(normalizeQishuiSong)
        .filter(Boolean),
      daily: (feedData.items || [])
        .map(normalizeQishuiSong)
        .filter(Boolean),
      likedTracks: (likedData.items || [])
        .map(normalizeQishuiSong)
        .filter(Boolean),
    }
  }

  async function getLikeState(track) {
    if (!session) return { liked: false, loggedIn: false }
    try {
      const data = await request('liked_songs')
      return {
        liked: (data.items || []).some(
          (item) => String(item.id || item.base_info?.id) === track.providerId,
        ),
        loggedIn: true,
      }
    } catch {
      return { liked: false, loggedIn: true }
    }
  }

  async function setLike(track, liked) {
    await request('like_song', {
      id: track.providerId,
      liked: Boolean(liked),
    })
    return { liked: Boolean(liked) }
  }

  async function startQrLogin() {
    const keyData = await request('login_qr_key')
    const qrData = await request('login_qr_create', { key: keyData.key })
    loginKey = keyData.key
    return { key: keyData.key, image: qrData.imageUrl }
  }

  async function checkQrLogin() {
    if (!loginKey) return { code: 800, message: '二维码已失效' }
    const data = await request('login_qr_check', { key: loginKey })
    if (data.state === 'confirmed') {
      loginKey = ''
      return { code: 200, profile: await getProfile() }
    }
    if (data.state === 'expired' || data.state === 'error') {
      loginKey = ''
      return { code: 800, message: '二维码已失效' }
    }
    return {
      code: data.state === 'scanned' ? 802 : 801,
      message:
        data.state === 'scanned' ? '已扫码，请在手机上确认' : '等待扫码',
    }
  }

  async function logout() {
    await request('logout')
  }

  return {
    getProfile,
    search,
    searchPlaylists,
    roam,
    songUrl,
    getLyric,
    getPlaylist,
    getLibrary,
    getLikeState,
    setLike,
    startQrLogin,
    checkQrLogin,
    logout,
  }
}

module.exports = {
  createQishuiAdapter,
  normalizeQishuiSong,
  normalizeQishuiPlaylist,
}
