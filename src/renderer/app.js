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
    qishui: null,
  },
  primaryProvider: 'netease',
  secondaryEnabled: true,
  daily: [],
  recent: [],
  playlists: [],
  likedTracks: [],
  favoriteAlbums: [],
  queue: [],
  queueMode: 'roam',
  roamMode: 'continuous',
  roamMood: 'random',
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
  qualityLevel: 'auto',
  trackLoudnessDb: 0,
  playbackUrls: [],
  playbackUrlIndex: 0,
  loadToken: 0,
  searchToken: 0,
  artToken: 0,
  urlCache: new Map(),
  updateInfo: null,
  checkingUpdate: false,
  followedArtists: {},
  subscribedAlbums: {},
  loginQrTimer: null,
  loginQrBusy: false,
  loginQrProvider: '',
}

const el = {
  app: $('#app'),
  audio,
  albumCover: $('#album-cover'),
  coverStage: $('#cover-stage'),
  trackCopy: $('.track-copy'),
  trackName: $('#track-name'),
  trackTitleViewport: $('#track-title-viewport'),
  trackArtist: $('#track-artist'),
  trackArtistName: $('#track-artist-name'),
  trackAlbum: $('#track-album'),
  trackAlbumName: $('#track-album-name'),
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
  trackMenu: $('#track-menu'),
  trackMore: $('#track-more'),
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
  ambientCanvas: $('#ambient-canvas'),
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
  qishui: '汽水音乐',
}

const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
const EQ_PRESETS = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  warm: [2, 1.5, 1, 0.5, 0, -0.5, -0.5, 0, 0.5, 1],
  vocal: [-1, -0.5, 0, 1, 2, 2.5, 2, 1, 0, -1],
  bass: [4, 3.5, 2.5, 1.5, 0, -0.5, -1, -0.5, 0, 0.5],
}
const QUALITY_OPTIONS = {
  auto: '自动',
  jymaster: '超清母带',
  hires: 'Hi-Res',
  lossless: '无损',
  exhigh: '极高',
  higher: '较高',
  standard: '标准',
}
const BUILT_IN_DEFAULT_TRACK = {
  id: 'netease:1846122270',
  provider: 'netease',
  providerId: '1846122270',
  providerData: { id: '1846122270' },
  name: 'Close To You',
  artists: ['藤井風'],
  artistIds: [33760539],
  album: 'HELP EVER HURT COVER',
  albumId: 127638694,
  cover:
    'https://p4.music.126.net/c24bbaoDnUQsyFcjkgg-EQ==/109951165990931399.jpg?param=900y900',
  duration: 220466,
  fee: 1,
  mvid: 0,
}

let audioContext = null
let mediaSource = null
let normalizerGain = null
let compressor = null
let equalizerNodes = []
let saveAudioTimer = null
let contextPrefetchTimer = null
let tooltipTarget = null
let tooltipTimer = null
let ambientContext = null
let ambientFrame = null
let ambientLastFrame = 0
const ambientPalette = {
  current: {
    a: [88, 104, 130],
    b: [45, 51, 65],
  },
  target: {
    a: [88, 104, 130],
    b: [45, 51, 65],
  },
}
const AMBIENT_POSITIONS = {
  a: { x: 0.3, y: 0.27 },
  b: { x: 0.82, y: 0.8 },
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

function providerBadge(provider) {
  return `<i class="provider-badge">${PROVIDER_LABELS[provider] || '音乐'}</i>`
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
        qualityLevel: state.qualityLevel,
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

function updateTrackTitleMotion() {
  const viewport = el.trackTitleViewport
  viewport.classList.remove('is-overflowing')
  if (!state.track?.name) {
    viewport.style.removeProperty('--title-shift')
    viewport.style.removeProperty('--title-duration')
    return
  }

  const titleWidth = Math.ceil(el.trackName.getBoundingClientRect().width)
  const availableWidth = viewport.clientWidth
  if (!availableWidth || titleWidth <= availableWidth - 16) return

  const shift = availableWidth - titleWidth
  const distance = titleWidth - availableWidth
  const duration = Math.max(24, Math.min(46, 22 + distance / 45))
  viewport.style.setProperty('--title-shift', `${shift}px`)
  viewport.style.setProperty('--title-duration', `${duration}s`)
  requestAnimationFrame(() => {
    if (state.track?.name) viewport.classList.add('is-overflowing')
  })
}

function refreshTextMarquees(root = document) {
  const elements = [
    ...(root.matches?.('.text-marquee') ? [root] : []),
    ...root.querySelectorAll?.('.text-marquee'),
  ]
  for (const viewport of elements) {
    viewport.classList.remove('is-overflowing')
    const content = viewport.querySelector(':scope > .marquee-content')
    if (!content || !viewport.clientWidth) continue
    const distance = content.scrollWidth - viewport.clientWidth
    if (distance <= 2) continue
    const duration = Math.max(12, Math.min(34, 10 + distance / 45))
    viewport.style.setProperty('--marquee-shift', `${-distance}px`)
    viewport.style.setProperty('--marquee-duration', `${duration}s`)
    viewport.classList.add('is-overflowing')
  }
}

function initializeTextMarquees() {
  let frame = null
  const schedule = () => {
    if (frame) cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      frame = null
      refreshTextMarquees()
    })
  }
  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true,
  })
  schedule()
}

