const api = window.yunqi
const audio = document.getElementById('audio-element')

const $ = (selector) => document.querySelector(selector)
const $$ = (selector) => [...document.querySelectorAll(selector)]

const state = {
  profile: null,
  daily: [],
  recent: [],
  playlists: [],
  queue: [],
  queueMode: 'roam',
  currentIndex: -1,
  track: null,
  currentView: 'now',
  returnView: 'now',
  activePlaylist: null,
  sources: {},
  lyrics: [],
  lyricIndex: -1,
  repeatMode: 'all',
  shuffle: false,
  playing: false,
  liked: false,
  loadToken: 0,
  searchToken: 0,
  artToken: 0,
  urlCache: new Map(),
  updateInfo: null,
  checkingUpdate: false,
}

const el = {
  app: $('#app'),
  audio,
  albumCover: $('#album-cover'),
  coverStage: $('#cover-stage'),
  trackName: $('#track-name'),
  trackArtist: $('#track-artist'),
  trackAlbum: $('#track-album'),
  titlebarNow: $('#titlebar-now'),
  currentTime: $('#current-time'),
  totalTime: $('#total-time'),
  progress: $('#progress-range'),
  volume: $('#volume-range'),
  playButton: $('#play-button'),
  lyricsScroll: $('#lyrics-scroll'),
  lyricsList: $('#lyrics-list'),
  queuePanel: $('#queue-panel'),
  queueList: $('#queue-list'),
  queueEmpty: $('#queue-empty'),
  queueCount: $('#queue-count'),
  queueDuration: $('#queue-duration'),
  queueSummary: $('#queue-summary-label'),
  profileButton: $('#profile-button'),
  profileName: $('#profile-name'),
  profileAvatar: $('#profile-avatar'),
  popover: $('#profile-popover'),
  popoverBackdrop: $('#popover-backdrop'),
  popoverName: $('#popover-name'),
  popoverStatus: $('#popover-status'),
  popoverAvatar: $('#popover-avatar'),
  loginAction: $('#login-action'),
  updateAction: $('#update-action'),
  logoutAction: $('#logout-action'),
  searchInput: $('#search-input'),
  searchResults: $('#search-results'),
  libraryContent: $('#library-content'),
  playlistContent: $('#playlist-content'),
  quality: $('#quality-label'),
  likeButton: $('#like-button'),
  muteButton: $('#mute-button'),
  shuffleButton: $('#shuffle-button'),
  repeatButton: $('#repeat-button'),
  toastStack: $('#toast-stack'),
}

const icons = {
  play: '<svg aria-hidden="true"><use href="#icon-play"></use></svg>',
  pause: '<svg aria-hidden="true"><use href="#icon-pause"></use></svg>',
  volume: '<svg aria-hidden="true"><use href="#icon-volume"></use></svg>',
  mute: '<svg aria-hidden="true"><use href="#icon-mute"></use></svg>',
  heart: '<svg aria-hidden="true"><use href="#icon-heart"></use></svg>',
  user: '<svg aria-hidden="true"><use href="#icon-user"></use></svg>',
}

function escapeHTML(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function safeArtwork(url) {
  return typeof url === 'string' && /^https:\/\//i.test(url) ? url : ''
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const rounded = Math.floor(seconds)
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0 分钟'
  const minutes = Math.round(seconds / 60)
  return `${minutes} 分钟`
}

function formatCount(value) {
  const number = Number(value) || 0
  if (number >= 100000000) return `${(number / 100000000).toFixed(1)}亿`
  if (number >= 10000) return `${(number / 10000).toFixed(1)}万`
  return number ? number.toLocaleString('zh-CN') : ''
}

function formatQuality(result) {
  const levelNames = {
    jymaster: '超清母带',
    hires: 'Hi-Res',
    lossless: '无损',
    exhigh: '极高',
    higher: '较高',
    standard: '标准',
  }
  const level = levelNames[result.level] || result.level || '高音质'
  const type = String(result.type || '').toUpperCase()
  const bitrate = result.bitrate
    ? result.bitrate >= 1000000
      ? `${(result.bitrate / 1000000).toFixed(2)} Mbps`
      : `${Math.round(result.bitrate / 1000)} kbps`
    : ''

  return [level, type, bitrate].filter(Boolean).join(' · ')
}

function friendlyError(error) {
  const message = error?.message || String(error || '发生未知错误')
  return message
    .replace(/^Error invoking remote method '[^']+':\s*/, '')
    .replace(/^Error:\s*/, '')
}

function showToast(message, duration = 2800) {
  const toast = document.createElement('div')
  toast.className = 'toast'
  toast.textContent = message
  el.toastStack.append(toast)
  window.setTimeout(() => {
    toast.classList.add('is-leaving')
    window.setTimeout(() => toast.remove(), 240)
  }, duration)
}

function setRangeFill(range, percentage) {
  range.style.setProperty('--range-progress', `${Math.max(0, Math.min(100, percentage))}%`)
}

function updatePlayButton() {
  const markup = state.playing ? icons.pause : icons.play
  el.playButton.innerHTML = markup
  el.playButton.title = state.playing ? '暂停' : '播放'
  el.app.classList.toggle('is-playing', state.playing)
}

function updateTrackUI(track) {
  state.track = track
  el.trackName.textContent = track?.name || ''
  el.trackArtist.textContent = track?.artists?.join(' / ') || ''
  el.trackAlbum.textContent = track?.album || ''
  el.titlebarNow.textContent = track
    ? `${track.name} · ${track.artists?.join(' / ') || '未知歌手'}`
    : '漫游'
  document.title = track ? `${track.name} · 云栖音乐` : '云栖音乐'

  const cover = safeArtwork(track?.cover)
  el.albumCover.classList.remove('is-loaded')
  el.coverStage.classList.toggle('has-image', Boolean(cover))

  if (cover) {
    el.albumCover.onload = () => {
      el.albumCover.classList.add('is-loaded')
    }
    el.albumCover.onerror = () => {
      el.albumCover.classList.remove('is-loaded')
      el.coverStage.classList.remove('has-image')
    }
    el.albumCover.src = cover
    el.albumCover.alt = track.album ? `${track.album} 封面` : `${track.name} 封面`
    if (el.albumCover.complete) {
      requestAnimationFrame(() => el.albumCover.classList.add('is-loaded'))
    }
  } else {
    el.albumCover.onload = null
    el.albumCover.onerror = null
    el.albumCover.removeAttribute('src')
    el.albumCover.alt = ''
  }

  el.progress.value = '0'
  setRangeFill(el.progress, 0)
  el.currentTime.textContent = '0:00'
  el.totalTime.textContent = formatTime((track?.duration || 0) / 1000)
  el.likeButton.classList.toggle('is-active', state.liked)

  if (window.mediaSession && 'MediaMetadata' in window) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track?.name || '云栖音乐',
      artist: track?.artists?.join(' / ') || '',
      album: track?.album || '',
      artwork: cover ? [{ src: cover, sizes: '512x512' }] : [],
    })
  }
}

