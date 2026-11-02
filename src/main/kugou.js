const crypto = require('crypto')
const path = require('path')

process.env.platform = process.env.platform || 'lite'

const vendorRoot = path.join(__dirname, '..', '..', 'vendor', 'KuGouMusicApi')
const util = require(path.join(vendorRoot, 'util'))
const modulePath = (name) => path.join(vendorRoot, 'module', `${name}.js`)
const modules = {
  search: require(modulePath('search')),
  personalFm: require(modulePath('personal_fm')),
  songUrl: require(modulePath('song_url')),
  searchLyric: require(modulePath('search_lyric')),
  lyric: require(modulePath('lyric')),
  registerDevice: require(modulePath('register_dev')),
  loginQrKey: require(modulePath('login_qr_key')),
  loginQrCheck: require(modulePath('login_qr_check')),
  userDetail: require(modulePath('user_detail')),
  userPlaylist: require(modulePath('user_playlist')),
  userHistory: require(modulePath('user_history')),
  playlistDetail: require(modulePath('playlist_detail')),
  playlistTrackAll: require(modulePath('playlist_track_all')),
  playlistTrackAllNew: require(modulePath('playlist_track_all_new')),
  everydayRecommend: require(modulePath('everyday_recommend')),
  playlistTracksAdd: require(modulePath('playlist_tracks_add')),
  playlistTracksDel: require(modulePath('playlist_tracks_del')),
}

function parseCookie(value) {
  if (!value) return {}
  if (typeof value === 'object') return { ...value }
  const cookies = {}
  for (const part of String(value).split(';')) {
    const pair = part.trim()
    const separator = pair.indexOf('=')
    if (separator <= 0) continue
    cookies[pair.slice(0, separator).trim()] = pair
      .slice(separator + 1)
      .trim()
  }
  return cookies
}

function serializeCookie(cookie) {
  return Object.entries(cookie)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')
}