function applyStaggeredReveal(root) {
  if (!root) return
  const items = root.querySelectorAll(
    '.artist-hero, .playlist-hero, .login-banner, .section-heading, .song-row, .album-card, .playlist-card, .mini-track, .queue-item, .empty-state',
  )
  items.forEach((element, index) => {
    element.style.setProperty('--reveal-index', String(Math.min(index, 18)))
    element.classList.add('reveal-item')
  })
}

function updateTrackUI(track) {
  state.track = track
  el.trackCopy.classList.remove('is-refreshing')
  requestAnimationFrame(() => {
    if (state.track === track) {
      el.trackCopy.classList.add('is-refreshing')
    }
  })
  if (contextPrefetchTimer) window.clearTimeout(contextPrefetchTimer)
  contextPrefetchTimer = null
  if (track?.provider && track?.providerId) {
    contextPrefetchTimer = window.setTimeout(() => {
      contextPrefetchTimer = null
      if (state.track?.id === track.id) {
        api.prefetchTrackContext(track).catch(() => {})
      }
    }, 300)
  }
  el.trackName.textContent = track?.name || ''
  el.trackArtistName.textContent = track?.artists?.join(' / ') || ''
  el.trackArtist.disabled = !track?.artists?.length
  el.trackArtist.setAttribute(
    'aria-label',
    track?.artists?.length
      ? `打开歌手：${track.artists.join(' / ')}`
      : '没有歌手信息',
  )
  el.trackAlbumName.textContent = track?.album || ''
  el.trackAlbum.disabled = !track?.album
  el.trackAlbum.setAttribute(
    'aria-label',
    track?.album ? `打开专辑：${track.album}` : '没有专辑信息',
  )
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
  requestAnimationFrame(updateTrackTitleMotion)

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
  revealLyricLines()
}

function revealLyricLines() {
  $$('.lyric-line').forEach((line, index) => {
    line.style.setProperty(
      '--lyric-reveal-delay',
      `${Math.min(index, 16) * 58}ms`,
    )
    line.classList.add('lyric-line-reveal')
  })
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

function resizeAmbientCanvas() {
  const canvas = el.ambientCanvas
  if (!canvas) return
  const width = Math.max(
    420,
    Math.min(680, Math.round(window.innerWidth * 0.46)),
  )
  const height = Math.max(
    240,
    Math.round((width * window.innerHeight) / Math.max(1, window.innerWidth)),
  )
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
}

function drawAmbientHalo(context, x, y, radius, color, alpha) {
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius)
  gradient.addColorStop(0, `rgba(${color.join(', ')}, ${alpha})`)
  gradient.addColorStop(0.16, `rgba(${color.join(', ')}, ${alpha * 0.76})`)
  gradient.addColorStop(0.34, `rgba(${color.join(', ')}, ${alpha * 0.46})`)
  gradient.addColorStop(0.54, `rgba(${color.join(', ')}, ${alpha * 0.2})`)
  gradient.addColorStop(0.72, `rgba(${color.join(', ')}, ${alpha * 0.065})`)
  gradient.addColorStop(0.88, `rgba(${color.join(', ')}, ${alpha * 0.018})`)
  gradient.addColorStop(1, `rgba(${color.join(', ')}, 0)`)
  context.fillStyle = gradient
  context.fillRect(
    Math.max(0, x - radius),
    Math.max(0, y - radius),
    Math.min(radius * 2, context.canvas.width - Math.max(0, x - radius)),
    Math.min(radius * 2, context.canvas.height - Math.max(0, y - radius)),
  )
}