function resetLyrics(message = '') {
  state.lyrics = []
  state.lyricIndex = -1
  el.lyricsList.innerHTML = message
    ? `<p class="lyric-placeholder">${escapeHTML(message)}</p>`
    : ''
  el.lyricsScroll.scrollTop = 0
}

function parseLrc(source) {
  const rows = []
  if (!source) return rows

  for (const rawLine of source.split(/\r?\n/)) {
    const stamps = [...rawLine.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)]
    if (!stamps.length) continue

    const text = rawLine.replace(/\[[^\]]+\]/g, '').trim()
    if (!text) continue

    for (const stamp of stamps) {
      const fraction = stamp[3] ? Number(`0.${stamp[3].padEnd(3, '0').slice(0, 3)}`) : 0
      rows.push({
        time: Number(stamp[1]) * 60 + Number(stamp[2]) + fraction,
        text,
      })
    }
  }

  return rows.sort((a, b) => a.time - b.time)
}

function mergeLyrics(lrc, translated) {
  const original = parseLrc(lrc)
  const translation = parseLrc(translated)

  return original.map((line) => {
    const translatedLine = translation.find(
      (candidate) =>
        Math.abs(candidate.time - line.time) < 0.22 &&
        candidate.text !== line.text,
    )
    return {
      ...line,
      translation: translatedLine?.text || '',
    }
  })
}

function renderLyrics(lyrics) {
  state.lyrics = lyrics
  state.lyricIndex = -1

  if (!lyrics.length) {
    resetLyrics('')
    return
  }

  el.lyricsList.innerHTML = lyrics
    .map(
      (line, index) => `
        <button class="lyric-line" data-lyric-index="${index}" data-time="${line.time}">
          ${escapeHTML(line.text)}
          ${line.translation ? `<span class="lyric-translation">${escapeHTML(line.translation)}</span>` : ''}
        </button>
      `,
    )
    .join('')
}

async function loadLyrics(trackId, token) {
  resetLyrics('')
  try {
    const lyric = await api.getLyric(trackId)
    if (token !== state.loadToken) return
    renderLyrics(mergeLyrics(lyric.lrc, lyric.translated))
  } catch {
    if (token !== state.loadToken) return
    resetLyrics('')
  }
}

function rgbToHsl(r, g, b) {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const delta = max - min
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min)
    if (max === r) h = (g - b) / delta + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / delta + 2
    else h = (r - g) / delta + 4
    h *= 60
  }

  return { h, s, l }
}

