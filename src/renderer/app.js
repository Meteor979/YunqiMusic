const api = window.yunqi
const audio = document.getElementById('audio-element')
audio.crossOrigin = 'anonymous'

const $ = (selector) => document.querySelector(selector)
const $$ = (selector) => [...document.querySelectorAll(selector)]

const state = {
  profile: null,
  profiles: {
    netease: null,
    kugou: null,
    qq: null,
  },
  primaryProvider: 'netease',
  secondaryEnabled: true,
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
  loudnessEnabled: true,
  equalizerEnabled: true,
  equalizerBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  trackLoudnessDb: 0,
  playbackUrls: [],
  playbackUrlIndex: 0,
  loadToken: 0,
  searchToken: 0,
  artToken: 0,
  urlCache: new Map(),
  updateInfo: null,
  checkingUpdate: false,
  loginQrTimer: null,
  loginQrBusy: false,
  loginQrProvider: '',
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
  playButton: $('#play-button'),
  lyricsScroll: $('#lyrics-scroll'),
  lyricsList: $('#lyrics-list'),
  queuePanel: $('#queue-panel'),
  queueList: $('#queue-list'),
  queueEmpty: $('#queue-empty'),
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
  providerLoginDialog: $('#provider-login-dialog'),
  providerLoginTitle: $('#provider-login-title'),
  providerLoginQr: $('#provider-login-qr'),
  providerLoginLoading: $('#provider-login-loading'),
  providerLoginStatus: $('#provider-login-status'),
  searchInput: $('#search-input'),
  searchResults: $('#search-results'),
  libraryContent: $('#library-content'),
  playlistContent: $('#playlist-content'),
  quality: $('#quality-label'),
  likeButton: $('#like-button'),
  shuffleButton: $('#shuffle-button'),
  repeatButton: $('#repeat-button'),
  equalizerPanel: $('#equalizer-panel'),
  equalizerBands: $('#equalizer-bands'),
  equalizerToggle: $('#equalizer-toggle'),
  loudnessToggle: $('#loudness-toggle'),
  equalizerPresets: $('#equalizer-presets'),
  toastStack: $('#toast-stack'),
  tooltip: $('#app-tooltip'),
}

const icons = {
  play: '<svg aria-hidden="true"><use href="#icon-play"></use></svg>',
  pause: '<svg aria-hidden="true"><use href="#icon-pause"></use></svg>',
  volume: '<svg aria-hidden="true"><use href="#icon-volume"></use></svg>',
  mute: '<svg aria-hidden="true"><use href="#icon-mute"></use></svg>',
  heart: '<svg aria-hidden="true"><use href="#icon-heart"></use></svg>',
  user: '<svg aria-hidden="true"><use href="#icon-user"></use></svg>',
}

const PROVIDER_LABELS = {
  netease: '网易云',
  kugou: '酷狗',
  qq: 'QQ 音乐',
}

const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
const EQ_PRESETS = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  warm: [2, 1.5, 1, 0.5, 0, -0.5, -0.5, 0, 0.5, 1],
  vocal: [-1, -0.5, 0, 1, 2, 2.5, 2, 1, 0, -1],
  bass: [4, 3.5, 2.5, 1.5, 0, -0.5, -1, -0.5, 0, 0.5],
}

let audioContext = null
let mediaSource = null
let normalizerGain = null
let compressor = null
let equalizerNodes = []
let saveAudioTimer = null
let tooltipTarget = null
let tooltipTimer = null

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