function drawAmbientFrame(now) {
  ambientFrame = requestAnimationFrame(drawAmbientFrame)
  if (now - ambientLastFrame < 33) return

  const context = ambientContext
  const canvas = el.ambientCanvas
  if (!context || !canvas) return

  const elapsed = ambientLastFrame
    ? Math.min(64, now - ambientLastFrame)
    : 16
  ambientLastFrame = now
  const reduceMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches
  const blend = reduceMotion ? 1 : 1 - Math.exp(-elapsed / 1700)

  for (const key of ['a', 'b']) {
    for (let channel = 0; channel < 3; channel += 1) {
      ambientPalette.current[key][channel] +=
        (ambientPalette.target[key][channel] -
          ambientPalette.current[key][channel]) *
        blend
    }
  }

  const time = reduceMotion ? 0 : now / 1000
  const width = canvas.width
  const height = canvas.height
  const radius = Math.max(width, height)
  context.clearRect(0, 0, width, height)

  drawAmbientHalo(
    context,
    width * (AMBIENT_POSITIONS.a.x + Math.sin(time / 17) * 0.025),
    height * (AMBIENT_POSITIONS.a.y + Math.cos(time / 23) * 0.018),
    radius * 0.58,
    ambientPalette.current.a,
    0.39,
  )
  drawAmbientHalo(
    context,
    width * (AMBIENT_POSITIONS.b.x + Math.cos(time / 21) * 0.022),
    height * (AMBIENT_POSITIONS.b.y + Math.sin(time / 19) * 0.02),
    radius * 0.62,
    ambientPalette.current.b,
    0.29,
  )
}

function initializeAmbientCanvas() {
  if (!el.ambientCanvas || ambientContext) return
  ambientContext = el.ambientCanvas.getContext('2d', { alpha: true })
  resizeAmbientCanvas()
  window.addEventListener('resize', resizeAmbientCanvas)
  ambientFrame = requestAnimationFrame(drawAmbientFrame)
}

function transitionAmbientPalette(hue, saturation) {
  ambientPalette.target.a = hslToRgb(hue, saturation * 0.9, 0.52)
  ambientPalette.target.b = hslToRgb(hue + 24, saturation * 0.8, 0.43)
}

function applyPaletteFromColor(r, g, b, { ambient = true } = {}) {
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
  if (ambient) transitionAmbientPalette(hue, saturation)
}