function hslToRgb(h, s, l) {
  const hue = ((h % 360) + 360) % 360
  const a = s * Math.min(l, 1 - l)
  const channel = (n) => {
    const k = (n + hue / 30) % 12
    return (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255
  }
  return [channel(0), channel(8), channel(4)].map((value) => Math.round(value))
}

function applyPaletteFromColor(r, g, b) {
  const hsl = rgbToHsl(r, g, b)
  const hue = Number.isFinite(hsl.h) ? hsl.h : 218
  const saturation = Math.max(0.28, Math.min(0.68, hsl.s || 0.24))
  const accent = hslToRgb(hue, saturation, 0.7)
  const secondary = hslToRgb(hue + 24, saturation * 0.82, 0.48)

  document.documentElement.style.setProperty('--accent-rgb', accent.join(', '))
  document.documentElement.style.setProperty('--accent', `rgb(${accent.join(', ')})`)
  document.documentElement.style.setProperty(
    '--ambient-primary',
    `hsla(${hue}, ${Math.round(saturation * 100)}%, 48%, 0.34)`,
  )
  document.documentElement.style.setProperty(
    '--ambient-secondary',
    `hsla(${hue + 24}, ${Math.round(saturation * 100)}%, 38%, 0.25)`,
  )
  document.documentElement.style.setProperty(
    '--accent-bright',
    `rgb(${hslToRgb(hue, Math.min(0.42, saturation), 0.92).join(', ')})`,
  )
  document.documentElement.style.setProperty(
    '--vinyl-accent',
    `${hslToRgb(hue, saturation, 0.5).join(', ')}`,
  )
}

function applyFallbackPalette(seed) {
  let hash = 0
  for (const char of String(seed || '云栖音乐')) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }
  const hue = hash % 360
  applyPaletteFromColor(...hslToRgb(hue, 0.35, 0.53))
}

async function extractPalette(source, token) {
  const image = new Image()
  image.src = source
  image.decoding = 'async'
  await image.decode()

  const canvas = document.createElement('canvas')
  canvas.width = 40
  canvas.height = 40
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.drawImage(image, 0, 0, 40, 40)
  const data = context.getImageData(0, 0, 40, 40).data
  const buckets = new Map()

  for (let index = 0; index < data.length; index += 16) {
    const alpha = data[index + 3]
    if (alpha < 180) continue
    const r = data[index]
    const g = data[index + 1]
    const b = data[index + 2]
    const luminance = (r * 0.299 + g * 0.587 + b * 0.114) / 255
    if (luminance < 0.08 || luminance > 0.94) continue

    const key = `${Math.floor(r / 24)}-${Math.floor(g / 24)}-${Math.floor(b / 24)}`
    const bucket = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 }
    bucket.count += 1
    bucket.r += r
    bucket.g += g
    bucket.b += b
    buckets.set(key, bucket)
  }

  if (token !== state.artToken) return
  const ranked = [...buckets.values()].sort((a, b) => b.count - a.count)
  const selected = ranked.find((bucket) => {
    const color = rgbToHsl(
      bucket.r / bucket.count,
      bucket.g / bucket.count,
      bucket.b / bucket.count,
    )
    return color.s > 0.08 || ranked.length < 4
  })
  const chosen = selected || ranked[0]

  if (chosen) {
    applyPaletteFromColor(
      chosen.r / chosen.count,
      chosen.g / chosen.count,
      chosen.b / chosen.count,
    )
  } else {
    applyFallbackPalette(state.track?.name)
  }
}

async function updatePalette(cover) {
  const token = ++state.artToken
  applyFallbackPalette(cover || state.track?.name)
  if (!cover) return

  try {
    const source = await api.getPaletteSource(cover)
    if (token !== state.artToken) return
    if (source) await extractPalette(source, token)
  } catch {
    // The hashed fallback palette is already applied.
  }
}

async function updateLikeState(trackId, token) {
  state.liked = false
  el.likeButton.classList.remove('is-active')
  try {
    const result = await api.getLikeState(trackId)
    if (token !== state.loadToken) return
    state.liked = Boolean(result.liked)
  } catch {
    state.liked = false
  }
  el.likeButton.classList.toggle('is-active', state.liked)
}

async function prepareTrack(track, { play = false } = {}) {
  const token = ++state.loadToken
  updateTrackUI(track)
  updatePalette(track.cover)
  loadLyrics(track.id, token)
  updateLikeState(track.id, token)
  api.rememberTrack(track).catch(() => {})

  if (play) await startPlayback(track, token)
}

async function resolveSongUrl(track) {
  const cached = state.urlCache.get(track.id)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const value = await api.getSongUrl(track.id)
  if (value?.url) {
    state.urlCache.set(track.id, {
      value,
      expiresAt: Date.now() + 15 * 60 * 1000,
    })
  }
  return value
}

async function startPlayback(track = state.track, token = state.loadToken) {
  if (!track) return

  try {
    if (audio.src && audio.dataset.trackId === String(track.id)) {
      await audio.play()
      return
    }

    const result = await resolveSongUrl(track)
    if (token !== state.loadToken) return
    if (!result?.url) {
      state.playing = false
      updatePlayButton()
      showToast(result?.reason || '当前歌曲没有可用音源')
      return
    }

    audio.dataset.trackId = String(track.id)
    audio.src = result.url
    audio.volume = Number(el.volume.value) / 100
    el.quality.textContent = formatQuality(result)

    await audio.play()
    if (result.limited) showToast('这首歌目前仅能试听部分片段')
  } catch (error) {
    state.playing = false
    updatePlayButton()
    showToast(`播放失败：${friendlyError(error)}`, 3600)
  }
}

async function togglePlayback() {
  if (!state.track) return

  if (audio.paused || !audio.src) {
    await startPlayback()
  } else {
    audio.pause()
  }
}