function normalizeArtwork(url) {
  if (!url) return ''
  return String(url)
    .replace('{size}', '480')
    .replace(/^http:\/\//i, 'https://')
}

function normalizeDuration(value) {
  const number = Number(value || 0)
  if (!number) return 0
  return number > 10000 ? number : number * 1000
}

function normalizeKugouSong(raw = {}) {
  const hash = String(raw.hash || raw.FileHash || raw.HQFileHash || '').toUpperCase()
  if (!hash) return null

  const artistNames = Array.isArray(raw.singerinfo)
    ? raw.singerinfo.map((artist) => artist.name).filter(Boolean)
    : Array.isArray(raw.Singers)
      ? raw.Singers.map((artist) => artist.name).filter(Boolean)
      : String(raw.singername || raw.SingerName || '')
          .split(/\s*[、&]\s*/)
          .filter(Boolean)

  const albumId = String(raw.album_id || raw.AlbumID || '')
  const albumAudioId = String(
    raw.album_audio_id || raw.MixSongID || raw.Audioid || raw.ID || '',
  )
  const cover = normalizeArtwork(
    raw.Image || raw.image || raw.trans_param?.union_cover,
  )

  return {
    id: `kugou:${hash}`,
    provider: 'kugou',
    providerId: hash,
    providerData: {
      hash,
      albumId,
      albumAudioId,
      fileId: String(raw.fileid || raw.file_id || raw.FileID || ''),
    },
    name: raw.songname || raw.SongName || raw.OriSongName || raw.name || '未知歌曲',
    artists: artistNames,
    album: raw.albumname || raw.AlbumName || raw.album_name || '',
    cover,
    duration: normalizeDuration(
      raw.time_length ||
        raw.Duration ||
        raw.timelen ||
        raw.info?.duration ||
        raw.relate_goods?.[0]?.info?.duration,
    ),
    fee: Number(raw.privilege ?? raw.Privilege ?? raw.pay_type ?? 0),
  }
}

function normalizeKugouPlaylist(raw = {}) {
  const listId =
    raw.global_collection_id ||
    raw.global_collection?.id ||
    raw.gid ||
    raw.specialid ||
    raw.listid
  if (!listId) return null
  return {
    id: `kugou:${listId}`,
    provider: 'kugou',
    providerId: String(listId),
    providerData: {
      listId: String(raw.listid || ''),
      globalCollectionId: String(listId),
    },
    name: raw.name || raw.listname || raw.list_name || raw.title || '未命名歌单',
    cover: normalizeArtwork(
      raw.specialname
        ? raw.img
        : raw.pic || raw.pic_url || raw.imgurl || raw.list_image || raw.cover,
    ),
    description: raw.intro || raw.description || '',
    trackCount: Number(raw.songcount || raw.song_count || raw.count || 0),
    creator: raw.nickname || raw.username || raw.user_name || '',
    playCount: Number(
      raw.total_play_count || raw.playcount || raw.play_count || 0,
    ),
    tracks: [],
  }
}

function findArray(body) {
  const candidates = [
    body?.data?.info,
    body?.data?.lists,
    body?.data?.list,
    body?.data,
    body?.info,
    body?.lists,
  ]
  return candidates.find(Array.isArray) || []
}

function createKugouAdapter({
  getCookie,
  getDevice,
  setDevice,
  setCookie,
}) {
  let registerPromise = null
  let loginKey = ''
  let playlistCache = new Map()

  function currentDevice() {
    const saved = getDevice() || {}
    const guid = saved.guid || util.cryptoMd5(crypto.randomUUID())
    const device = {
      ...saved,
      guid,
      mid: saved.mid || util.calculateMid(guid),
      dev: saved.dev || util.randomString(10).toUpperCase(),
      mac: saved.mac || '02:00:00:00:00:00',
      webgl: saved.webgl || util.randomString(32),
    }
    if (JSON.stringify(device) !== JSON.stringify(saved)) setDevice(device)
    return device
  }

  function cookies() {
    const device = currentDevice()
    return {
      KUGOU_API_PLATFORM: 'lite',
      KUGOU_API_GUID: device.guid,
      KUGOU_API_MID: device.mid,
      KUGOU_API_DEV: device.dev,
      KUGOU_API_MAC: device.mac,
      KUGOU_API_WEBGL: device.webgl,
      ...(device.dfid ? { dfid: device.dfid } : {}),
      ...parseCookie(getCookie()),
    }
  }

  async function call(handler, params = {}) {
    const response = await handler(
      { ...params, cookie: cookies() },
      util.createRequest,
    )
    return response
  }

  async function ensureDeviceRegistered() {
    if (currentDevice().dfid) return
    if (registerPromise) return registerPromise

    registerPromise = call(modules.registerDevice)
      .then((response) => {
        const dfid =
          response.body?.data?.dfid ||
          response.cookie?.find((item) => item.startsWith('dfid='))?.split('=')[1]
        if (dfid) {
          setDevice({ ...currentDevice(), dfid })
        }
        return dfid || ''
      })
      .finally(() => {
        registerPromise = null
      })
    return registerPromise
  }

  async function getProfile() {
    if (!parseCookie(getCookie()).token) return null
    try {
      const response = await call(modules.userDetail)
      const data = response.body?.data || {}
      if (!data || !Object.keys(data).length) return null
      return {
        id: String(data.userid || parseCookie(getCookie()).userid || ''),
        name:
          data.nickname ||
          data.nick_name ||
          data.username ||
          data.user_name ||
          '酷狗用户',
        avatar: normalizeArtwork(
          data.pic || data.user_pic || data.avatar || data.img,
        ),
        vip: Boolean(Number(data.vip_type || data.viptype || 0)),
        vipType: Number(data.vip_type || data.viptype || 0),
      }
    } catch {
      return null
    }
  }

  async function search(keywords) {
    const response = await call(modules.search, {
      keywords,
      type: 'song',
      pagesize: 30,
    })
    return findArray(response.body)
      .map(normalizeKugouSong)
      .filter(Boolean)
  }

  async function searchPlaylists(keywords) {
    const response = await call(modules.search, {
      keywords,
      type: 'special',
      pagesize: 20,
    })
    return findArray(response.body)
      .map((item) =>
        normalizeKugouPlaylist({
          ...item,
          name: item.specialname,
        }),
      )
      .filter(Boolean)
  }

  async function roam(limit = 8) {
    const response = await call(modules.personalFm, {
      action: 'play',
      mode: 'normal',
      remain_songcnt: Math.max(1, Math.min(20, Number(limit) || 8)),
    })
    return (response.body?.data?.song_list || [])
      .map(normalizeKugouSong)
      .filter(Boolean)
  }

  async function songUrl(track, qualityLevel = 'auto') {
    await ensureDeviceRegistered()
    let latestError = null
    const account = parseCookie(getCookie())
    const hasVip = account.token && Number(account.vip_type || 0) > 0
    const qualityOrder = !hasVip
      ? ['128']
      : qualityLevel === 'standard'
        ? ['128']
        : qualityLevel === 'exhigh' || qualityLevel === 'higher'
          ? ['320', '128']
          : ['flac', '320', '128']
    for (const quality of qualityOrder) {
      try {
        const response = await call(modules.songUrl, {
          hash: track.providerId,
          album_id: track.providerData?.albumId,
          album_audio_id: track.providerData?.albumAudioId,
          quality,
        })
        const data = Array.isArray(response.body?.data)
          ? response.body.data[0]
          : response.body?.data || response.body
        const urls = (
          Array.isArray(data?.url)
            ? [...data.url, ...(data.backupUrl || [])]
            : [data?.url, ...(data?.backupUrl || [])]
        ).filter(Boolean)
        if (!urls.length) continue
        return {
          url: String(urls[0]),
          urls: [...new Set(urls.map(String))],
          type: data.extName || data.extname || 'mp3',
          bitrate: Number(data.bitRate || data.bitrate || 0),
          size: Number(data.fileSize || data.filesize || 0),
          level: quality,
          gain: Number(data.volume || 0),
          peak: Number(data.volume_peak || data.peak || 0),
          limited: false,
        }
      } catch (error) {
        latestError = error
      }
    }
    if (latestError) {
      return {
        url: '',
        limited: true,
        reason: '酷狗当前没有返回可播放音源',
      }
    }
    return { url: '', limited: true, reason: '酷狗当前没有可用音源' }
  }

  async function getLyric(track) {
    const searchResponse = await call(modules.searchLyric, {
      hash: track.providerId,
      album_audio_id: track.providerData?.albumAudioId,
      duration: track.duration,
      keywords: `${track.name} ${track.artists.join(' ')}`,
    })
    const candidates = searchResponse.body?.candidates || []
    const proposal = searchResponse.body?.proposal
    const candidate =
      candidates.find((item) => String(item.id) === String(proposal)) ||
      candidates[0]
    if (!candidate) return { lrc: '', translated: '', romaji: '' }

    const response = await call(modules.lyric, {
      id: candidate.id,
      accesskey: candidate.accesskey,
      fmt: 'lrc',
      decode: true,
    })
    const content =
      response.body?.decodeContent ||
      (response.body?.content
        ? Buffer.from(response.body.content, 'base64').toString('utf8')
        : '')
    return { lrc: content, translated: '', romaji: '' }
  }

  async function getPlaylists() {
    if (!(await getProfile())) return []
    const response = await call(modules.userPlaylist, { pagesize: 50 })
    const playlists = findArray(response.body)
      .map(normalizeKugouPlaylist)
      .filter(Boolean)
    for (const playlist of playlists) {
      playlistCache.set(playlist.providerId, playlist)
    }
    return playlists
  }

  async function getPlaylist(id) {
    const providerId = String(id).replace(/^kugou:/, '')
    const cached = playlistCache.get(providerId)
    const isGlobalCollection = providerId.startsWith('collection_')
    const [detailResponse, tracksResponse] = await Promise.all([
      isGlobalCollection
        ? call(modules.playlistDetail, { ids: providerId }).catch(() => null)
        : Promise.resolve(null),
      (
        isGlobalCollection
          ? call(modules.playlistTrackAll, {
              id: providerId,
              pagesize: 1000,
            })
          : call(modules.playlistTrackAllNew, {
              listid: providerId,
              pagesize: 1000,
            })
      ).catch(() => null),
    ])

    const detailRaw = findArray(detailResponse?.body)[0] || {}
    const playlist = normalizeKugouPlaylist({
      ...(cached || {}),
      global_collection_id: providerId,
      ...detailRaw,
    })
    if (!playlist) return null
    playlist.tracks = findArray(tracksResponse?.body)
      .map(normalizeKugouSong)
      .filter(Boolean)
    if (!playlist.name || playlist.name === '未命名歌单') {
      playlist.name = detailRaw.listname || detailRaw.list_name || '歌单'
    }
    return playlist
  }

  async function getLikedPlaylist() {
    const playlists = await getPlaylists()
    return (
      playlists.find((playlist) =>
        /我喜欢|喜欢的音乐|默认收藏/.test(playlist.name),
      ) ||
      playlists.find((playlist) => playlist.providerData?.listId === '1') ||
      null
    )
  }

  async function getLikedTracks() {
    const playlist = await getLikedPlaylist()
    if (!playlist?.providerData?.listId) return []
    const response = await call(modules.playlistTrackAllNew, {
      listid: playlist.providerData.listId,
      pagesize: 1000,
    })
    return findArray(response.body)
  }

  async function getLikeState(track) {
    if (!(await getProfile())) return { liked: false, loggedIn: false }
    try {
      const tracks = await getLikedTracks()
      return {
        liked: tracks.some((item) =>
          String(item.hash || item.FileHash || '').toUpperCase() ===
          String(track.providerId).toUpperCase(),
        ),
        loggedIn: true,
      }
    } catch {
      return { liked: false, loggedIn: true }
    }
  }

  async function setLike(track, liked) {
    const playlist = await getLikedPlaylist()
    if (!playlist?.providerData?.listId) {
      throw new Error('没有找到酷狗“我喜欢”歌单')
    }

    if (liked) {
      await call(modules.playlistTracksAdd, {
        listid: playlist.providerData.listId,
        data: [
          `${track.name}|${track.providerId}`,
          track.providerData?.albumId || 0,
          track.providerData?.albumAudioId || 0,
        ].join('|'),
      })
      return { liked: true }
    }

    let fileId = track.providerData?.fileId
    if (!fileId) {
      const tracks = await getLikedTracks()
      const match = tracks.find(
        (item) =>
          String(item.hash || item.FileHash || '').toUpperCase() ===
          String(track.providerId).toUpperCase(),
      )
      fileId = match?.fileid || match?.file_id || match?.FileID
    }
    if (!fileId) throw new Error('没有找到酷狗收藏记录')
    await call(modules.playlistTracksDel, {
      listid: playlist.providerData.listId,
      fileids: String(fileId),
    })
    return { liked: false }
  }

  async function getRecent() {
    if (!(await getProfile())) return []
    try {
      const response = await call(modules.userHistory)
      return findArray(response.body)
        .map((entry) => normalizeKugouSong(entry))
        .filter(Boolean)
    } catch {
      return []
    }
  }

  async function getDaily() {
    try {
      const response = await call(modules.everydayRecommend, {
        platform: 'ios',
      })
      const list =
        response.body?.data?.song_list ||
        response.body?.data?.info ||
        findArray(response.body)
      return (Array.isArray(list) ? list : [])
        .map(normalizeKugouSong)
        .filter(Boolean)
    } catch {
      return []
    }
  }

  async function getLibrary() {
    const [profile, playlists, recent, daily] = await Promise.all([
      getProfile(),
      getPlaylists().catch(() => []),
      getRecent().catch(() => []),
      getDaily().catch(() => []),
    ])
    return { profile, playlists, recent, daily }
  }

  async function startQrLogin() {
    const response = await call(modules.loginQrKey, { type: 'web' })
    const data = response.body?.data || {}
    if (!data.qrcode || !data.qrcode_img) {
      throw new Error('酷狗登录二维码生成失败')
    }
    loginKey = data.qrcode
    return {
      key: data.qrcode,
      image: data.qrcode_img,
    }
  }

  async function checkQrLogin() {
    if (!loginKey) return { code: 0, message: '二维码已失效' }
    const response = await call(modules.loginQrCheck, { key: loginKey })
    const status = Number(response.body?.data?.status)
    if (status === 4) {
      const updated = {
        ...parseCookie(getCookie()),
        ...parseCookie(response.cookie?.join('; ')),
      }
      setCookie(serializeCookie(updated))
      loginKey = ''
      const profile = await getProfile()
      if (profile?.vipType) {
        const latest = parseCookie(getCookie())
        setCookie(
          serializeCookie({ ...latest, vip_type: String(profile.vipType) }),
        )
      }
      return { code: 4, profile }
    }
    return {
      code: status,
      message: status === 2 ? '请在手机上确认登录' : '等待扫码',
    }
  }

  return {
    getProfile,
    search,
    searchPlaylists,
    roam,
    songUrl,
    getLyric,
    getLibrary,
    getPlaylist,
    getLikeState,
    setLike,
    startQrLogin,
    checkQrLogin,
  }
}

module.exports = {
  createKugouAdapter,
  normalizeKugouSong,
  normalizeArtwork,
}
