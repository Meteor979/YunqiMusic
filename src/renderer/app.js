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
  queueContext: 'roam',
  albumLoop: false,
  activeAlbumId: null,
  roamMode: 'continuous',
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
  smartEqualizerEnabled: true,
  equalizerEnabled: false,
  reverbEnabled: true,
  equalizerBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  smartPresetBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
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
  together: {
    status: 'idle',
    role: null,
    code: '',
    invite: '',
    provider: '',
    participants: [],
    connected: false,
    busy: false,
    error: '',
  },
  togetherSyncTimer: null,
  togetherSyncTimeout: null,
  togetherSyncBusy: false,
  togetherApplying: false,
  togetherPendingSync: null,
  togetherChatOpen: false,
  togetherMessages: [],
  togetherUnread: 0,
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
  togetherContent: $('#together-content'),
  playlistContent: $('#playlist-content'),
  trackMenu: $('#track-menu'),
  trackMore: $('#track-more'),
  likeButton: $('#like-button'),
  shuffleButton: $('#shuffle-button'),
  repeatButton: $('#repeat-button'),
  albumLoopButton: $('#album-loop-button'),
  togetherChatButton: $('#together-chat-button'),
  togetherChatBadge: $('#together-chat-badge'),
  togetherChatPanel: $('#together-chat-panel'),
  togetherChatMessages: $('#together-chat-messages'),
  togetherChatForm: $('#together-chat-form'),
  togetherChatInput: $('#together-chat-input'),
  togetherChatSend: $('#together-chat-send'),
  togetherStickerPicker: $('#together-sticker-picker'),
  togetherStickerToggle: $('#together-sticker-toggle'),
  togetherChatPlatform: $('#together-chat-platform'),
  equalizerPanel: $('#equalizer-panel'),
  equalizerBands: $('#equalizer-bands'),
  equalizerToggle: $('#equalizer-toggle'),
  loudnessToggle: $('#loudness-toggle'),
  smartEqualizerToggle: $('#smart-equalizer-toggle'),
  reverbToggle: $('#reverb-toggle'),
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
const SMART_AUDIO_PRESETS = [
  {
    id: 'metal',
    keywords: ['metal', '金属', 'hardcore', 'hard rock', '硬核'],
    bands: [1.8, 1.3, 0.4, -0.8, -1.2, -0.4, 0.8, 1.4, 1.5, 1.2],
  },
  {
    id: 'rock',
    keywords: ['rock', '摇滚', 'punk', '朋克', '乐队', 'band', 'guitar rock'],
    bands: [1.2, 1, 0.5, 0, -0.4, 0.4, 1, 1.2, 0.9, 0.5],
  },
  {
    id: 'electronic',
    keywords: [
      'electronic',
      'electronica',
      'edm',
      'synth',
      'techno',
      'house',
      'remix',
      '电子',
      '电音',
    ],
    bands: [2.6, 2.2, 1.2, 0.2, -0.5, 0.3, 1.1, 1.6, 1.8, 1.2],
  },
  {
    id: 'hiphop',
    keywords: [
      'hip hop',
      'hip-hop',
      'rap',
      'trap',
      '说唱',
      '嘻哈',
      'mixtape',
    ],
    bands: [3, 2.5, 1.4, 0.4, -0.4, 0.2, 0.8, 1.1, 0.7, 0.2],
  },
  {
    id: 'dance',
    keywords: ['dance', 'disco', 'funk', '舞曲', '迪斯科', '放克'],
    bands: [2.2, 1.8, 0.8, 0, -0.2, 0.3, 0.9, 1.2, 1.3, 0.8],
  },
  {
    id: 'jazz',
    keywords: ['jazz', 'swing', 'bossa', '爵士', '摇摆', '巴萨诺瓦'],
    bands: [0.8, 0.6, 0.4, 0.2, 0.4, 0.8, 0.9, 0.6, 0.3, 0.1],
  },
  {
    id: 'classical',
    keywords: [
      'classical',
      'symphony',
      'sonata',
      'concerto',
      'orchestra',
      '古典',
      '交响',
      '奏鸣曲',
      '协奏曲',
    ],
    bands: [-0.3, -0.2, 0, 0, 0.1, 0.3, 0.5, 0.7, 0.8, 0.8],
  },
  {
    id: 'acoustic',
    keywords: [
      'acoustic',
      'folk',
      'unplugged',
      '民谣',
      '木吉他',
      '不插电',
      '原声吉他',
    ],
    bands: [-0.8, -0.5, 0.2, 0.6, 0.8, 0.7, 0.5, 0.2, -0.2, -0.5],
  },
  {
    id: 'vocal',
    keywords: ['vocal', 'acapella', '人声', '清唱', '女声', '男声', 'live', '现场'],
    bands: [-1.2, -0.8, -0.2, 0.8, 1.8, 2.2, 1.6, 0.6, -0.5, -1],
  },
  {
    id: 'rnb',
    keywords: ['r&b', 'rnb', 'soul', 'neo soul', '灵魂乐', '节奏布鲁斯'],
    bands: [1.6, 1.2, 0.6, 0, 0.2, 0.8, 1.1, 0.8, 0.4, 0],
  },
  {
    id: 'ambient',
    keywords: [
      'ambient',
      'meditation',
      'sleep',
      '氛围',
      '环境音乐',
      '冥想',
      '助眠',
    ],
    bands: [-1.8, -1.2, -0.4, 0.2, 0.4, 0.2, 0, -0.4, -0.8, -1.2],
  },
  {
    id: 'lofi',
    keywords: ['lo-fi', 'lofi', 'chillhop', 'study beats', '自习', '学习音乐'],
    bands: [0.8, 0.4, -0.3, -0.8, -0.6, 0.2, 0.5, 0.1, -0.6, -1.2],
  },
  {
    id: 'soundtrack',
    keywords: [
      'soundtrack',
      'original score',
      'ost',
      'score',
      '电影原声',
      '影视原声',
      '配乐',
    ],
    bands: [0.5, 0.8, 0.3, -0.2, 0.2, 0.5, 0.8, 0.9, 0.7, 0.4],
  },
  {
    id: 'vocaloid',
    keywords: ['vocaloid', '初音', '镜音', '巡音', '洛天依', 'utau'],
    bands: [0.8, 1, 0.5, 0.2, 0.5, 1.4, 1.8, 1.5, 1, 0.5],
  },
  {
    id: 'anime',
    keywords: ['anime', '动漫', '二次元', '动画', '片头曲', '片尾曲', 'opening', 'ending'],
    bands: [0.3, 0.6, 0.4, 0.2, 0.4, 1.1, 1.5, 1.3, 0.8, 0.4],
  },
  {
    id: 'citypop',
    keywords: ['city pop', 'citypop', '城市流行', '昭和', 'urban pop'],
    bands: [1, 0.8, 0.5, 0.2, 0.3, 0.6, 0.9, 0.8, 0.5, 0.2],
  },
  {
    id: 'kpop',
    keywords: ['k-pop', 'kpop', '韩语', '韩国流行', 'korean pop'],
    bands: [1.4, 1.2, 0.8, 0.3, 0.2, 0.6, 1.2, 1.4, 1.1, 0.6],
  },
  {
    id: 'mandopop',
    keywords: ['mandopop', '华语流行', '国语歌', '中文流行', '华语音乐'],
    bands: [0.4, 0.7, 0.3, 0.1, 0.5, 1.1, 1, 0.7, 0.4, 0.2],
  },
  {
    id: 'cantopop',
    keywords: ['cantopop', '粤语', '港乐', '广东歌'],
    bands: [0.2, 0.5, 0.2, 0.3, 0.7, 1.2, 1.1, 0.7, 0.3, 0.1],
  },
  {
    id: 'guofeng',
    keywords: ['国风', '古风', '民乐', '古筝', '二胡', '琵琶', '戏腔', '笛子'],
    bands: [0.3, 0.5, 0.4, 0.6, 0.8, 0.9, 0.7, 0.5, 0.4, 0.3],
  },
  {
    id: 'blues',
    keywords: ['blues', '蓝调', 'boogie', 'rhythm and blues'],
    bands: [0.8, 0.7, 0.4, 0.2, 0.3, 0.6, 0.8, 0.5, 0.2, 0],
  },
  {
    id: 'punk',
    keywords: ['punk', '朋克', 'pop punk', 'hardcore punk'],
    bands: [1, 0.9, 0.3, -0.3, -0.5, 0.3, 1.3, 1.6, 1.2, 0.6],
  },
  {
    id: 'indie',
    keywords: ['indie', '独立音乐', '独立流行', '独立摇滚', 'bedroom pop'],
    bands: [-0.2, 0.1, 0.2, 0.4, 0.6, 0.7, 0.6, 0.4, 0.1, -0.2],
  },
  {
    id: 'latin',
    keywords: ['latin', '拉丁', 'salsa', 'merengue', 'reggaeton'],
    bands: [1, 0.9, 0.5, 0.1, 0.2, 0.5, 0.9, 1, 0.7, 0.3],
  },
  {
    id: 'reggae',
    keywords: ['reggae', '雷鬼', 'dub', 'ska'],
    bands: [1.2, 1.4, 0.9, 0.2, -0.2, 0.2, 0.5, 0.4, 0.2, 0],
  },
  {
    id: 'country',
    keywords: ['country', '乡村音乐', 'bluegrass', 'americana'],
    bands: [-0.4, -0.1, 0.2, 0.5, 0.7, 0.8, 0.7, 0.4, 0.1, -0.3],
  },
  {
    id: 'audiophile',
    keywords: ['hi-res', 'hires', 'audiophile', '发烧', '母带', '试音'],
    bands: [-0.3, -0.2, 0, 0, 0, 0.1, 0.3, 0.5, 0.6, 0.5],
  },
  {
    id: 'jpop',
    keywords: ['j-pop', 'jpop', '日语歌', '日本流行', 'japanese pop'],
    bands: [0.4, 0.7, 0.5, 0.3, 0.5, 1, 1.3, 1.1, 0.6, 0.2],
  },
  {
    id: 'night',
    keywords: ['night', 'midnight', '深夜', '午夜', '失眠', '夜色', '孤独'],
    bands: [-1, -0.5, 0, 0.3, 0.4, 0, 0.2, -0.2, -0.5, -0.8],
  },
  {
    id: 'pop',
    keywords: ['pop', '流行', '情歌', 'ballad', '抒情'],
    bands: [0.5, 0.8, 0.4, 0, -0.2, 0.3, 0.8, 1, 0.8, 0.4],
  },
]
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
let reverbConvolver = null
let reverbDry = null
let reverbWet = null
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