function findQueueIndex(trackId) {
  return state.queue.findIndex((track) => track.id === trackId)
}

async function playQueueIndex(index) {
  if (!state.queue.length) return
  const nextIndex =
    ((Number(index) % state.queue.length) + state.queue.length) %
    state.queue.length
  state.currentIndex = nextIndex
  renderQueue()
  await prepareTrack(state.queue[nextIndex], { play: true })
}

async function playTrackFromList(track, listKey) {
  const list = state.sources[listKey]
  if (!Array.isArray(list) || !list.length) return
  state.queue = [...list]
  state.queueMode = listKey === 'roam' ? 'roam' : 'context'
  state.currentIndex = findQueueIndex(track.id)
  renderQueue()
  await prepareTrack(track, { play: true })
}

async function extendRoamQueue() {
  if (state.queueMode !== 'roam') return false
  const freshTracks = await api.getRoam(8)
  const existing = new Set(state.queue.map((track) => track.id))
  const additions = (freshTracks || []).filter(
    (track) => !existing.has(track.id),
  )
  if (!additions.length) return false

  state.queue.push(...additions)
  state.sources.roam = state.queue
  renderQueue()
  return true
}

async function loadRoamQueue({ preservePlaying = false } = {}) {
  const tracks = await api.getRoam(8)
  const keepCurrent = preservePlaying && state.playing && state.track
  state.queue = keepCurrent
    ? [state.track, ...tracks.filter((track) => track.id !== state.track.id)]
    : tracks
  state.queueMode = 'roam'
  state.sources.roam = state.queue
  state.currentIndex = state.queue.length ? 0 : -1
  renderQueue()

  if (state.queue.length && !keepCurrent) {
    await prepareTrack(state.queue[0])
  }
}

async function nextTrack({ automatic = false } = {}) {
  if (!state.queue.length) return
  if (automatic && state.repeatMode === 'one') {
    audio.currentTime = 0
    await audio.play()
    return
  }

  if (state.shuffle && state.queue.length > 1) {
    let next = state.currentIndex
    while (next === state.currentIndex) {
      next = Math.floor(Math.random() * state.queue.length)
    }
    await playQueueIndex(next)
    return
  }

  if (state.currentIndex >= state.queue.length - 1) {
    await extendRoamQueue().catch(() => false)
  }

  if (
    automatic &&
    state.repeatMode === 'off' &&
    state.currentIndex >= state.queue.length - 1
  ) {
    audio.pause()
    audio.currentTime = 0
    return
  }

  await playQueueIndex(state.currentIndex + 1)
}

async function previousTrack() {
  if (!state.queue.length) return
  if (audio.currentTime > 3) {
    audio.currentTime = 0
    return
  }
  await playQueueIndex(state.currentIndex - 1)
}

function updateLyricAtTime(time) {
  if (!state.lyrics.length) return
  let nextIndex = -1

  for (let index = 0; index < state.lyrics.length; index += 1) {
    if (state.lyrics[index].time <= time + 0.26) nextIndex = index
    else break
  }

  if (nextIndex === state.lyricIndex) return
  state.lyricIndex = nextIndex

  $$('.lyric-line').forEach((line, index) => {
    line.classList.toggle('is-active', index === nextIndex)
    line.classList.toggle('is-past', index < nextIndex)
  })

  const active = el.lyricsList.querySelector('.lyric-line.is-active')
  if (active) {
    const target =
      active.offsetTop - el.lyricsScroll.clientHeight * 0.37 + active.clientHeight / 2
    el.lyricsScroll.scrollTo({
      top: Math.max(0, target),
      behavior: 'smooth',
    })
  }
}

function updateProgress() {
  const duration = Number.isFinite(audio.duration)
    ? audio.duration
    : (state.track?.duration || 0) / 1000
  const percentage = duration > 0 ? (audio.currentTime / duration) * 100 : 0
  el.progress.value = String(Math.round(percentage * 10))
  setRangeFill(el.progress, percentage)
  el.currentTime.textContent = formatTime(audio.currentTime)
  el.totalTime.textContent = formatTime(duration)
  updateLyricAtTime(audio.currentTime)
}

function updateProfileUI() {
  const profile = state.profile
  const avatar = safeArtwork(profile?.avatar)

  el.profileName.textContent = profile ? profile.name : '登录'
  el.popoverName.textContent = profile ? profile.name : '游客'
  el.popoverStatus.textContent = profile
    ? profile.vip
      ? '黑胶会员'
      : '已同步网易云音乐'
    : '登录后使用账号偏好'
  el.loginAction.textContent = profile ? '重新扫码登录' : '扫码登录'
  el.logoutAction.hidden = !profile

  for (const avatarElement of [el.profileAvatar, el.popoverAvatar]) {
    avatarElement.innerHTML = avatar
      ? `<img src="${escapeHTML(avatar)}" alt="" />`
      : icons.user
  }
}