function applyFallbackPalette(seed, options = {}) {
  let hash = 0
  for (const char of String(seed || '云栖音乐')) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }
  const hue = hash % 360
  applyPaletteFromColor(...hslToRgb(hue, 0.35, 0.53), options)
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
  if (!cover) {
    return
  }

  try {
    const source = await api.getPaletteSource(cover)
    if (token !== state.artToken) return
    if (source) {
      await extractPalette(source, token)
    } else {
      applyFallbackPalette(state.track?.name)
    }
  } catch {
    applyFallbackPalette(state.track?.name)
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

  const value = await api.getSongUrl(track, state.qualityLevel)
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
  const freshTracks = await api.getRoam(8, state.roamMode, state.roamMood)
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
  const tracks = await api.getRoam(8, state.roamMode, state.roamMood)
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

function updateRoamModeUI() {
  $$('[data-roam-mode]').forEach((button) => {
    const active = button.dataset.roamMode === state.roamMode
    button.classList.toggle('is-active', active)
    button.setAttribute('aria-pressed', String(active))
  })
  $$('[data-roam-mood]').forEach((button) => {
    const active = button.dataset.roamMood === state.roamMood
    button.classList.toggle('is-active', active)
    button.setAttribute('aria-pressed', String(active))
  })
}

async function setRoamMode(mode) {
  if (!['continuous', 'explore'].includes(mode) || mode === state.roamMode) {
    return
  }
  const previous = state.roamMode
  state.roamMode = mode
  updateRoamModeUI()
  try {
    await api.setRoamMode(mode)
    await loadRoamQueue({ preservePlaying: true })
  } catch (error) {
    state.roamMode = previous
    updateRoamModeUI()
    throw error
  }
}

async function setRoamMood(mood) {
  if (!mood || mood === state.roamMood) return
  const previous = state.roamMood
  state.roamMood = mood
  updateRoamModeUI()
  try {
    await api.setRoamMood(mood)
    await loadRoamQueue({ preservePlaying: true })
  } catch (error) {
    state.roamMood = previous
    updateRoamModeUI()
    throw error
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
  el.app.classList.toggle('is-guest', !profile)

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

  for (const provider of ['netease', 'kugou', 'qq', 'qishui']) {
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
  if (!state.daily.length && state.queue.length) {
    state.daily = state.queue.slice(0, 9)
    state.sources.libraryDaily = state.daily
  }
  renderLibrary()

  try {
    const library = await api.getLibrary(showLoading)
    state.profiles[state.primaryProvider] =
      library.profile || state.profiles[state.primaryProvider]
    state.daily = library.daily || []
    state.recent = library.recent || []
    state.playlists = library.playlists || []
    state.likedTracks = library.likedTracks || []
    state.favoriteAlbums = library.favoriteAlbums || []
    state.sources.libraryDaily = state.daily
    state.sources.libraryRecent = state.recent
    state.sources.likedTracks = state.likedTracks
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
            <strong class="text-marquee"><span class="marquee-content">${escapeHTML(track.name)}</span></strong>
            <span class="mini-artist-line">
              <span class="text-marquee"><span class="marquee-content">${escapeHTML(track.artists?.join(' / ') || '未知歌手')}</span></span>
              ${providerBadge(track.provider)}
            </span>
          </div>
        </button>
      `,
    )
    .join('')
}

function playlistCards(
  playlists,
  { likedTracks = [], albums = [] } = {},
) {
  if (!playlists.length && !likedTracks.length && !albums.length) {
    return ''
  }

  const likedCard = likedTracks.length
    ? `
      <article class="playlist-card" data-library-liked tabindex="0" role="button">
        <div class="card-cover">
          ${likedTracks[0].cover ? `<img src="${escapeHTML(likedTracks[0].cover)}" alt="" loading="lazy" />` : ''}
          <span class="card-play">${icons.play}</span>
        </div>
        <h3 class="text-marquee"><span class="marquee-content">我喜欢</span></h3>
        <p class="card-subline">
          <span class="text-marquee"><span class="marquee-content">${likedTracks.length} 首</span></span>
          ${providerBadge(state.primaryProvider)}
        </p>
      </article>
    `
    : ''
  const albumCards = albums
    .map(
      (album, index) => `
        <article class="playlist-card" data-library-album-index="${index}" tabindex="0" role="button">
          <div class="card-cover">
            ${album.cover ? `<img src="${escapeHTML(album.cover)}" alt="" loading="lazy" />` : ''}
            <span class="card-play">${icons.play}</span>
          </div>
          <h3 class="text-marquee"><span class="marquee-content">${escapeHTML(album.name)}</span></h3>
          <p class="card-subline">
            <span class="text-marquee"><span class="marquee-content">${escapeHTML(album.artist || '专辑')}</span></span>
            ${providerBadge(album.provider || state.primaryProvider)}
          </p>
        </article>
      `,
    )
    .join('')

  return `
    <div class="playlist-grid">
      ${likedCard}
      ${playlists
        .map(
          (playlist) => `
            <article class="playlist-card" data-playlist-id="${playlist.id}" tabindex="0" role="button">
              <div class="card-cover">
                ${playlist.cover ? `<img src="${escapeHTML(playlist.cover)}" alt="" loading="lazy" />` : ''}
                <span class="card-play">${icons.play}</span>
              </div>
              <h3 class="text-marquee"><span class="marquee-content">${escapeHTML(playlist.name)}</span></h3>
              <p class="card-subline">
                <span class="text-marquee"><span class="marquee-content">${escapeHTML(playlist.creator || formatCount(playlist.playCount) || `${playlist.trackCount} 首`)}</span></span>
                ${providerBadge(playlist.provider)}
              </p>
            </article>
          `,
        )
        .join('')}
      ${albumCards}
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

  const collectionCount =
    state.playlists.length +
    state.favoriteAlbums.length +
    (state.likedTracks.length ? 1 : 0)
  const playlistSection = state.profile && collectionCount
    ? `
      <section class="library-section">
        <div class="section-heading">
          <h2>我的歌单</h2>
          <span class="section-count">${collectionCount} 个收藏</span>
        </div>
        ${playlistCards(state.playlists, {
          likedTracks: state.likedTracks,
          albums: state.favoriteAlbums,
        })}
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
  applyStaggeredReveal(el.libraryContent)

  $('#login-inline-button')?.addEventListener('click', () =>
    loginProvider(state.primaryProvider),
  )
}

function renderSongTable(
  songs,
  listKey,
  limit = 40,
  { albumView = false } = {},
) {
  if (!songs.length) {
    return '<div class="empty-state"></div>'
  }

  return `
    <div class="song-table">
      ${songs
        .slice(0, limit)
        .map(
          (track, index) => `
            <button class="song-row ${albumView ? 'is-album-track' : ''} ${state.track?.id === track.id ? 'is-current' : ''}" data-track-id="${track.id}" data-list-key="${listKey}">
              <span class="song-number">${String(index + 1).padStart(2, '0')}</span>
              <span class="song-title-cell">
                <span class="song-thumb">${track.cover ? `<img src="${escapeHTML(track.cover)}" alt="" loading="lazy" />` : ''}</span>
                <span class="song-copy">
                  <strong class="text-marquee"><span class="marquee-content">${escapeHTML(track.name)}</span></strong>
                  <span class="song-artist-line">
                    <span class="text-marquee"><span class="marquee-content">${escapeHTML(track.artists?.join(' / ') || '未知歌手')}</span></span>
                    ${providerBadge(track.provider)}
                  </span>
                </span>
              </span>
              ${
                albumView
                  ? ''
                  : `<span class="song-album-cell"><span class="text-marquee"><span class="marquee-content">${escapeHTML(track.album || '')}</span></span></span>`
              }
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
    '<div class="content-pending"></div>'

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
    applyStaggeredReveal(el.searchResults)
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
  requestAnimationFrame(() => refreshTextMarquees())

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
    '<div class="content-pending"></div>'

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

function openLikedTracks() {
  if (!state.likedTracks.length) return
  const previousView =
    state.currentView === 'playlist' ? state.returnView : state.currentView
  setView('playlist', { returnView: previousView })
  const playlist = {
    id: `${state.primaryProvider}:liked`,
    kind: 'playlist',
    provider: state.primaryProvider,
    name: '我喜欢',
    cover: state.likedTracks[0].cover || '',
    creator: PROVIDER_LABELS[state.primaryProvider],
    trackCount: state.likedTracks.length,
    tracks: state.likedTracks,
  }
  state.activePlaylist = playlist
  state.sources.playlist = playlist.tracks
  renderPlaylist(playlist)
}

async function openAlbum(track = state.track) {
  if (!track?.album) return
  const previousView =
    state.currentView === 'playlist' ? state.returnView : state.currentView
  setView('playlist', { returnView: previousView })
  el.playlistContent.innerHTML =
    '<div class="content-pending"></div>'

  try {
    const album = await api.getAlbum(track)
    state.activePlaylist = album
    state.sources.playlist = album.tracks
    renderPlaylist(album)
  } catch (error) {
    el.playlistContent.innerHTML = '<div class="empty-state"></div>'
    showToast(friendlyError(error))
  }
}

async function openArtist(track = state.track) {
  if (!track?.artists?.length) return
  const previousView =
    state.currentView === 'playlist' ? state.returnView : state.currentView
  setView('playlist', { returnView: previousView })
  el.playlistContent.innerHTML =
    '<div class="content-pending"></div>'

  try {
    const artist = await api.getArtist(track)
    state.sources.artist = artist.tracks
    renderArtist(artist)
  } catch (error) {
    el.playlistContent.innerHTML = '<div class="empty-state"></div>'
    showToast(friendlyError(error))
  }
}

function artistAlbumCards(albums) {
  if (!albums.length) return '<div class="empty-state"></div>'
  return albums
    .map(
      (album, index) => `
        <button class="album-card" data-artist-album-index="${index}">
          <span class="album-card-cover">
            ${album.cover ? `<img src="${escapeHTML(album.cover)}" alt="" loading="lazy" />` : ''}
          </span>
          <strong class="text-marquee"><span class="marquee-content">${escapeHTML(album.name)}</span></strong>
        </button>
      `,
    )
    .join('')
}

async function loadArtistAlbums(artist) {
  try {
    const albums = await api.getArtistAlbums(artist)
    if (!albums.length) return
    artist.albums = albums
    const grid = el.playlistContent.querySelector('.album-grid')
    if (grid?.dataset.artistId === artist.id) {
      grid.innerHTML = artistAlbumCards(albums)
      applyStaggeredReveal(grid)
    }
  } catch {
    // The artist profile and hot songs remain usable if albums fail.
  }
}

function renderArtist(artist) {
  const followed = Boolean(state.followedArtists[artist.id])
  const albums = artist.albums || []
  el.playlistContent.innerHTML = `
    <header class="artist-hero">
      <div class="artist-portrait">
        ${artist.avatar ? `<img src="${escapeHTML(artist.avatar)}" alt="" />` : icons.user}
      </div>
      <div class="artist-meta">
        <h1 class="text-marquee"><span class="marquee-content">${escapeHTML(artist.name)}</span></h1>
        ${artist.bio ? `<p class="artist-bio">${escapeHTML(artist.bio)}</p>` : ''}
        <div class="playlist-actions">
          <button class="content-action ${followed ? 'is-active' : ''}" id="artist-follow-button">
            ${followed ? '已关注' : '关注'}
          </button>
        </div>
      </div>
    </header>
    <section class="detail-section">
      <div class="section-heading">
        <h2>热门歌曲</h2>
      </div>
      ${renderSongTable(artist.tracks, 'artist', 10, { albumView: true })}
    </section>
    <section class="detail-section">
      <div class="section-heading">
        <h2>专辑</h2>
      </div>
      <div class="album-grid" data-artist-id="${escapeHTML(artist.id)}">
        ${artistAlbumCards(albums)}
      </div>
    </section>
  `
  applyStaggeredReveal(el.playlistContent)

  $('#artist-follow-button').addEventListener('click', async (event) => {
    const next = !state.followedArtists[artist.id]
    const button = event.currentTarget
    button.disabled = true
    try {
      await api.followArtist(artist, next)
      state.followedArtists[artist.id] = next
      button.classList.toggle('is-active', next)
      button.textContent = next ? '已关注' : '关注'
    } catch (error) {
      showToast(friendlyError(error))
    } finally {
      button.disabled = false
    }
  })
  el.playlistContent.querySelector('.album-grid')?.addEventListener('click', (event) => {
    const card = event.target.closest('[data-artist-album-index]')
    if (!card) return
    const album = artist.albums?.[Number(card.dataset.artistAlbumIndex)]
    if (album?.sampleTrack) openAlbum(album.sampleTrack)
  })
  loadArtistAlbums(artist)
}

function renderPlaylist(playlist) {
  const isAlbum = playlist.kind === 'album'
  const subscribed = Boolean(state.subscribedAlbums[playlist.id])
  el.playlistContent.innerHTML = `
    <header class="playlist-hero">
      <div class="playlist-art">
        ${playlist.cover ? `<img src="${escapeHTML(playlist.cover)}" alt="" />` : ''}
      </div>
      <div class="playlist-meta">
        <h1 class="text-marquee"><span class="marquee-content">${escapeHTML(playlist.name)}</span></h1>
        ${playlist.description ? `<p class="playlist-description">${escapeHTML(playlist.description)}</p>` : ''}
        ${
          isAlbum
            ? playlist.creator
              ? `<div class="playlist-facts"><span>${escapeHTML(playlist.creator)}</span></div>`
              : ''
            : `
              <div class="playlist-facts">
                ${playlist.creator ? `<span>${escapeHTML(playlist.creator)}</span><i></i>` : ''}
                <span>${playlist.trackCount || playlist.tracks.length} 首</span>
                ${playlist.playCount ? `<i></i><span>${formatCount(playlist.playCount)} 次播放</span>` : ''}
              </div>
            `
        }
        <div class="playlist-actions">
          ${
            isAlbum
              ? `<button class="content-action ${subscribed ? 'is-active' : ''}" id="album-subscribe-button">
                  ${subscribed ? '已订阅' : '订阅'}
                </button>`
              : `<button class="primary-button" id="playlist-play-button">${icons.play}播放全部</button>`
          }
        </div>
      </div>
    </header>
    ${renderSongTable(playlist.tracks, 'playlist', 1000, {
      albumView: isAlbum,
    })}
  `
  applyStaggeredReveal(el.playlistContent)

  if (isAlbum) {
    $('#album-subscribe-button').addEventListener('click', async (event) => {
      const next = !state.subscribedAlbums[playlist.id]
      const button = event.currentTarget
      button.disabled = true
      try {
        await api.subscribeAlbum(playlist, next)
        state.subscribedAlbums[playlist.id] = next
        button.classList.toggle('is-active', next)
        button.textContent = next ? '已订阅' : '订阅'
      } catch (error) {
        showToast(friendlyError(error))
      } finally {
        button.disabled = false
      }
    })
  } else {
    $('#playlist-play-button').addEventListener('click', () => {
      if (playlist.tracks[0]) playTrackFromList(playlist.tracks[0], 'playlist')
    })
  }
}

function queueItem(track, index) {
  return `
    <button class="queue-item ${state.track?.id === track.id ? 'is-current' : ''}" data-queue-index="${index}">
      <span class="queue-index">${state.track?.id === track.id ? '●' : String(index + 1).padStart(2, '0')}</span>
      ${track.cover ? `<img src="${escapeHTML(track.cover)}" alt="" loading="lazy" />` : '<span class="song-thumb"></span>'}
      <span class="queue-copy">
        <strong class="text-marquee"><span class="marquee-content">${escapeHTML(track.name)}</span></strong>
        <span class="queue-artist-line">
          <span class="text-marquee"><span class="marquee-content">${escapeHTML(track.artists?.join(' / ') || '未知歌手')}</span></span>
          ${providerBadge(track.provider)}
        </span>
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
  applyStaggeredReveal(el.queueList)
  el.queueEmpty.classList.toggle('is-visible', state.queue.length === 0)
}

function setTrackMenuOpen(open) {
  if (open) {
    setEqualizerOpen(false)
    setQueueOpen(false)
    setProfileOpen(false)
    el.trackMore.setAttribute('aria-expanded', 'true')

    const anchor = el.trackMore.getBoundingClientRect()
    const menuWidth = el.trackMenu.offsetWidth
    const margin = 12
    const gap = 8
    const left = Math.max(
      margin,
      Math.min(
        anchor.left,
        window.innerWidth - menuWidth - margin,
      ),
    )
    const preferredTop = anchor.bottom + gap
    const availableBelow = window.innerHeight - preferredTop - margin
    el.trackMenu.style.maxHeight =
      `${Math.max(160, Math.min(360, availableBelow))}px`
    el.trackMenu.style.left = `${Math.round(left)}px`
    el.trackMenu.style.top = `${Math.round(preferredTop)}px`
    el.trackMenu.setAttribute('aria-hidden', 'false')
    requestAnimationFrame(() => {
      if (el.trackMore.getAttribute('aria-expanded') === 'true') {
        el.trackMenu.classList.add('is-open')
      }
    })
    return
  }

  el.trackMenu.classList.remove('is-open')
  el.trackMenu.setAttribute('aria-hidden', 'true')
  el.trackMore.setAttribute('aria-expanded', 'false')
}

function updateQualityMenuSelection() {
  for (const button of $$('#track-menu [data-quality-level]')) {
    const selected = button.dataset.qualityLevel === state.qualityLevel
    button.classList.toggle('is-active', selected)
    button.setAttribute('aria-checked', String(selected))
  }
}

async function setQualityLevel(level) {
  if (!QUALITY_OPTIONS[level] || level === state.qualityLevel) {
    setTrackMenuOpen(false)
    return
  }

  state.qualityLevel = level
  updateQualityMenuSelection()
  saveAudioSettings()
  setTrackMenuOpen(false)

  const wasPlaying = Boolean(audio.src) && !audio.paused
  const resumeAt = audio.currentTime
  state.urlCache.clear()
  audio.pause()
  audio.removeAttribute('src')
  delete audio.dataset.trackId

  if (wasPlaying && state.track) {
    await startPlayback(state.track, state.loadToken)
    if (resumeAt > 0 && Number.isFinite(audio.duration)) {
      audio.currentTime = Math.min(resumeAt, audio.duration)
    }
  }

  showToast(`音质偏好已设为 ${QUALITY_OPTIONS[level]}`)
}

function setQueueOpen(open) {
  if (open) {
    setEqualizerOpen(false)
    setTrackMenuOpen(false)
  }
  el.queuePanel.classList.toggle('is-open', open)
  el.queuePanel.setAttribute('aria-hidden', open ? 'false' : 'true')
}

function setEqualizerOpen(open) {
  if (open) {
    setQueueOpen(false)
    setTrackMenuOpen(false)
  }
  el.equalizerPanel.classList.toggle('is-open', open)
  el.equalizerPanel.setAttribute('aria-hidden', open ? 'false' : 'true')
}

function setProfileOpen(open) {
  if (open) setTrackMenuOpen(false)
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
  if (!['kugou', 'qq', 'qishui'].includes(provider)) return
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
        : provider === 'qq'
          ? await api.startQqQrLogin()
          : await api.startQishuiQrLogin()
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
            : provider === 'qq'
              ? await api.checkQqQrLogin()
              : await api.checkQishuiQrLogin()
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
            refreshLibrary(true)
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
  if (provider === 'qq') {
    showToast('已打开 QQ 音乐官方登录窗口，请在窗口中扫码')
    try {
      const result = await api.webQqLogin()
      if (!result?.ok) {
        if (result?.error) showToast(result.error, 4200)
        return
      }
      state.profiles.qq = result.profile
      updateProfileUI()
      showToast(`已登录 QQ 音乐：${result.profile?.name || ''}`)
      if (state.primaryProvider === 'qq') {
        refreshLibrary(true)
        loadRoamQueue({ preservePlaying: true }).catch(() => {})
      }
    } catch (error) {
      showToast(`QQ 音乐登录失败：${friendlyError(error)}`, 4200)
    }
    return
  }
  if (['kugou', 'qishui'].includes(provider)) {
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
      refreshLibrary(true)
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
      refreshLibrary(true),
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
  document.addEventListener(
    'load',
    (event) => {
      const image = event.target
      if (
        image?.tagName === 'IMG' &&
        image.matches(
          '.card-cover img, .album-card-cover img, .song-thumb img, .mini-track img, .queue-item img',
        )
      ) {
        image.classList.add('media-loaded')
      }
    },
    true,
  )
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
  window.addEventListener('resize', () => {
    hideTooltip()
    setTrackMenuOpen(false)
    updateTrackTitleMotion()
    refreshTextMarquees()
  })
  document.addEventListener(
    'scroll',
    (event) => {
      if (el.trackMenu.contains(event.target)) return
      hideTooltip()
      setTrackMenuOpen(false)
    },
    true,
  )

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
  $$('[data-roam-mode]').forEach((button) => {
    button.addEventListener('click', () =>
      setRoamMode(button.dataset.roamMode).catch((error) => {
        showToast(friendlyError(error))
      }),
    )
  })
  $$('[data-roam-mood]').forEach((button) => {
    button.addEventListener('click', () =>
      setRoamMood(button.dataset.roamMood).catch((error) => {
        showToast(friendlyError(error))
      }),
    )
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
  el.trackArtist.addEventListener('click', () => openArtist(state.track))
  el.trackAlbum.addEventListener('click', () => openAlbum(state.track))
  el.trackMore.addEventListener('click', (event) => {
    event.stopPropagation()
    setTrackMenuOpen(!el.trackMenu.classList.contains('is-open'))
  })
  el.trackMenu.addEventListener('click', (event) => {
    const button = event.target.closest('[data-quality-level]')
    if (button) setQualityLevel(button.dataset.qualityLevel)
  })
  document.addEventListener('click', (event) => {
    if (!el.trackMenu.classList.contains('is-open')) return
    if (
      el.trackMenu.contains(event.target) ||
      el.trackMore.contains(event.target)
    ) {
      return
    }
    setTrackMenuOpen(false)
  })

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
      state.likedTracks = []
      state.favoriteAlbums = []
      updateProfileUI()
      setProfileOpen(false)
      showToast(`已退出${PROVIDER_LABELS[provider]}账号`)
      refreshLibrary(true)
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

    if (event.target.closest('[data-library-liked]')) {
      openLikedTracks()
      return
    }

    const libraryAlbum = event.target.closest('[data-library-album-index]')
    if (libraryAlbum) {
      const album =
        state.favoriteAlbums[Number(libraryAlbum.dataset.libraryAlbumIndex)]
      if (album?.sampleTrack) openAlbum(album.sampleTrack)
      return
    }

    const playlistElement = event.target.closest('[data-playlist-id]')
    if (playlistElement) openPlaylist(String(playlistElement.dataset.playlistId))
  })
  $('.main-content').addEventListener('keydown', (event) => {
    if (
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      if (event.target.closest('[data-library-liked]')) {
        event.preventDefault()
        openLikedTracks()
        return
      }
      const libraryAlbum = event.target.closest(
        '[data-library-album-index]',
      )
      if (libraryAlbum) {
        event.preventDefault()
        const album =
          state.favoriteAlbums[
            Number(libraryAlbum.dataset.libraryAlbumIndex)
          ]
        if (album?.sampleTrack) openAlbum(album.sampleTrack)
        return
      }
    }
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
      setTrackMenuOpen(false)
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

function applyBootstrapState(bootstrap) {
  state.profiles = {
    netease: null,
    kugou: null,
    qq: null,
    qishui: null,
    ...(bootstrap.profiles || {}),
  }
  state.primaryProvider = bootstrap.primaryProvider || 'netease'
  state.secondaryEnabled = bootstrap.secondaryEnabled !== false
  state.roamMode =
    bootstrap.roamMode === 'explore' ? 'explore' : 'continuous'
  state.roamMood = bootstrap.roamMood || 'random'
  state.profile = state.profiles[state.primaryProvider] || null
  state.loudnessEnabled = bootstrap.audio?.loudnessEnabled !== false
  state.equalizerEnabled = bootstrap.audio?.equalizerEnabled !== false
  if (QUALITY_OPTIONS[bootstrap.audio?.qualityLevel]) {
    state.qualityLevel = bootstrap.audio.qualityLevel
  }
  if (
    Array.isArray(bootstrap.audio?.equalizerBands) &&
    bootstrap.audio.equalizerBands.length === 10
  ) {
    state.equalizerBands = [...bootstrap.audio.equalizerBands]
  }
  updateProfileUI()
  renderEqualizerBands()
  updateQualityMenuSelection()
  updateRoamModeUI()
}

async function applyRoamSnapshot(tracks) {
  const current = state.track
  const incoming = Array.isArray(tracks) ? tracks : []
  state.queue = current
    ? [current, ...incoming.filter((track) => track.id !== current.id)]
    : incoming
  state.queueMode = 'roam'
  state.sources.roam = state.queue
  state.currentIndex = state.queue.length ? 0 : -1
  renderQueue()

  if (!state.track && state.queue.length) {
    await prepareTrack(state.queue[0])
  }
}

async function loadDefaultTrack() {
  if (state.track) return
  const track = { ...BUILT_IN_DEFAULT_TRACK }
  state.queue = [track]
  state.queueMode = 'roam'
  state.sources.roam = state.queue
  state.currentIndex = 0
  renderQueue()
  await prepareTrack(track)
}

async function initialize() {
  bindEvents()
  initializeAmbientCanvas()
  initializeTextMarquees()
  updatePlayButton()
  updateProfileUI()
  renderEqualizerBands()
  renderQueue()
  updateQualityMenuSelection()

  try {
    const local = await api.bootstrap()
    applyBootstrapState(local)
    await applyRoamSnapshot(local.roam)
    if (!state.track && !state.queue.length) {
      await loadDefaultTrack()
    }
    if (!state.track) {
      updateTrackUI(null)
      resetLyrics('')
    }
    refreshLibrary(false).catch(() => {})

    api
      .bootstrapLive()
      .then(async (live) => {
        applyBootstrapState(live)
        await applyRoamSnapshot(live.roam)
        if (!state.track) {
          updateTrackUI(null)
          resetLyrics('')
        }
      })
      .catch(() => {})
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