function providerBadge(provider) {
  return `<i class="provider-badge">${PROVIDER_LABELS[provider] || '音乐'}</i>`
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

  const source = result.sourceProvider
    ? `${PROVIDER_LABELS[result.sourceProvider]}${result.fallbackUsed ? '补源' : ''}`
    : ''
  return [source, level, type, bitrate].filter(Boolean).join(' · ')
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

function hideTooltip() {
  if (tooltipTimer) {
    window.clearTimeout(tooltipTimer)
    tooltipTimer = null
  }
  tooltipTarget = null
  el.tooltip.classList.remove('is-visible')
}

function showTooltip(target) {
  const text = target.dataset.tooltip
  if (!text) return
  tooltipTarget = target
  el.tooltip.textContent = text
  const placement = target.dataset.tooltipPlacement || 'top'
  el.tooltip.dataset.placement = placement
  const rect = target.getBoundingClientRect()

  if (placement === 'right') {
    el.tooltip.style.left = `${rect.right + 9}px`
    el.tooltip.style.top = `${rect.top + rect.height / 2}px`
  } else {
    const center = rect.left + rect.width / 2
    el.tooltip.style.left = `${Math.max(10, center)}px`
    el.tooltip.style.top =
      placement === 'bottom' ? `${rect.bottom + 3}px` : `${rect.top - 3}px`
  }
  el.tooltip.classList.add('is-visible')
}

function scheduleTooltip(target) {
  if (tooltipTimer) window.clearTimeout(tooltipTimer)
  tooltipTarget = target
  tooltipTimer = window.setTimeout(() => {
    if (tooltipTarget === target) showTooltip(target)
  }, 180)
}

function dbToGain(value) {
  return Math.pow(10, value / 20)
}

function applyEqualizer() {
  if (!audioContext || !equalizerNodes.length) return
  const now = audioContext.currentTime
  equalizerNodes.forEach((filter, index) => {
    const gain = state.equalizerEnabled ? state.equalizerBands[index] : 0
    filter.gain.setTargetAtTime(gain, now, 0.04)
  })
  el.equalizerBands.classList.toggle('is-disabled', !state.equalizerEnabled)
}

function applyLoudnessNormalization() {
  if (!audioContext || !normalizerGain || !compressor) return
  const now = audioContext.currentTime

  if (!state.loudnessEnabled) {
    normalizerGain.gain.setTargetAtTime(1, now, 0.05)
    compressor.threshold.setTargetAtTime(0, now, 0.05)
    compressor.knee.setTargetAtTime(0, now, 0.05)
    compressor.ratio.setTargetAtTime(1, now, 0.05)
    return
  }

  const reference = Number.isFinite(state.trackLoudnessDb)
    ? state.trackLoudnessDb
    : 0
  const gentleTrackGain =
    reference === 0
      ? 0.6
      : reference < 0
        ? Math.max(-3.5, reference * 0.35)
        : Math.min(1.5, reference * 0.7)

  normalizerGain.gain.setTargetAtTime(dbToGain(gentleTrackGain), now, 0.08)
  compressor.threshold.setTargetAtTime(-10, now, 0.05)
  compressor.knee.setTargetAtTime(14, now, 0.05)
  compressor.ratio.setTargetAtTime(2.5, now, 0.05)
  compressor.attack.setTargetAtTime(0.006, now, 0.02)
  compressor.release.setTargetAtTime(0.24, now, 0.05)
}

async function ensureAudioGraph() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return

    audioContext = new AudioContextClass({ latencyHint: 'playback' })
    mediaSource = audioContext.createMediaElementSource(audio)
    normalizerGain = audioContext.createGain()
    compressor = audioContext.createDynamicsCompressor()
    equalizerNodes = EQ_FREQUENCIES.map((frequency) => {
      const filter = audioContext.createBiquadFilter()
      filter.type = 'peaking'
      filter.frequency.value = frequency
      filter.Q.value = 1.05
      filter.gain.value = 0
      return filter
    })

    mediaSource.connect(normalizerGain)
    normalizerGain.connect(compressor)
    let previous = compressor
    for (const filter of equalizerNodes) {
      previous.connect(filter)
      previous = filter
    }
    previous.connect(audioContext.destination)
  }

  if (audioContext.state === 'suspended') await audioContext.resume()
  applyLoudnessNormalization()
  applyEqualizer()
}

function saveAudioSettings() {
  if (saveAudioTimer) window.clearTimeout(saveAudioTimer)
  saveAudioTimer = window.setTimeout(() => {
    api
      .setAudioSettings({
        loudnessEnabled: state.loudnessEnabled,
        equalizerEnabled: state.equalizerEnabled,
        equalizerBands: state.equalizerBands,
      })
      .catch(() => {})
  }, 250)
}

function formatBandValue(value) {
  const rounded = Math.round(Number(value) * 2) / 2
  return `${rounded > 0 ? '+' : ''}${rounded}`
}