async function refreshLibrary(showLoading = true) {
  if (showLoading) {
    el.libraryContent.innerHTML =
      '<div class="loading-panel"><span></span></div>'
  }

  try {
    const library = await api.getLibrary()
    state.profile = library.profile || state.profile
    state.daily = library.daily || []
    state.recent = library.recent || []
    state.playlists = library.playlists || []
    state.sources.libraryDaily = state.daily
    state.sources.libraryRecent = state.recent
    updateProfileUI()
    renderLibrary()
  } catch (error) {
    el.libraryContent.innerHTML = '<div class="empty-state"></div>'
    showToast(friendlyError(error))
  }
}

function renderMiniTracks(tracks, listKey) {
  return tracks
    .slice(0, 9)
    .map(
      (track) => `
        <button class="mini-track" data-track-id="${track.id}" data-list-key="${listKey}">
          ${track.cover ? `<img src="${escapeHTML(track.cover)}" alt="" loading="lazy" />` : '<span class="song-thumb"></span>'}
          <div>
            <strong>${escapeHTML(track.name)}</strong>
            <span>${escapeHTML(track.artists?.join(' / ') || '未知歌手')}</span>
          </div>
        </button>
      `,
    )
    .join('')
}

function playlistCards(playlists) {
  if (!playlists.length) {
    return ''
  }

  return `
    <div class="playlist-grid">
      ${playlists
        .map(
          (playlist) => `
            <article class="playlist-card" data-playlist-id="${playlist.id}" tabindex="0" role="button">
              <div class="card-cover">
                ${playlist.cover ? `<img src="${escapeHTML(playlist.cover)}" alt="" loading="lazy" />` : ''}
                <span class="card-play">${icons.play}</span>
              </div>
              <h3>${escapeHTML(playlist.name)}</h3>
              <p>${escapeHTML(playlist.creator || formatCount(playlist.playCount) || `${playlist.trackCount} 首`)}</p>
            </article>
          `,
        )
        .join('')}
    </div>
  `
}

function renderLibrary() {
  const loginBanner = state.profile
    ? ''
    : `
      <section class="login-banner">
        <h2>登录网易云音乐</h2>
        <button class="primary-button" id="login-inline-button">${icons.user}扫码登录</button>
      </section>
    `

  const playlistSection = state.profile
    ? `
      <section class="library-section">
        <div class="section-heading">
          <h2>我的歌单</h2>
          <span class="section-count">${state.playlists.length} 个收藏</span>
        </div>
        ${playlistCards(state.playlists)}
      </section>
    `
    : ''

  const recentSection = state.recent.length
    ? `
      <section class="library-section">
        <div class="section-heading">
          <h2>最近聆听</h2>
        </div>
        <div class="mini-track-grid">${renderMiniTracks(state.recent, 'libraryRecent')}</div>
      </section>
    `
    : ''

  el.libraryContent.innerHTML = `
    ${loginBanner}
    <section class="library-section">
      <div class="section-heading">
        <h2>${state.profile ? '今日为你选' : '今天的推荐'}</h2>
      </div>
      ${
        state.daily.length
          ? `<div class="mini-track-grid">${renderMiniTracks(state.daily, 'libraryDaily')}</div>`
          : '<div class="empty-state"></div>'
      }
    </section>
    ${recentSection}
    ${playlistSection}
  `

  $('#login-inline-button')?.addEventListener('click', openLoginDialog)
}

function renderSongTable(songs, listKey, limit = 40) {
  if (!songs.length) {
    return '<div class="empty-state"></div>'
  }

  return `
    <div class="song-table">
      ${songs
        .slice(0, limit)
        .map(
          (track, index) => `
            <button class="song-row ${state.track?.id === track.id ? 'is-current' : ''}" data-track-id="${track.id}" data-list-key="${listKey}">
              <span class="song-number">${String(index + 1).padStart(2, '0')}</span>
              <span class="song-title-cell">
                <span class="song-thumb">${track.cover ? `<img src="${escapeHTML(track.cover)}" alt="" loading="lazy" />` : ''}</span>
                <span class="song-copy">
                  <strong>${escapeHTML(track.name)}</strong>
                  <span>${escapeHTML(track.artists?.join(' / ') || '未知歌手')}</span>
                </span>
              </span>
              <span class="song-album-cell">${escapeHTML(track.album || '')}</span>
              <span class="song-duration">${formatTime(track.duration / 1000)}</span>
            </button>
          `,
        )
        .join('')}
    </div>
  `
}

async function performSearch(query) {
  const keyword = String(query || '').trim()
  if (!keyword) return
  const token = ++state.searchToken
  el.searchInput.value = keyword
  el.searchResults.innerHTML =
    '<div class="loading-panel"><span></span></div>'

  try {
    const result = await api.search(keyword)
    if (token !== state.searchToken) return
    state.sources.searchSongs = result.songs || []
    state.sources.searchPlaylists = result.playlists || []

    el.searchResults.innerHTML = `
      <section class="result-section">
        <div class="section-heading">
          <h2>歌曲</h2>
          <span class="section-count">${result.songs?.length || 0} 个结果</span>
        </div>
        ${renderSongTable(result.songs || [], 'searchSongs', 24)}
      </section>
      ${
        result.playlists?.length
          ? `
            <section class="result-section">
              <div class="section-heading">
                <h2>相关歌单</h2>
                <span class="section-count">顺着情绪继续找</span>
              </div>
              ${playlistCards(result.playlists)}
            </section>
          `
          : ''
      }
    `
  } catch (error) {
    if (token !== state.searchToken) return
    el.searchResults.innerHTML = '<div class="empty-state"></div>'
    showToast(friendlyError(error))
  }
}

