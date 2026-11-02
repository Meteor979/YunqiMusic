const coverUrl = (mid) =>
  mid
    ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${mid}.jpg`
    : ''

const stripTags = (value) =>
  String(value || '')
    .replace(/<[^>]+>/g, '')
    .trim()

function normalizeQqSong(raw = {}) {
  const mid = String(raw.mid || raw.songmid || '').trim()
  if (!mid) return null
  const album = raw.album || {}
  const singerList = Array.isArray(raw.singer) ? raw.singer : []
  const singers = singerList
    .map((artist) => artist.name || artist.title)
    .filter(Boolean)
  const artistIds = singerList
    .map((artist) => artist.mid || artist.singer_mid || artist.id)
    .filter(Boolean)
    .map(String)

  return {
    id: `qq:${mid}`,
    provider: 'qq',
    providerId: mid,
    providerData: {
      mid,
      mediaMid: String(raw.file?.media_mid || ''),
      albumId: String(album.id || ''),
      albumMid: String(album.mid || ''),
      gain: Number(raw.volume?.gain || 0),
      peak: Number(raw.volume?.peak || 0),
    },
    name: stripTags(raw.name || raw.title || raw.songname || '未知歌曲'),
    artists: singers,
    artistIds,
    album: stripTags(album.name || raw.albumname || ''),
    cover: coverUrl(album.mid),
    duration: Number(raw.interval || raw.duration || 0) * 1000,
    fee: Number(raw.pay?.pay_play ?? raw.pay?.pay_down ?? 0),
  }
}

function normalizeQqPlaylist(raw = {}) {
  const id = raw.dissid || raw.disstid || raw.dirid || raw.tid
  if (!id) return null
  return {
    id: `qq:${id}`,
    provider: 'qq',
    providerId: String(id),
    providerData: { id: String(id) },
    name: stripTags(raw.dissname || raw.title || raw.dirname || '未命名歌单'),
    cover:
      String(
        raw.logo ||
          raw.picurl ||
          raw.picurl2 ||
          raw.layer_url ||
          '',
      ).replace(/^http:\/\//i, 'https://'),
    description: stripTags(raw.subhead || raw.desc || raw.description || ''),
    trackCount: Number(raw.songnum || raw.song_count || raw.songlist_size || 0),
    creator: raw.nickname || raw.host_nick || raw.creator?.nick || '',
    playCount: Number(raw.listennum || raw.listennum_long || 0),
    tracks: [],
  }
}

function createQqAdapter({ getCookie, setCookie }) {
  let qqApiPromise = null
  let loginState = null

  function api() {
    if (!qqApiPromise) {
      qqApiPromise = import('qqmusic-api-enhanced')
    }
    return qqApiPromise
  }

  function accountCookie() {
    return getCookie() || ''
  }

  function updateCookie(cookie) {
    if (cookie && cookie !== accountCookie()) setCookie(cookie)
  }

  async function getProfile() {
    if (!accountCookie()) return null
    try {
      const qq = await api()
      const response = await qq.login_status({ cookie: accountCookie() })
      const body = response.body || {}
      updateCookie(body.cookieStr)
      if (body.code !== 200 || !body.isLogin) return null
      const account = body.account || {}
      return {
        id: String(account.userId || body.uin || ''),
        name: account.nickname || body.nickname || 'QQ 音乐用户',
        avatar: account.avatarUrl || body.avatarUrl || '',
        vip:
          account.vipStatus !== 'nonVip' &&
          account.vipStatus !== 'unknown',
        vipType: account.vipLevel || account.vipTier || 0,
      }
    } catch {
      return null
    }
  }

  async function getArtist(track) {
    const artistId = String(
      track.artistIds?.[0] || track.providerData?.artistId || '',
    )
    if (!artistId) return null
    try {
      const qq = await api()
      const [detail, songsResponse] = await Promise.all([
        qq.artist_detail({ id: artistId, cookie: accountCookie() }),
        qq.artist_songs({
          id: artistId,
          limit: 40,
          order: 'hot',
          cookie: accountCookie(),
        }),
      ])
      const detailData = detail.body?.data || {}
      const artist =
        detailData.singer ||
        detailData.singer_info ||
        detailData.data?.singer ||
        detailData.data?.singer_info ||
        {}
      const songsData = songsResponse.body?.data || {}
      const rawSongs =
        songsData.songlist ||
        songsData.song_list ||
        songsData.singer?.songlist ||
        songsData.data?.songlist ||
        []
      const tracks = rawSongs.map(normalizeQqSong).filter(Boolean)
      return {
        id: `qq:artist:${artistId}`,
        kind: 'artist',
        provider: 'qq',
        providerId: artistId,
        name: stripTags(artist.name || artist.title || track.artists?.[0]),
        avatar: String(
          artist.pic || artist.avatar || artist.singer_pic || '',
        ).replace(/^http:\/\//i, 'https://'),
        bio: stripTags(
          artist.briefDesc ||
            artist.desc ||
            artist.description ||
            artist.wiki?.desc ||
            '',
        ),
        albumCount: Number(artist.albumNum || artist.album_count || 0),
        trackCount: Number(artist.songNum || artist.song_count || tracks.length),
        followerCount: Number(
          artist.fansNum || artist.fans_count || artist.follow_num || 0,
        ),
        tracks,
      }
    } catch {
      return null
    }
  }

  async function search(keywords) {
    const qq = await api()
    const response = await qq.search({
      keywords,
      type: 0,
      limit: 30,
      cookie: accountCookie(),
    })
    return (response.body?.songs || [])
      .map(normalizeQqSong)
      .filter(Boolean)
  }

  async function searchPlaylists(keywords) {
    const qq = await api()
    const response = await qq.search({
      keywords,
      type: 3,
      limit: 20,
      cookie: accountCookie(),
    })
    const list =
      response.body?.data?.body?.item_songlist ||
      response.body?.data?.item_songlist ||
      []
    return list.map(normalizeQqPlaylist).filter(Boolean)
  }

  async function roam(limit = 8) {
    const qq = await api()
    const response = await qq.recommend_songs({
      type: 5,
      cookie: accountCookie(),
    })
    const songs =
      response.body?.songs ||
      response.body?.data?.songlist ||
      response.body?.data?.songs ||
      []
    return songs
      .slice(0, Math.max(1, Math.min(30, Number(limit) || 8)))
      .map(normalizeQqSong)
      .filter(Boolean)
  }

  async function songUrl(track, qualityLevel = 'auto') {
    const qq = await api()
    const cookie = accountCookie()
    const qualities = !cookie
      ? ['128']
      : qualityLevel === 'standard'
        ? ['128']
        : qualityLevel === 'exhigh' || qualityLevel === 'higher'
          ? ['320', '128']
          : ['flac', '320', '128']
    let fallback = null

    for (const quality of qualities) {
      const response = await qq.song_url({
        id: track.providerId,
        type: quality,
        cookie,
      })
      const item = response.body?.data?.[0]
      if (!item?.url) continue
      const urls = []
      if (item.purl) {
        const sips = response.body?.raw?.sip || []
        for (const sip of sips) {
          urls.push(
            `${String(sip).replace(/^http:\/\//i, 'https://')}${item.purl}`,
          )
        }
      }
      urls.unshift(item.url)
      const result = {
        url: item.url,
        urls: [...new Set(urls)],
        type:
          quality === 'flac'
            ? 'flac'
            : quality === '320'
              ? 'mp3'
              : 'mp3',
        bitrate:
          quality === 'flac' ? 1000000 : quality === '320' ? 320000 : 128000,
        level: quality,
        gain: Number(track.providerData?.gain || 0),
        peak: Number(track.providerData?.peak || 0),
        limited: false,
      }
      if (!result.limited) return result
      fallback ||= result
    }

    return (
      fallback || {
        url: '',
        limited: true,
        reason: 'QQ 音乐没有返回可播放音源',
      }
    )
  }

  async function getLyric(track) {
    const qq = await api()
    const response = await qq.lyric({
      id: track.providerId,
      qrc: false,
      trans: true,
      roma: false,
    })
    return {
      lrc: response.body?.lyric || '',
      translated: response.body?.trans || '',
      romaji: response.body?.roma || '',
    }
  }

  async function getPlaylist(id) {
    const providerId = String(id).replace(/^qq:/, '')
    const qq = await api()
    const [detailResponse, tracksResponse] = await Promise.all([
      qq.playlist_detail({ id: providerId, cookie: accountCookie() }),
      qq.playlist_track_all({
        id: providerId,
        limit: 1000,
        cookie: accountCookie(),
      }),
    ])
    const cdlist = detailResponse.body?.data?.cdlist?.[0] || {}
    const playlist = normalizeQqPlaylist({
      dissid: providerId,
      ...(cdlist.dirinfo || {}),
      dissname: cdlist.dissname,
      logo: cdlist.logo,
      songnum: cdlist.total_song_num || cdlist.songlist_size,
      nickname: cdlist.nickname,
      listennum: cdlist.listennum,
    })
    if (!playlist) return null
    playlist.tracks = (tracksResponse.body?.songs || [])
      .map(normalizeQqSong)
      .filter(Boolean)
    return playlist
  }

  async function getLibrary() {
    const profile = await getProfile()
    if (!profile) {
      return { profile: null, playlists: [], recent: [], daily: [] }
    }
    const qq = await api()
    const [playlistResponse, recommendResponse] = await Promise.all([
      qq.user_playlist({ cookie: accountCookie(), limit: 100 }).catch(
        () => null,
      ),
      qq.recommend_songs({ type: 5, cookie: accountCookie() }).catch(
        () => null,
      ),
    ])
    const rawPlaylists =
      playlistResponse?.body?.playlists ||
      playlistResponse?.body?.data?.playlists ||
      playlistResponse?.body?.data?.v_playlist ||
      []
    const daily =
      recommendResponse?.body?.songs ||
      recommendResponse?.body?.data?.songlist ||
      []
    const playlists = rawPlaylists.map(normalizeQqPlaylist).filter(Boolean)
    const likedPlaylist = playlists.find((playlist) =>
      /我喜欢|喜欢的音乐|默认收藏/.test(playlist.name),
    )
    const likedTracks = likedPlaylist
      ? await getPlaylist(likedPlaylist.providerId)
          .then((playlist) => playlist?.tracks || [])
          .catch(() => [])
      : []
    return {
      profile,
      playlists,
      recent: [],
      daily: daily.map(normalizeQqSong).filter(Boolean),
      likedTracks,
    }
  }

  async function startQrLogin() {
    const qq = await api()
    const response = await qq.login_qr_create({ type: 'qq' })
    const body = response.body || {}
    if (!body.qrsig || !body.qrimg) {
      throw new Error('QQ 音乐登录二维码生成失败')
    }
    loginState = {
      qrsig: body.qrsig,
      ptqrtoken: body.ptqrtoken,
      guid: body.guid,
    }
    return {
      key: body.qrsig,
      image: body.qrimg,
    }
  }

  async function checkQrLogin() {
    if (!loginState) return { code: 800, message: '二维码已失效' }
    const qq = await api()
    const response = await qq.login_qr_check({
      type: 'qq',
      ...loginState,
    })
    const body = response.body || {}
    if (body.code === 200 && body.cookieStr) {
      setCookie(body.cookieStr)
      loginState = null
      return { code: 200, profile: await getProfile() }
    }
    return { code: body.code, message: body.message || '等待扫码' }
  }

  return {
    getProfile,
    getArtist,
    search,
    searchPlaylists,
    roam,
    songUrl,
    getLyric,
    getPlaylist,
    getLibrary,
    startQrLogin,
    checkQrLogin,
  }
}

module.exports = {
  createQqAdapter,
  normalizeQqSong,
  normalizeQqPlaylist,
}