function renderEqualizerBands() {
  el.equalizerBands.innerHTML = EQ_FREQUENCIES.map((frequency, index) => {
    const label = frequency >= 1000 ? `${frequency / 1000}k` : String(frequency)
    return `
      <label class="eq-band">
        <span class="eq-value">${formatBandValue(state.equalizerBands[index])}</span>
        <input
          type="range"
          min="-12"
          max="12"
          step="0.5"
          value="${state.equalizerBands[index]}"
          data-eq-index="${index}"
          aria-label="${frequency} Hz"
        />
        <span class="eq-frequency">${label}</span>
      </label>
    `
  }).join('')

  el.equalizerBands.classList.toggle(
    'is-disabled',
    !state.equalizerEnabled,
  )
  el.equalizerToggle.checked = state.equalizerEnabled
  el.loudnessToggle.checked = state.loudnessEnabled
  updatePresetSelection()
}

function updatePresetSelection() {
  for (const button of $$('#equalizer-presets [data-preset]')) {
    const preset = EQ_PRESETS[button.dataset.preset]
    button.classList.toggle(
      'is-active',
      preset?.every(
        (value, index) => Number(value) === Number(state.equalizerBands[index]),
      ),
    )
  }
}

function setEqualizerPreset(name) {
  if (!EQ_PRESETS[name]) return
  state.equalizerBands = [...EQ_PRESETS[name]]
  renderEqualizerBands()
  applyEqualizer()
  saveAudioSettings()
}