function setView(view, { returnView } = {}) {
  if (view === 'playlist' && returnView) state.returnView = returnView
  else if (view !== 'playlist') state.returnView = view

  state.currentView = view
  $$('.view').forEach((element) => {
    element.classList.toggle('is-active', element.dataset.view === view)
  })

  const navView = view === 'playlist' ? state.returnView : view
  $$('.nav-button').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.nav === navView)
  })

  $('#main-content').scrollTop = 0
  if (view === 'search') {
    requestAnimationFrame(() => el.searchInput.focus())
  }
}

async function openPlaylist(playlistId) {
  const previousView = state.currentView === 'playlist' ? state.returnView : state.currentView
  setView('playlist', { returnView: previousView })
  el.playlistContent.innerHTML =
    '<div class="loading-panel"><span></span></div>'

  try {
    const playlist = await api.getPlaylist(playlistId)
    state.activePlaylist = playlist
    state.sources.playlist = playlist.tracks
    renderPlaylist(playlist)
  } catch (error) {
    el.playlistContent.innerHTML = '<div class="empty-state"></div>'
    showToast(friendlyError(error))
  }
}

function renderPlaylist(playlist) {
  el.playlistContent.innerHTML = `
    <header class="playlist-hero">
      <div class="playlist-art">
        ${playlist.cover ? `<img src="${escapeHTML(playlist.cover)}" alt="" />` : ''}
      </div>
      <div class="playlist-meta">
        <p class="eyebrow">PLAYLIST</p>
        <h1>${escapeHTML(playlist.name)}</h1>
        ${playlist.description ? `<p class="playlist-description">${escapeHTML(playlist.description)}</p>` : ''}
        <div class="playlist-facts">
          ${playlist.creator ? `<span>${escapeHTML(playlist.creator)}</span><i></i>` : ''}
          <span>${playlist.trackCount || playlist.tracks.length} 首</span>
          ${playlist.playCount ? `<i></i><span>${formatCount(playlist.playCount)} 次播放</span>` : ''}
        </div>
        <div class="playlist-actions">
          <button class="primary-button" id="playlist-play-button">${icons.play}播放全部</button>
        </div>
      </div>
    </header>
    ${renderSongTable(playlist.tracks, 'playlist', 1000)}
  `

  $('#playlist-play-button').addEventListener('click', () => {
    if (playlist.tracks[0]) playTrackFromList(playlist.tracks[0], 'playlist')
  })
}

function queueItem(track, index) {
  return `
    <button class="queue-item ${state.track?.id === track.id ? 'is-current' : ''}" data-queue-index="${index}">
      <span class="queue-index">${state.track?.id === track.id ? '●' : String(index + 1).padStart(2, '0')}</span>
      ${track.cover ? `<img src="${escapeHTML(track.cover)}" alt="" loading="lazy" />` : '<span class="song-thumb"></span>'}
      <span class="queue-copy">
        <strong>${escapeHTML(track.name)}</strong>
        <span>${escapeHTML(track.artists?.join(' / ') || '未知歌手')}</span>
      </span>
      <span class="queue-time">${formatTime(track.duration / 1000)}</span>
    </button>
  `
}

function renderQueue() {
  el.queueCount.textContent = String(state.queue.length)
  el.queueSummary.textContent = state.queue.length
    ? state.queueMode === 'roam'
      ? `漫游队列 · ${state.queue.length} 首`
      : `待播队列 · ${state.queue.length} 首`
    : '暂无待播歌曲'
  el.queueDuration.textContent = formatDuration(
    state.queue.reduce((total, track) => total + (track.duration || 0) / 1000, 0),
  )
  el.queueList.innerHTML = state.queue.map(queueItem).join('')
  el.queueEmpty.classList.toggle('is-visible', state.queue.length === 0)
}

function setQueueOpen(open) {
  el.queuePanel.classList.toggle('is-open', open)
  el.queuePanel.setAttribute('aria-hidden', open ? 'false' : 'true')
}

function setProfileOpen(open) {
  el.popover.classList.toggle('is-open', open)
  el.popover.setAttribute('aria-hidden', open ? 'false' : 'true')
  el.popoverBackdrop.classList.toggle('is-visible', open)
}

async function checkApplicationUpdate({ silent = true } = {}) {
  if (state.checkingUpdate) return
  state.checkingUpdate = true
  el.updateAction.disabled = true
  el.updateAction.textContent = '正在检查'

  try {
    const result = await api.checkUpdate()
    if (result.available) {
      state.updateInfo = result
      el.updateAction.textContent = `更新到 ${result.latestVersion}`
      showToast(`发现新版本 ${result.latestVersion}`, 4200)
    } else {
      state.updateInfo = null
      el.updateAction.textContent = '检查更新'
      if (!silent) showToast('已是最新版本')
    }
  } catch (error) {
    el.updateAction.textContent = '检查更新'
    if (!silent) showToast(friendlyError(error), 4200)
  } finally {
    state.checkingUpdate = false
    el.updateAction.disabled = false
  }
}