function detectSmartAudioPreset(track) {
  const metadata = [
    track?.name,
    track?.album,
    ...(track?.artists || []),
    track?.providerData?.genre,
    track?.providerData?.tag,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  let selected = SMART_AUDIO_PRESETS.find((preset) => preset.id === 'pop')
  let selectedScore = 0
  for (const preset of SMART_AUDIO_PRESETS) {
    let score = 0
    for (const keyword of preset.keywords) {
      if (metadata.includes(keyword)) {
        score += Math.max(1, keyword.length / 4)
      }
    }
    if (score > selectedScore) {
      selected = preset
      selectedScore = score
    }
  }
  return selected || SMART_AUDIO_PRESETS[SMART_AUDIO_PRESETS.length - 1]
}

function applySmartAudioPreset(track) {
  state.smartPresetBands = track
    ? [...detectSmartAudioPreset(track).bands]
    : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  applyEqualizer()
}

function applyEqualizer() {
  if (!audioContext || !equalizerNodes.length) return
  const now = audioContext.currentTime
  equalizerNodes.forEach((filter, index) => {
    const manualGain = state.equalizerEnabled
      ? Number(state.equalizerBands[index] || 0)
      : 0
    const smartGain = state.smartEqualizerEnabled
      ? Number(state.smartPresetBands[index] || 0)
      : 0
    const gain = Math.max(-12, Math.min(12, manualGain + smartGain))
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

function createReverbImpulse(context) {
  const duration = 1.15
  const length = Math.floor(context.sampleRate * duration)
  const impulse = context.createBuffer(2, length, context.sampleRate)
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel)
    let smoothed = 0
    for (let index = 0; index < length; index += 1) {
      const noise = Math.random() * 2 - 1
      smoothed = smoothed * 0.78 + noise * 0.22
      const envelope = Math.pow(1 - index / length, 2.8)
      data[index] = smoothed * envelope * (channel === 0 ? 1 : 0.96)
    }
  }
  return impulse
}

function applyReverb() {
  if (!audioContext || !reverbDry || !reverbWet) return
  const now = audioContext.currentTime
  reverbDry.gain.setTargetAtTime(
    state.reverbEnabled ? 0.96 : 1,
    now,
    0.08,
  )
  reverbWet.gain.setTargetAtTime(
    state.reverbEnabled ? 0.1 : 0,
    now,
    0.08,
  )
}

async function ensureAudioGraph() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return

    audioContext = new AudioContextClass({ latencyHint: 'playback' })
    mediaSource = audioContext.createMediaElementSource(audio)
    normalizerGain = audioContext.createGain()
    compressor = audioContext.createDynamicsCompressor()
    reverbDry = audioContext.createGain()
    reverbWet = audioContext.createGain()
    reverbConvolver = audioContext.createConvolver()
    reverbConvolver.normalize = true
    reverbConvolver.buffer = createReverbImpulse(audioContext)
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
    previous.connect(reverbDry)
    reverbDry.connect(audioContext.destination)
    previous.connect(reverbConvolver)
    reverbConvolver.connect(reverbWet)
    reverbWet.connect(audioContext.destination)
  }

  if (audioContext.state === 'suspended') await audioContext.resume()
  applyLoudnessNormalization()
  applyEqualizer()
  applyReverb()
}