function updatePlayButton() {
  const markup = state.playing ? icons.pause : icons.play
  el.playButton.innerHTML = markup
  el.playButton.dataset.tooltip = state.playing ? '暂停' : '播放'
  el.playButton.setAttribute('aria-label', state.playing ? '暂停' : '播放')
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

async function loadLyrics(track, token) {
  resetLyrics('')
  try {
    const lyric = await api.getLyric(track)
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

async function updateLikeState(track, token) {
  state.liked = false
  el.likeButton.classList.remove('is-active')
  try {
    const result = await api.getLikeState(track)
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
  loadLyrics(track, token)
  updateLikeState(track, token)
  api.rememberTrack(track).catch(() => {})

  if (play) await startPlayback(track, token)
}

async function resolveSongUrl(track) {
  const cached = state.urlCache.get(track.id)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const value = await api.getSongUrl(track)
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
      await ensureAudioGraph()
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

    await ensureAudioGraph()
    audio.dataset.trackId = String(track.id)
    state.trackLoudnessDb = Number(result.gain || 0)
    state.playbackUrls = result.urls?.length
      ? result.urls
      : [result.url]
    state.playbackUrlIndex = 0
    applyLoudnessNormalization()
    audio.src = result.url
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
        active.offsetTop - el.lyricsScroll.clientHeight * 0.27 + active.clientHeight / 2
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
  state.profile = state.profiles[state.primaryProvider] || null
  const profile = state.profile
  const avatar = safeArtwork(profile?.avatar)

  el.profileName.textContent = profile ? profile.name : '登录'
  el.popoverName.textContent = profile ? profile.name : '游客'
  el.popoverStatus.textContent = profile
    ? profile.vip
      ? `${PROVIDER_LABELS[state.primaryProvider]}会员`
      : `主平台 · ${PROVIDER_LABELS[state.primaryProvider]}`
    : `主平台 · ${PROVIDER_LABELS[state.primaryProvider]}`
  el.loginAction.textContent = profile
    ? `重新登录${PROVIDER_LABELS[state.primaryProvider]}`
    : `登录${PROVIDER_LABELS[state.primaryProvider]}`
  el.logoutAction.hidden = !profile

  $$('[data-primary-provider]').forEach((button) => {
    button.classList.toggle(
      'is-active',
      button.dataset.primaryProvider === state.primaryProvider,
    )
  })

  for (const provider of ['netease', 'kugou', 'qq']) {
    const account = state.profiles[provider]
    const button = $(`[data-login-provider="${provider}"]`)
    const status = button?.querySelector('small')
    button?.classList.toggle('is-logged-in', Boolean(account))
    if (status) status.textContent = account ? account.name : '未登录'
  }

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
    state.profiles[state.primaryProvider] =
      library.profile || state.profiles[state.primaryProvider]
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
            <span>${escapeHTML(track.artists?.join(' / ') || '未知歌手')} ${providerBadge(track.provider)}</span>
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
              <p>${escapeHTML(playlist.creator || formatCount(playlist.playCount) || `${playlist.trackCount} 首`)} ${providerBadge(playlist.provider)}</p>
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

  $('#login-inline-button')?.addEventListener('click', () =>
    loginProvider(state.primaryProvider),
  )
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
                  <span>${escapeHTML(track.artists?.join(' / ') || '未知歌手')} ${providerBadge(track.provider)}</span>
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
        <p class="eyebrow">${PROVIDER_LABELS[playlist.provider] || 'PLAYLIST'} PLAYLIST</p>
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
        <span>${escapeHTML(track.artists?.join(' / ') || '未知歌手')} ${providerBadge(track.provider)}</span>
      </span>
      <span class="queue-time">${formatTime(track.duration / 1000)}</span>
    </button>
  `
}

function renderQueue() {
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
  if (open) setEqualizerOpen(false)
  el.queuePanel.classList.toggle('is-open', open)
  el.queuePanel.setAttribute('aria-hidden', open ? 'false' : 'true')
}

function setEqualizerOpen(open) {
  if (open) setQueueOpen(false)
  el.equalizerPanel.classList.toggle('is-open', open)
  el.equalizerPanel.setAttribute('aria-hidden', open ? 'false' : 'true')
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

function closeProviderQrTimer() {
  if (state.loginQrTimer) {
    window.clearTimeout(state.loginQrTimer)
    state.loginQrTimer = null
  }
  state.loginQrBusy = false
}

function closeProviderLoginDialog() {
  closeProviderQrTimer()
  if (el.providerLoginDialog.open) el.providerLoginDialog.close()
}

async function startProviderQrLogin(provider = state.loginQrProvider) {
  if (!['kugou', 'qq'].includes(provider)) return
  state.loginQrProvider = provider
  closeProviderQrTimer()
  el.providerLoginTitle.textContent = `${PROVIDER_LABELS[provider]}登录`
  el.providerLoginQr.removeAttribute('src')
  el.providerLoginLoading.hidden = false
  el.providerLoginStatus.textContent = '正在生成二维码'

  try {
    const result =
      provider === 'kugou'
        ? await api.startKugouQrLogin()
        : await api.startQqQrLogin()
    el.providerLoginQr.src = result.image
    el.providerLoginLoading.hidden = true
    el.providerLoginStatus.textContent = '等待扫码'

    const poll = async () => {
      if (!el.providerLoginDialog.open || state.loginQrBusy) return
      state.loginQrBusy = true
      try {
        const status =
          provider === 'kugou'
            ? await api.checkKugouQrLogin()
            : await api.checkQqQrLogin()
        const success =
          provider === 'kugou' ? status.code === 4 : status.code === 200
        if (success && status.profile) {
          state.profiles[provider] = status.profile
          updateProfileUI()
          closeProviderLoginDialog()
          showToast(
            `已登录${PROVIDER_LABELS[provider]}：${status.profile.name || ''}`,
          )
          if (state.primaryProvider === provider) {
            refreshLibrary(false)
            loadRoamQueue({ preservePlaying: true }).catch(() => {})
          }
          return
        }
        el.providerLoginStatus.textContent =
          status.message || '等待扫码'
        if (status.code === 0 || status.code === 800) return
        state.loginQrTimer = window.setTimeout(poll, 1500)
      } catch (error) {
        el.providerLoginStatus.textContent = friendlyError(error)
        if (el.providerLoginDialog.open) {
          state.loginQrTimer = window.setTimeout(poll, 2500)
        }
      } finally {
        state.loginQrBusy = false
      }
    }
    state.loginQrTimer = window.setTimeout(poll, 1200)
  } catch (error) {
    el.providerLoginLoading.hidden = true
    el.providerLoginStatus.textContent = friendlyError(error)
  }
}

async function openProviderLoginDialog(provider) {
  state.loginQrProvider = provider
  if (!el.providerLoginDialog.open) el.providerLoginDialog.showModal()
  await startProviderQrLogin(provider)
}

async function loginProvider(provider = state.primaryProvider) {
  setProfileOpen(false)
  if (provider === 'kugou' || provider === 'qq') {
    await openProviderLoginDialog(provider)
    return
  }

  showToast('已打开网易云官方登录窗口，请在窗口中扫码')

  try {
    const result = await api.webLogin()
    if (!result?.ok) {
      if (result?.error) showToast(result.error, 4200)
      return
    }

    state.profiles.netease = result.profile
    updateProfileUI()
    showToast(`已登录网易云音乐：${result.profile?.name || ''}`)
    if (state.primaryProvider === 'netease') {
      refreshLibrary(false)
      loadRoamQueue({ preservePlaying: true }).catch((error) => {
        showToast(friendlyError(error))
      })
    }
  } catch (error) {
    showToast(`登录失败：${friendlyError(error)}`, 4200)
  }
}

async function setPrimaryProvider(provider) {
  if (!PROVIDER_LABELS[provider] || provider === state.primaryProvider) return
  try {
    const result = await api.setPrimaryProvider(provider)
    state.primaryProvider = result.primaryProvider
    state.profiles = result.profiles
    updateProfileUI()
    await Promise.all([
      refreshLibrary(false),
      loadRoamQueue({ preservePlaying: true }),
    ])
  } catch (error) {
    showToast(friendlyError(error), 4200)
  }
}

async function toggleLike() {
  if (!state.track) return
  if (!state.profiles[state.track.provider]) {
    showToast('登录后才能把歌曲留在这里')
    loginProvider(state.track.provider)
    return
  }

  const previous = state.liked
  state.liked = !previous
  el.likeButton.classList.toggle('is-active', state.liked)

  try {
    await api.setLike(state.track, state.liked)
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
  document.addEventListener('pointerover', (event) => {
    const target = event.target.closest?.('[data-tooltip]')
    if (target && target !== tooltipTarget) scheduleTooltip(target)
  })
  document.addEventListener('pointerout', (event) => {
    const target = event.target.closest?.('[data-tooltip]')
    if (
      target &&
      (!event.relatedTarget || !target.contains(event.relatedTarget))
    ) {
      hideTooltip()
    }
  })
  document.addEventListener('focusin', (event) => {
    const target = event.target.closest?.('[data-tooltip]')
    if (target) scheduleTooltip(target)
  })
  document.addEventListener('focusout', hideTooltip)
  document.addEventListener('click', hideTooltip)
  window.addEventListener('blur', hideTooltip)
  window.addEventListener('resize', hideTooltip)
  document.addEventListener('scroll', hideTooltip, true)

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
    const nextUrl = state.playbackUrls[state.playbackUrlIndex + 1]
    if (nextUrl) {
      state.playbackUrlIndex += 1
      audio.src = nextUrl
      audio.play().catch(() => {})
      return
    }
    showToast('音频加载中断，请检查网络或尝试下一首')
  })

  el.lyricsList.addEventListener('click', (event) => {
    const line = event.target.closest('[data-lyric-index]')
    if (!line) return
    audio.currentTime = Number(line.dataset.time)
    updateLyricAtTime(audio.currentTime)
  })

  $('#queue-toggle').addEventListener('click', () => setQueueOpen(true))
  $('#equalizer-button').addEventListener('click', () => setEqualizerOpen(true))
  $('#queue-close').addEventListener('click', () => setQueueOpen(false))
  $('#queue-backdrop').addEventListener('click', () => setQueueOpen(false))
  $('#equalizer-close').addEventListener('click', () => setEqualizerOpen(false))
  $('#equalizer-backdrop').addEventListener('click', () =>
    setEqualizerOpen(false),
  )
  $('#queue-find-button').addEventListener('click', () => {
    setQueueOpen(false)
    setView('search')
  })
  el.queueList.addEventListener('click', (event) => {
    const item = event.target.closest('[data-queue-index]')
    if (item) playQueueIndex(Number(item.dataset.queueIndex))
  })

  el.equalizerBands.addEventListener('input', (event) => {
    const slider = event.target.closest('[data-eq-index]')
    if (!slider) return
    const index = Number(slider.dataset.eqIndex)
    state.equalizerBands[index] = Number(slider.value)
    slider.closest('.eq-band').querySelector('.eq-value').textContent =
      formatBandValue(slider.value)
    updatePresetSelection()
    applyEqualizer()
    saveAudioSettings()
  })
  el.equalizerToggle.addEventListener('change', () => {
    state.equalizerEnabled = el.equalizerToggle.checked
    applyEqualizer()
    saveAudioSettings()
  })
  el.loudnessToggle.addEventListener('change', async () => {
    state.loudnessEnabled = el.loudnessToggle.checked
    await ensureAudioGraph()
    applyLoudnessNormalization()
    saveAudioSettings()
  })
  el.equalizerPresets.addEventListener('click', (event) => {
    const button = event.target.closest('[data-preset]')
    if (button) setEqualizerPreset(button.dataset.preset)
  })
  $('#equalizer-reset').addEventListener('click', () =>
    setEqualizerPreset('flat'),
  )
  $('#provider-login-close').addEventListener(
    'click',
    closeProviderLoginDialog,
  )
  $('#provider-login-refresh').addEventListener('click', () =>
    startProviderQrLogin(),
  )
  el.providerLoginDialog.addEventListener('close', closeProviderQrTimer)
  el.providerLoginDialog.addEventListener('cancel', closeProviderQrTimer)

  el.profileButton.addEventListener('click', (event) => {
    event.stopPropagation()
    setProfileOpen(!el.popover.classList.contains('is-open'))
  })
  el.popoverBackdrop.addEventListener('click', () => setProfileOpen(false))
  el.loginAction.addEventListener('click', () => loginProvider())
  $$('[data-login-provider]').forEach((button) => {
    button.addEventListener('click', () =>
      loginProvider(button.dataset.loginProvider),
    )
  })
  $$('[data-primary-provider]').forEach((button) => {
    button.addEventListener('click', () =>
      setPrimaryProvider(button.dataset.primaryProvider),
    )
  })
  el.updateAction.addEventListener('click', handleUpdateAction)
  el.logoutAction.addEventListener('click', async () => {
    try {
      const provider = state.primaryProvider
      await api.logout(provider)
      state.profiles[provider] = null
      state.recent = []
      state.playlists = []
      updateProfileUI()
      setProfileOpen(false)
      showToast(`已退出${PROVIDER_LABELS[provider]}账号`)
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
      const track = list.find(
        (item) => item.id === String(trackElement.dataset.trackId),
      )
      if (track) playTrackFromList(track, trackElement.dataset.listKey)
      return
    }

    const playlistElement = event.target.closest('[data-playlist-id]')
    if (playlistElement) openPlaylist(String(playlistElement.dataset.playlistId))
  })
  $('.main-content').addEventListener('keydown', (event) => {
    const playlistElement = event.target.closest('[data-playlist-id]')
    if (playlistElement && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      openPlaylist(String(playlistElement.dataset.playlistId))
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
      setEqualizerOpen(false)
      setProfileOpen(false)
      closeProviderLoginDialog()
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
  renderEqualizerBands()
  renderQueue()

  try {
    const bootstrap = await api.bootstrap()
    state.profiles = {
      netease: null,
      kugou: null,
      qq: null,
      ...(bootstrap.profiles || {}),
    }
    state.primaryProvider = bootstrap.primaryProvider || 'netease'
    state.secondaryEnabled = bootstrap.secondaryEnabled !== false
    state.profile = state.profiles[state.primaryProvider] || null
    state.loudnessEnabled = bootstrap.audio?.loudnessEnabled !== false
    state.equalizerEnabled = bootstrap.audio?.equalizerEnabled !== false
    if (
      Array.isArray(bootstrap.audio?.equalizerBands) &&
      bootstrap.audio.equalizerBands.length === 10
    ) {
      state.equalizerBands = [...bootstrap.audio.equalizerBands]
    }
    updateProfileUI()
    renderEqualizerBands()
    state.queue = bootstrap.roam || []
    state.queueMode = 'roam'
    state.sources.roam = state.queue
    state.currentIndex = state.queue.length ? 0 : -1

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