async function handleUpdateAction() {
  if (!state.updateInfo) {
    await checkApplicationUpdate({ silent: false })
    return
  }

  setProfileOpen(false)
  el.updateAction.disabled = true
  el.updateAction.textContent = '正在下载'
  showToast(`正在下载 ${state.updateInfo.latestVersion}`)
  try {
    await api.installUpdate(state.updateInfo)
  } catch (error) {
    state.updateInfo = null
    el.updateAction.disabled = false
    el.updateAction.textContent = '检查更新'
    showToast(friendlyError(error), 4200)
  }
}

async function openLoginDialog() {
  setProfileOpen(false)
  showToast('已打开网易云官方登录窗口，请在窗口中扫码')

  try {
    const result = await api.webLogin()
    if (!result?.ok) {
      if (result?.error) showToast(result.error, 4200)
      return
    }

    state.profile = result.profile
    updateProfileUI()
    showToast(`欢迎回来，${state.profile?.name || '音乐朋友'}`)
    refreshLibrary(false)
    loadRoamQueue({ preservePlaying: true }).catch((error) => {
      showToast(friendlyError(error))
    })
  } catch (error) {
    showToast(`登录失败：${friendlyError(error)}`, 4200)
  }
}

async function toggleLike() {
  if (!state.track) return
  if (!state.profile) {
    showToast('登录后才能把歌曲留在这里')
    openLoginDialog()
    return
  }

  const previous = state.liked
  state.liked = !previous
  el.likeButton.classList.toggle('is-active', state.liked)

  try {
    await api.setLike(state.track.id, state.liked)
    showToast(state.liked ? '已经放进了喜欢的音乐' : '已从喜欢的音乐中移除')
  } catch (error) {
    state.liked = previous
    el.likeButton.classList.toggle('is-active', previous)
    showToast(friendlyError(error))
  }
}

function cycleRepeatMode() {
  state.repeatMode =
    state.repeatMode === 'all'
      ? 'one'
      : state.repeatMode === 'one'
        ? 'off'
        : 'all'
  el.repeatButton.classList.toggle('is-active', state.repeatMode !== 'off')
  el.repeatButton.dataset.mode = state.repeatMode
  showToast(
    state.repeatMode === 'all'
      ? '列表循环'
      : state.repeatMode === 'one'
        ? '单曲循环'
        : '顺序播放',
  )
}