function saveAudioSettings() {
  if (saveAudioTimer) window.clearTimeout(saveAudioTimer)
  saveAudioTimer = window.setTimeout(() => {
    api
      .setAudioSettings({
        loudnessEnabled: state.loudnessEnabled,
        smartEqualizerEnabled: state.smartEqualizerEnabled,
        equalizerEnabled: state.equalizerEnabled,
        reverbEnabled: state.reverbEnabled,
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
  el.smartEqualizerToggle.checked = state.smartEqualizerEnabled
  el.reverbToggle.checked = state.reverbEnabled
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
  applySmartAudioPreset(track)
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
  if (state.together.role) renderTogether()
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
  const cachedLiked =
    track.provider === state.primaryProvider &&
    state.likedTracks.some((item) => item.id === track.id)
  state.liked = cachedLiked
  el.likeButton.classList.toggle('is-active', cachedLiked)
  try {
    const result = await api.getLikeState(track)
    if (token !== state.loadToken) return
    state.liked = Boolean(result.liked) || cachedLiked
  } catch {
    state.liked = cachedLiked
  }
  el.likeButton.classList.toggle('is-active', state.liked)
}

async function prepareTrack(track, { play = false } = {}) {
  const token = ++state.loadToken
  updateTrackUI(track)
  scheduleTogetherSync(160)
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
      if (token !== state.loadToken) return
      await audio.play()
      return
    }

    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    delete audio.dataset.trackId
    state.playing = false
    updatePlayButton()

    const result = await resolveSongUrl(track)
    if (token !== state.loadToken) return
    if (!result?.url) {
      state.playing = false
      updatePlayButton()
      showToast(result?.reason || '当前歌曲没有可用音源')
      return
    }

    await ensureAudioGraph()
    if (token !== state.loadToken) return
    audio.dataset.trackId = String(track.id)
    state.trackLoudnessDb = Number(result.gain || 0)
    state.playbackUrls = result.urls?.length
      ? result.urls
      : [result.url]
    state.playbackUrlIndex = 0
    applyLoudnessNormalization()
    audio.src = result.url

    await audio.play()
    if (token !== state.loadToken) return
    if (result.limited) showToast('这首歌目前仅能试听部分片段')
  } catch (error) {
    if (token !== state.loadToken) return
    state.playing = false
    updatePlayButton()
    showToast(`播放失败：${friendlyError(error)}`, 3600)
  }
}

async function togglePlayback() {
  if (!state.track) return
  if (state.together.role === 'guest' && state.together.connected) {
    await requestTogetherPlayback('toggle-playback')
    return
  }
  if (blockTogetherGuestControl()) return

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
  if (blockTogetherGuestControl()) return
  if (!state.queue.length) return
  const nextIndex =
    ((Number(index) % state.queue.length) + state.queue.length) %
    state.queue.length
  state.currentIndex = nextIndex
  renderQueue()
  await prepareTrack(state.queue[nextIndex], { play: true })
}

async function playTrackFromList(track, listKey) {
  if (blockTogetherGuestControl()) return
  const list = state.sources[listKey]
  if (!Array.isArray(list) || !list.length) return
  state.queue = [...list]
  state.queueMode = listKey === 'roam' ? 'roam' : 'context'
  const isAlbum =
    listKey === 'playlist' && state.activePlaylist?.kind === 'album'
  state.queueContext = isAlbum
    ? 'album'
    : listKey === 'roam'
      ? 'roam'
      : 'context'
  if (isAlbum) {
    if (state.activeAlbumId !== state.activePlaylist.id) {
      state.albumLoop = false
    }
    state.activeAlbumId = state.activePlaylist.id
  } else {
    state.albumLoop = false
    state.activeAlbumId = null
  }
  updateAlbumLoopUI()
  state.currentIndex = findQueueIndex(track.id)
  renderQueue()
  await prepareTrack(track, { play: true })
}

async function extendRoamQueue() {
  if (state.queueMode !== 'roam') return false
  const freshTracks = await api.getRoam(8, state.roamMode)
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

async function loadRoamQueue({
  preservePlaying = false,
  preserveCurrent = false,
} = {}) {
  const tracks = await api.getRoam(8, state.roamMode)
  const keepCurrent =
    Boolean(state.track) &&
    (preserveCurrent || (preservePlaying && state.playing))
  state.queue = keepCurrent
    ? [state.track, ...tracks.filter((track) => track.id !== state.track.id)]
    : tracks
  state.queueMode = 'roam'
  state.queueContext = 'roam'
  state.albumLoop = false
  state.activeAlbumId = null
  updateAlbumLoopUI()
  state.sources.roam = state.queue
  state.currentIndex = state.queue.length ? 0 : -1
  renderQueue()

  if (state.queue.length && !keepCurrent) {
    await prepareTrack(state.queue[0])
  }
}

async function returnToRoam() {
  setView('now')
  if (state.queueMode === 'roam') return
  await loadRoamQueue({
    preservePlaying: true,
    preserveCurrent: true,
  })
  showToast('已切换到漫游模式')
}

function updateRoamModeUI() {
  $$('[data-roam-mode]').forEach((button) => {
    const active = button.dataset.roamMode === state.roamMode
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
    showToast(
      mode === 'explore' ? '已切换为探索漫游' : '已切换为持续漫游',
    )
  } catch (error) {
    state.roamMode = previous
    updateRoamModeUI()
    throw error
  }
}

async function nextTrack({ automatic = false } = {}) {
  if (!state.queue.length) return
  if (!automatic && blockTogetherGuestControl()) return
  if (automatic && state.repeatMode === 'one') {
    audio.currentTime = 0
    await audio.play()
    return
  }

  const atLastTrack = state.currentIndex >= state.queue.length - 1
  if (state.queueContext === 'album' && atLastTrack) {
    if (state.albumLoop) {
      await playQueueIndex(0)
      return
    }
    await loadRoamQueue({
      preservePlaying: true,
      preserveCurrent: true,
    })
    if (state.queue.length > 1) {
      await playQueueIndex(1)
    } else if (state.queue.length) {
      await playQueueIndex(0)
    }
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

function updateAlbumLoopUI() {
  const active = state.queueContext === 'album'
  el.albumLoopButton.hidden = !active
  el.albumLoopButton.classList.toggle(
    'is-active',
    active && state.albumLoop,
  )
  el.albumLoopButton.setAttribute(
    'aria-pressed',
    String(active && state.albumLoop),
  )
}

async function previousTrack() {
  if (!state.queue.length) return
  if (blockTogetherGuestControl()) return
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

function togetherProviderLabel(provider) {
  return PROVIDER_LABELS[provider] || '当前平台'
}

function renderTogetherPerson(person) {
  return `
    <div class="together-person">
      <span class="together-person-avatar">${icons.user}</span>
      <span class="together-person-copy">
        <strong>${escapeHTML(person.name || '好友')}</strong>
        <small>${person.host ? '房主' : '参与者'}</small>
      </span>
    </div>
  `
}

function renderTogether() {
  if (!el.togetherContent) return
  const room = state.together
  el.togetherChatButton.hidden = !room.role
  el.togetherChatBadge.hidden = !room.role || state.togetherUnread < 1
  if (!room.role) {
    const provider = state.track?.provider || state.primaryProvider
    el.togetherContent.innerHTML = `
      <div class="together-entry-grid">
        <section class="together-card">
          <h2>创建房间</h2>
          <span class="together-platform">${escapeHTML(togetherProviderLabel(provider))}</span>
          <p class="together-card-copy">由你控制曲目和进度，双方都可以播放或暂停。好友使用自己的账号收听同一平台的歌曲。</p>
          <div class="together-actions">
            <button class="together-primary" id="together-create-button" ${room.busy ? 'disabled' : ''}>
              ${room.busy ? '正在创建' : '开启房间'}
            </button>
          </div>
          ${room.error ? `<div class="together-error">${escapeHTML(room.error)}</div>` : ''}
        </section>
        <section class="together-card">
          <h2>加入房间</h2>
          <span class="together-platform">同一平台 · 最多两人</span>
          <textarea class="together-invite-field" id="together-invite-input" placeholder="粘贴好友发来的邀请码"></textarea>
          <div class="together-actions">
            <button class="together-primary" id="together-join-button" ${room.busy ? 'disabled' : ''}>
              ${room.busy ? '正在连接' : '加入房间'}
            </button>
          </div>
        </section>
      </div>
    `
    return
  }

  const participants = room.participants || []
  const host = participants.find((person) => person.host)
  const guest = participants.find((person) => !person.host)
  const track = state.track
  const trackMatches = track?.provider === room.provider
  const nowPlaying = trackMatches
    ? `
      <div class="together-now">
        <div class="together-now-cover">
          ${track.cover ? `<img src="${escapeHTML(track.cover)}" alt="" />` : ''}
        </div>
        <div class="together-now-copy">
          <strong>${escapeHTML(track.name || '')}</strong>
          <span>${escapeHTML(track.artists?.join(' / ') || '')}</span>
          <span class="together-now-status">
            <i class="together-live-dot"></i>
            ${state.playing ? '正在播放' : '已暂停'}
          </span>
        </div>
      </div>
    `
    : `
      <div class="together-now">
        <div class="together-now-cover"></div>
        <div class="together-now-copy">
          <strong>等待房主播放</strong>
          <span>${escapeHTML(togetherProviderLabel(room.provider))}</span>
        </div>
      </div>
    `

  el.togetherContent.innerHTML = `
    <section class="together-room">
      <div class="together-room-head">
        <div class="together-room-title">
          <i class="together-live-dot"></i>
          <h2>房间已开启</h2>
          <span class="together-room-code">${escapeHTML(room.code)}</span>
        </div>
        <div class="together-room-actions">
          <button class="together-secondary" id="together-chat-open-button">聊天</button>
          <button class="together-secondary" id="together-copy-button">复制邀请码</button>
        </div>
      </div>
      <div class="together-room-body">
        ${nowPlaying}
        <div class="together-participants">
          ${host ? renderTogetherPerson(host) : renderTogetherPerson({ name: '我', host: true })}
          ${guest ? renderTogetherPerson(guest) : '<div class="together-waiting">等待好友加入</div>'}
        </div>
      </div>
      ${room.error ? `<div class="together-error together-room-error">${escapeHTML(room.error)}</div>` : ''}
      <div class="together-foot">
        <span class="together-foot-copy">
          ${room.role === 'host' ? '你正在主持房间' : '切歌与进度由房主控制，双方均可暂停'}
          · <code>${escapeHTML(togetherProviderLabel(room.provider))}</code>
        </span>
        <button class="together-secondary" id="together-leave-button">离开房间</button>
      </div>
    </section>
  `
}

async function createTogetherRoom() {
  if (state.together.busy) return
  const provider = state.track?.provider || state.primaryProvider
  state.together.busy = true
  state.together.error = ''
  renderTogether()
  try {
    const room = await api.createTogetherRoom(provider)
    state.together = {
      ...state.together,
      ...room,
      busy: false,
      error: '',
    }
    state.togetherMessages = []
    state.togetherUnread = 0
    setTogetherChatOpen(false)
    updateTogetherSyncLoop()
    scheduleTogetherSync(0)
    showToast(`已开启${togetherProviderLabel(provider)}一起听房间`)
  } catch (error) {
    state.together.busy = false
    state.together.error = friendlyError(error)
  }
  renderTogether()
}

async function joinTogetherRoom() {
  if (state.together.busy) return
  const input = $('#together-invite-input')
  const invite = input?.value.trim()
  if (!invite) {
    showToast('请粘贴邀请码')
    return
  }
  state.together.busy = true
  state.together.error = ''
  renderTogether()
  try {
    const profile = state.profiles[state.primaryProvider]
    const room = await api.joinTogetherRoom(invite, profile?.name || '好友')
    state.together = {
      ...state.together,
      ...room,
      busy: false,
      error: '',
    }
    state.togetherMessages = []
    state.togetherUnread = 0
    setTogetherChatOpen(false)
    showToast(`已加入${togetherProviderLabel(room.provider)}一起听房间`)
  } catch (error) {
    state.together.busy = false
    state.together.error = friendlyError(error)
  }
  renderTogether()
}

async function leaveTogetherRoom() {
  stopTogetherSyncLoop()
  state.togetherPendingSync = null
  state.togetherApplying = false
  await api.leaveTogetherRoom().catch(() => {})
  state.together = {
    ...state.together,
    status: 'idle',
    role: null,
    code: '',
    invite: '',
    provider: '',
    participants: [],
    connected: false,
    busy: false,
    error: '',
  }
  state.togetherMessages = []
  state.togetherUnread = 0
  setTogetherChatOpen(false)
  renderTogether()
}

async function copyTogetherInvite() {
  if (!state.together.invite) return
  try {
    await navigator.clipboard.writeText(state.together.invite)
    showToast('邀请码已复制')
  } catch {
    showToast('复制失败，请重试')
  }
}

function stopTogetherSyncLoop() {
  if (state.togetherSyncTimer) {
    window.clearInterval(state.togetherSyncTimer)
    state.togetherSyncTimer = null
  }
  if (state.togetherSyncTimeout) {
    window.clearTimeout(state.togetherSyncTimeout)
    state.togetherSyncTimeout = null
  }
}

function updateTogetherSyncLoop() {
  stopTogetherSyncLoop()
  if (state.together.role !== 'host') return
  state.togetherSyncTimer = window.setInterval(
    () => scheduleTogetherSync(0, true),
    1800,
  )
}

function scheduleTogetherSync(delay = 180) {
  if (state.together.role !== 'host' || !state.together.provider) return
  if (state.togetherSyncTimeout) {
    window.clearTimeout(state.togetherSyncTimeout)
  }
  state.togetherSyncTimeout = window.setTimeout(() => {
    state.togetherSyncTimeout = null
    syncTogetherState()
  }, delay)
}

async function syncTogetherState() {
  if (
    state.together.role !== 'host' ||
    !state.together.provider ||
    !state.track ||
    state.togetherSyncBusy
  ) {
    return
  }
  if (state.track.provider !== state.together.provider) {
    state.together.error = `房间当前只同步${togetherProviderLabel(state.together.provider)}歌曲`
    renderTogether()
    return
  }
  state.togetherSyncBusy = true
  try {
    const result = await api.syncTogether({
      track: state.track,
      playing: state.playing,
      position: audio.currentTime || 0,
    })
    if (!result?.ok) {
      state.together.error =
        result?.error || `房间当前只同步${togetherProviderLabel(state.together.provider)}歌曲`
      renderTogether()
    } else if (state.together.error) {
      state.together.error = ''
      renderTogether()
    }
  } catch {
    // The periodic sync will retry without interrupting playback.
  } finally {
    state.togetherSyncBusy = false
  }
}

async function applyTogetherSync(payload) {
  if (state.together.role !== 'guest' || !payload?.snapshot?.track) return
  state.togetherPendingSync = payload
  if (state.togetherApplying) return
  state.togetherApplying = true
  try {
    while (state.togetherPendingSync) {
      const next = state.togetherPendingSync
      state.togetherPendingSync = null
      const snapshot = next.snapshot
      if (snapshot.track.provider !== state.together.provider) continue

      const changingTrack = state.track?.id !== snapshot.track.id
      if (changingTrack) {
        state.queue = [snapshot.track]
        state.queueMode = 'together'
        state.queueContext = 'together'
        state.albumLoop = false
        state.activeAlbumId = null
        state.currentIndex = 0
        state.sources.together = state.queue
        renderQueue()
        updateAlbumLoopUI()
        await prepareTrack(snapshot.track, { play: snapshot.playing })
      } else if (snapshot.playing && audio.paused) {
        await startPlayback(state.track, state.loadToken)
      } else if (!snapshot.playing && !audio.paused) {
        audio.pause()
      }

      const elapsed = snapshot.playing
        ? Math.max(0, (Date.now() - Number(next.serverTime || Date.now())) / 1000)
        : 0
      const target = Math.max(0, Number(snapshot.position || 0) + elapsed)
      if (
        Number.isFinite(target) &&
        Number.isFinite(audio.duration) &&
        Math.abs(audio.currentTime - target) > 0.9
      ) {
        audio.currentTime = Math.min(target, audio.duration || target)
      }
    }
  } finally {
    state.togetherApplying = false
  }
}

function handleTogetherEvent({ event, payload } = {}) {
  if (event === 'state' && payload) {
    state.together = {
      ...state.together,
      ...payload,
      busy: false,
      error: payload.error || '',
    }
    updateTogetherSyncLoop()
    renderTogether()
    return
  }
  if (event === 'sync') {
    applyTogetherSync(payload).catch(() => {})
    return
  }
  if (event === 'control' && state.together.role === 'host') {
    applyTogetherPlaybackControl(payload?.action).catch(() => {})
    return
  }
  if (event === 'chat') {
    appendTogetherChat(payload, false)
    return
  }
  if (event === 'ended') {
    stopTogetherSyncLoop()
    state.together = {
      ...state.together,
      status: 'idle',
      role: null,
      code: '',
      invite: '',
      provider: '',
      participants: [],
      connected: false,
    }
    state.togetherMessages = []
    state.togetherUnread = 0
    setTogetherChatOpen(false)
    renderTogether()
    showToast(payload?.reason || '房间已关闭')
  }
}

async function requestTogetherPlayback(action = 'toggle-playback') {
  if (state.together.role !== 'guest' || !state.together.connected) {
    return
  }
  try {
    const result = await api.controlTogether(action)
    if (!result?.ok) showToast(result?.error || '无法控制播放')
  } catch (error) {
    showToast(friendlyError(error))
  }
}

async function applyTogetherPlaybackControl(action) {
  if (!['play', 'pause', 'toggle-playback'].includes(action)) return
  if (action === 'toggle-playback') {
    if (audio.paused || !audio.src) await startPlayback()
    else audio.pause()
  } else if (action === 'play' && (audio.paused || !audio.src)) {
    await startPlayback()
  } else if (action === 'pause' && !audio.paused) {
    audio.pause()
  }
  scheduleTogetherSync(0)
}

function blockTogetherGuestControl() {
  if (state.together.role !== 'guest' || !state.together.connected) {
    return false
  }
  showToast('播放由房主控制')
  return true
}

function togetherChatTime(timestamp) {
  const date = new Date(Number(timestamp) || Date.now())
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function renderTogetherChat() {
  el.togetherChatPlatform.textContent = state.together.provider
    ? `${togetherProviderLabel(state.together.provider)} · ${state.together.role === 'host' ? '房主' : '参与者'}`
    : ''
  el.togetherChatBadge.hidden =
    !state.together.role || state.togetherUnread < 1

  if (!state.togetherMessages.length) {
    el.togetherChatMessages.innerHTML =
      '<div class="together-chat-empty">还没有消息</div>'
    return
  }

  el.togetherChatMessages.innerHTML = state.togetherMessages
    .map(
      (message) => `
        <div class="together-chat-message ${message.mine ? 'is-mine' : ''}" data-chat-id="${escapeHTML(message.id)}">
          <span class="together-chat-avatar">${icons.user}</span>
          <div class="together-chat-message-copy">
            <span class="together-chat-meta">
              <span>${escapeHTML(message.mine ? '我' : message.name || '好友')}</span>
              <time>${togetherChatTime(message.sentAt)}</time>
            </span>
            <div class="together-chat-bubble ${message.kind === 'sticker' ? 'is-sticker' : ''}">${escapeHTML(message.text)}</div>
          </div>
        </div>
      `,
    )
    .join('')
  requestAnimationFrame(() => {
    el.togetherChatMessages.scrollTop =
      el.togetherChatMessages.scrollHeight
  })
}

function setTogetherChatOpen(open) {
  const canOpen = Boolean(state.together.role)
  const nextOpen = Boolean(open) && canOpen
  state.togetherChatOpen = nextOpen
  el.togetherChatPanel.classList.toggle('is-open', nextOpen)
  el.togetherChatPanel.setAttribute(
    'aria-hidden',
    nextOpen ? 'false' : 'true',
  )
  if (nextOpen) {
    setQueueOpen(false)
    setEqualizerOpen(false)
    setProfileOpen(false)
    state.togetherUnread = 0
    renderTogetherChat()
    requestAnimationFrame(() => el.togetherChatInput.focus())
  } else {
    setTogetherStickerPickerOpen(false)
    el.togetherChatBadge.hidden = true
  }
}

function setTogetherStickerPickerOpen(open) {
  el.togetherStickerPicker.classList.toggle('is-open', Boolean(open))
  el.togetherStickerPicker.setAttribute(
    'aria-hidden',
    open ? 'false' : 'true',
  )
  el.togetherStickerToggle.classList.toggle('is-active', Boolean(open))
  el.togetherStickerToggle.setAttribute('aria-expanded', String(Boolean(open)))
}

function openTogetherChat() {
  if (!state.together.role) return
  setView('now')
  setTogetherChatOpen(true)
}

function appendTogetherChat(message, mine = false) {
  if (!message?.id || !message.text) return
  if (state.togetherMessages.some((item) => item.id === message.id)) return
  state.togetherMessages.push({ ...message, mine })
  if (state.togetherMessages.length > 100) {
    state.togetherMessages.splice(0, state.togetherMessages.length - 100)
  }
  if (!mine && !state.togetherChatOpen) {
    state.togetherUnread += 1
    showToast(
      `${String(message.name || '好友').slice(0, 16)}：${String(message.text).slice(0, 42)}`,
      3200,
    )
  }
  renderTogetherChat()
}

async function sendTogetherMessage(text, kind = 'text') {
  if (!state.together.role) return
  const value = String(text || '').trim()
  if (!value) return
  const provider = state.together.provider || state.primaryProvider
  const profile = state.profiles[provider] || state.profile
  try {
    const result = await api.chatTogether({
      id: crypto.randomUUID(),
      kind,
      text: value,
      name: profile?.name || (state.together.role === 'host' ? '房主' : '好友'),
      sentAt: Date.now(),
    })
    if (!result?.ok) {
      showToast(result?.error || '消息发送失败')
      return
    }
    appendTogetherChat(result.message, true)
    return true
  } catch (error) {
    showToast(friendlyError(error))
  }
}

async function sendTogetherChat() {
  const text = el.togetherChatInput.value.trim()
  if (!text) return
  const sent = await sendTogetherMessage(text, 'text')
  if (!sent) return
  el.togetherChatInput.value = ''
  el.togetherChatInput.style.height = ''
  el.togetherChatSend.disabled = true
  setTogetherStickerPickerOpen(false)
}

async function sendTogetherSticker(sticker) {
  const sent = await sendTogetherMessage(sticker, 'sticker')
  if (sent) setTogetherStickerPickerOpen(false)
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
  const nextLiked = !previous
  state.liked = nextLiked
  el.likeButton.classList.toggle('is-active', state.liked)

  try {
    const result = await api.setLike(state.track, nextLiked)
    state.liked =
      typeof result?.liked === 'boolean' ? result.liked : nextLiked
    el.likeButton.classList.toggle('is-active', state.liked)
    syncLikedTrack(state.track, state.liked)
    showToast(state.liked ? '已加入我喜欢' : '已从我喜欢移除')
    refreshLibrary(false).catch(() => {})
  } catch (error) {
    state.liked = previous
    el.likeButton.classList.toggle('is-active', previous)
    showToast(friendlyError(error))
  }
}

function syncLikedTrack(track, liked) {
  if (track.provider !== state.primaryProvider) return
  const remaining = state.likedTracks.filter((item) => item.id !== track.id)
  state.likedTracks = liked ? [track, ...remaining] : remaining
  state.sources.likedTracks = state.likedTracks
  renderLibrary()

  if (
    state.currentView === 'playlist' &&
    state.activePlaylist?.id === `${state.primaryProvider}:liked`
  ) {
    const playlist = {
      ...state.activePlaylist,
      cover: state.likedTracks[0]?.cover || '',
      trackCount: state.likedTracks.length,
      tracks: state.likedTracks,
    }
    state.activePlaylist = playlist
    state.sources.playlist = playlist.tracks
    renderPlaylist(playlist)
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

function updateShuffleModeUI() {
  const label = state.shuffle ? '随机模式' : '顺序模式'
  el.shuffleButton.classList.toggle('is-active', state.shuffle)
  el.shuffleButton.dataset.tooltip = label
  el.shuffleButton.setAttribute('aria-label', label)
  el.shuffleButton.setAttribute('aria-pressed', String(state.shuffle))
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
    button.addEventListener('click', () => {
      if (button.dataset.nav === 'now') {
        returnToRoam().catch((error) => {
          showToast(friendlyError(error))
        })
        return
      }
      setView(button.dataset.nav)
    })
  })
  $$('[data-roam-mode]').forEach((button) => {
    button.addEventListener('click', () =>
      setRoamMode(button.dataset.roamMode).catch((error) => {
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
    updateShuffleModeUI()
    showToast(state.shuffle ? '已切换为随机播放' : '已切换为顺序播放')
  })
  el.repeatButton.addEventListener('click', cycleRepeatMode)
  el.albumLoopButton.addEventListener('click', () => {
    state.albumLoop = !state.albumLoop
    updateAlbumLoopUI()
  })
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
    if (blockTogetherGuestControl()) return
    const duration = Number.isFinite(audio.duration)
      ? audio.duration
      : (state.track?.duration || 0) / 1000
    if (duration > 0) audio.currentTime = (Number(el.progress.value) / 1000) * duration
    scheduleTogetherSync(0)
  })

  audio.addEventListener('play', () => {
    state.playing = true
    updatePlayButton()
    if (state.together.role) renderTogether()
    scheduleTogetherSync(0)
  })
  audio.addEventListener('pause', () => {
    state.playing = false
    updatePlayButton()
    if (state.together.role) renderTogether()
    scheduleTogetherSync(0)
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
  el.togetherChatButton.addEventListener('click', openTogetherChat)
  $('#together-chat-close').addEventListener('click', () =>
    setTogetherChatOpen(false),
  )
  $('#together-chat-backdrop').addEventListener('click', () =>
    setTogetherChatOpen(false),
  )
  el.togetherChatForm.addEventListener('submit', (event) => {
    event.preventDefault()
    sendTogetherChat()
  })
  el.togetherStickerToggle.addEventListener('click', () => {
    setTogetherStickerPickerOpen(
      !el.togetherStickerPicker.classList.contains('is-open'),
    )
  })
  el.togetherStickerPicker.addEventListener('click', (event) => {
    const sticker = event.target.closest('[data-sticker]')
    if (sticker) sendTogetherSticker(sticker.dataset.sticker)
  })
  el.togetherChatInput.addEventListener('focus', () => {
    setTogetherStickerPickerOpen(false)
  })
  el.togetherChatPanel.addEventListener('click', (event) => {
    if (
      el.togetherStickerPicker.classList.contains('is-open') &&
      !el.togetherStickerPicker.contains(event.target) &&
      !el.togetherStickerToggle.contains(event.target)
    ) {
      setTogetherStickerPickerOpen(false)
    }
  })
  el.togetherChatInput.addEventListener('input', () => {
    el.togetherChatSend.disabled = !el.togetherChatInput.value.trim()
    el.togetherChatInput.style.height = 'auto'
    el.togetherChatInput.style.height =
      `${Math.min(el.togetherChatInput.scrollHeight, 112)}px`
  })
  el.togetherChatInput.addEventListener('keydown', (event) => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.isComposing
    ) {
      event.preventDefault()
      sendTogetherChat()
    }
  })
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
    if (state.equalizerEnabled) state.smartEqualizerEnabled = false
    el.smartEqualizerToggle.checked = state.smartEqualizerEnabled
    applyEqualizer()
    saveAudioSettings()
  })
  el.smartEqualizerToggle.addEventListener('change', () => {
    state.smartEqualizerEnabled = el.smartEqualizerToggle.checked
    if (state.smartEqualizerEnabled) state.equalizerEnabled = false
    el.equalizerToggle.checked = state.equalizerEnabled
    applyEqualizer()
    saveAudioSettings()
  })
  el.reverbToggle.addEventListener('change', () => {
    state.reverbEnabled = el.reverbToggle.checked
    applyReverb()
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
  el.togetherContent.addEventListener('click', (event) => {
    if (event.target.closest('#together-create-button')) {
      createTogetherRoom()
    } else if (event.target.closest('#together-join-button')) {
      joinTogetherRoom()
    } else if (event.target.closest('#together-copy-button')) {
      copyTogetherInvite()
    } else if (event.target.closest('#together-chat-open-button')) {
      openTogetherChat()
    } else if (event.target.closest('#together-leave-button')) {
      leaveTogetherRoom()
    }
  })

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
      if (state.togetherChatOpen) {
        if (el.togetherStickerPicker.classList.contains('is-open')) {
          setTogetherStickerPickerOpen(false)
        } else {
          setTogetherChatOpen(false)
        }
        return
      }
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
      if (blockTogetherGuestControl()) return
      audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5)
      scheduleTogetherSync(0)
    } else if (event.key === 'ArrowLeft') {
      if (blockTogetherGuestControl()) return
      audio.currentTime = Math.max(0, audio.currentTime - 5)
      scheduleTogetherSync(0)
    }
  })

  if (navigator.mediaSession) {
    navigator.mediaSession.setActionHandler('play', () => {
      if (state.together.role === 'guest' && state.together.connected) {
        requestTogetherPlayback('play')
      } else if (!blockTogetherGuestControl()) {
        startPlayback()
      }
    })
    navigator.mediaSession.setActionHandler('pause', () => {
      if (state.together.role === 'guest' && state.together.connected) {
        requestTogetherPlayback('pause')
      } else if (!blockTogetherGuestControl()) {
        audio.pause()
      }
    })
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
  state.profile = state.profiles[state.primaryProvider] || null
  state.loudnessEnabled = bootstrap.audio?.loudnessEnabled !== false
  state.smartEqualizerEnabled =
    bootstrap.audio?.smartEqualizerEnabled !== false
  state.equalizerEnabled = bootstrap.audio?.equalizerEnabled !== false
  if (state.smartEqualizerEnabled && state.equalizerEnabled) {
    state.equalizerEnabled = false
  }
  state.reverbEnabled = bootstrap.audio?.reverbEnabled !== false
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
  state.queueContext = 'roam'
  state.albumLoop = false
  state.activeAlbumId = null
  updateAlbumLoopUI()
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
  state.queueContext = 'roam'
  state.albumLoop = false
  state.activeAlbumId = null
  updateAlbumLoopUI()
  state.sources.roam = state.queue
  state.currentIndex = 0
  renderQueue()
  await prepareTrack(track)
}

async function initialize() {
  bindEvents()
  api.onTogetherEvent(handleTogetherEvent)
  initializeAmbientCanvas()
  initializeTextMarquees()
  updatePlayButton()
  updateShuffleModeUI()
  updateProfileUI()
  renderEqualizerBands()
  renderQueue()
  renderTogether()
  renderTogetherChat()
  el.togetherChatSend.disabled = true
  updateQualityMenuSelection()
  api
    .getTogetherState()
    .then((room) => {
      state.together = { ...state.together, ...room }
      updateTogetherSyncLoop()
      renderTogether()
    })
    .catch(() => {})

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