function bindEvents() {
  $('#window-minimize').addEventListener('click', api.minimize)
  $('#window-maximize').addEventListener('click', api.toggleMaximize)
  $('#window-close').addEventListener('click', api.close)
  api.onWindowState(({ maximized }) => {
    const button = $('#window-maximize')
    button.title = maximized ? '还原' : '最大化'
  })

  $$('.nav-button').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.nav))
  })

  $('#top-search-button').addEventListener('click', () => setView('search'))
  el.playButton.addEventListener('click', togglePlayback)
  $('#prev-button').addEventListener('click', previousTrack)
  $('#next-button').addEventListener('click', () => nextTrack())
  el.likeButton.addEventListener('click', toggleLike)
  el.shuffleButton.addEventListener('click', () => {
    state.shuffle = !state.shuffle
    el.shuffleButton.classList.toggle('is-active', state.shuffle)
    showToast(state.shuffle ? '随机播放已开启' : '随机播放已关闭')
  })
  el.repeatButton.addEventListener('click', cycleRepeatMode)
  $('#track-more').addEventListener('click', () => setQueueOpen(true))

  el.progress.addEventListener('input', () => {
    const value = Number(el.progress.value) / 1000
    const duration = Number.isFinite(audio.duration)
      ? audio.duration
      : (state.track?.duration || 0) / 1000
    setRangeFill(el.progress, value * 100)
    el.currentTime.textContent = formatTime(value * duration)
  })
  el.progress.addEventListener('change', () => {
    const duration = Number.isFinite(audio.duration)
      ? audio.duration
      : (state.track?.duration || 0) / 1000
    if (duration > 0) audio.currentTime = (Number(el.progress.value) / 1000) * duration
  })

  el.volume.addEventListener('input', () => {
    const volume = Number(el.volume.value) / 100
    audio.volume = volume
    audio.muted = volume === 0
    setRangeFill(el.volume, volume * 100)
    el.muteButton.innerHTML = volume === 0 ? icons.mute : icons.volume
    api.setVolume(volume).catch(() => {})
  })

  el.muteButton.addEventListener('click', () => {
    audio.muted = !audio.muted
    el.muteButton.innerHTML = audio.muted ? icons.mute : icons.volume
  })

  audio.addEventListener('play', () => {
    state.playing = true
    updatePlayButton()
  })
  audio.addEventListener('pause', () => {
    state.playing = false
    updatePlayButton()
  })
  audio.addEventListener('timeupdate', updateProgress)
  audio.addEventListener('loadedmetadata', updateProgress)
  audio.addEventListener('ended', () => nextTrack({ automatic: true }))
  audio.addEventListener('error', () => {
    if (!audio.src) return
    showToast('音频加载中断，请检查网络或尝试下一首')
  })

  el.lyricsList.addEventListener('click', (event) => {
    const line = event.target.closest('[data-lyric-index]')
    if (!line) return
    audio.currentTime = Number(line.dataset.time)
    updateLyricAtTime(audio.currentTime)
  })

  $('#queue-toggle').addEventListener('click', () => setQueueOpen(true))
  $('#open-queue-button').addEventListener('click', () => setQueueOpen(true))
  $('#queue-close').addEventListener('click', () => setQueueOpen(false))
  $('#queue-backdrop').addEventListener('click', () => setQueueOpen(false))
  $('#queue-find-button').addEventListener('click', () => {
    setQueueOpen(false)
    setView('search')
  })
  el.queueList.addEventListener('click', (event) => {
    const item = event.target.closest('[data-queue-index]')
    if (item) playQueueIndex(Number(item.dataset.queueIndex))
  })

  el.profileButton.addEventListener('click', (event) => {
    event.stopPropagation()
    setProfileOpen(!el.popover.classList.contains('is-open'))
  })
  el.popoverBackdrop.addEventListener('click', () => setProfileOpen(false))
  el.loginAction.addEventListener('click', openLoginDialog)
  el.updateAction.addEventListener('click', handleUpdateAction)
  el.logoutAction.addEventListener('click', async () => {
    try {
      await api.logout()
      state.profile = null
      state.recent = []
      state.playlists = []
      updateProfileUI()
      setProfileOpen(false)
      showToast('已经退出登录')
      refreshLibrary(false)
      loadRoamQueue({ preservePlaying: true }).catch(() => {})
    } catch (error) {
      showToast(friendlyError(error))
    }
  })

  $('#search-form').addEventListener('submit', (event) => {
    event.preventDefault()
    performSearch(el.searchInput.value)
  })
  $('#search-suggestions').addEventListener('click', (event) => {
    const button = event.target.closest('[data-query]')
    if (button) performSearch(button.dataset.query)
  })
  $('#library-refresh-button').addEventListener('click', () => refreshLibrary())
  $('#playlist-back-button').addEventListener('click', () => setView(state.returnView))

  $('.main-content').addEventListener('click', (event) => {
    const trackElement = event.target.closest('[data-track-id][data-list-key]')
    if (trackElement) {
      const list = state.sources[trackElement.dataset.listKey] || []
      const track = list.find((item) => item.id === Number(trackElement.dataset.trackId))
      if (track) playTrackFromList(track, trackElement.dataset.listKey)
      return
    }

    const playlistElement = event.target.closest('[data-playlist-id]')
    if (playlistElement) openPlaylist(Number(playlistElement.dataset.playlistId))
  })
  $('.main-content').addEventListener('keydown', (event) => {
    const playlistElement = event.target.closest('[data-playlist-id]')
    if (playlistElement && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      openPlaylist(Number(playlistElement.dataset.playlistId))
    }
  })

  document.addEventListener('keydown', (event) => {
    const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      setView('search')
      return
    }
    if (event.key === 'Escape') {
      setQueueOpen(false)
      setProfileOpen(false)
      return
    }
    if (typing) return

    if (event.code === 'Space') {
      event.preventDefault()
      togglePlayback()
    } else if (event.key === 'ArrowRight') {
      audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5)
    } else if (event.key === 'ArrowLeft') {
      audio.currentTime = Math.max(0, audio.currentTime - 5)
    }
  })

  if (navigator.mediaSession) {
    navigator.mediaSession.setActionHandler('play', () => startPlayback())
    navigator.mediaSession.setActionHandler('pause', () => audio.pause())
    navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack())
    navigator.mediaSession.setActionHandler('previoustrack', previousTrack)
  }
}

async function initialize() {
  bindEvents()
  updatePlayButton()
  updateProfileUI()
  renderQueue()

  try {
    const bootstrap = await api.bootstrap()
    state.profile = bootstrap.profile
    updateProfileUI()
    state.queue = bootstrap.roam || []
    state.queueMode = 'roam'
    state.sources.roam = state.queue
    state.currentIndex = state.queue.length ? 0 : -1

    const volume = Math.round((bootstrap.volume ?? 0.78) * 100)
    el.volume.value = String(volume)
    setRangeFill(el.volume, volume)
    audio.volume = volume / 100
    if (volume === 0) el.muteButton.innerHTML = icons.mute

    if (state.queue.length) {
      await prepareTrack(state.queue[0])
    } else {
      updateTrackUI(null)
      resetLyrics('')
    }
    renderQueue()
  } catch (error) {
    updateTrackUI(null)
    resetLyrics('')
    showToast(`接口连接失败：${friendlyError(error)}`, 4200)
  }

  window.setTimeout(() => {
    checkApplicationUpdate({ silent: true })
  }, 4500)
}

initialize()
