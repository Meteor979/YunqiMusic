const crypto = require('crypto')
const http = require('http')
const os = require('os')

const MAX_MESSAGE_SIZE = 512 * 1024
const JOIN_TIMEOUT = 10000
const PROVIDERS = new Set(['netease', 'kugou', 'qq', 'qishui'])

function websocketFrame(payload, opcode = 1) {
  const body = Buffer.isBuffer(payload)
    ? payload
    : Buffer.from(String(payload), 'utf8')
  let header
  if (body.length < 126) {
    header = Buffer.from([0x80 | opcode, body.length])
  } else if (body.length < 65536) {
    header = Buffer.alloc(4)
    header[0] = 0x80 | opcode
    header[1] = 126
    header.writeUInt16BE(body.length, 2)
  } else {
    header = Buffer.alloc(10)
    header[0] = 0x80 | opcode
    header[1] = 127
    header.writeBigUInt64BE(BigInt(body.length), 2)
  }
  return Buffer.concat([header, body])
}

function attachWebSocketReader(socket, { onMessage, onClose }) {
  let pending = Buffer.alloc(0)
  let fragments = []
  let fragmentedOpcode = 1
  let closed = false

  const finish = () => {
    if (closed) return
    closed = true
    onClose()
  }

  socket.on('data', (chunk) => {
    pending = Buffer.concat([pending, chunk])
    while (pending.length >= 2) {
      const first = pending[0]
      const second = pending[1]
      const fin = Boolean(first & 0x80)
      const opcode = first & 0x0f
      const masked = Boolean(second & 0x80)
      let length = second & 0x7f
      let offset = 2

      if (length === 126) {
        if (pending.length < 4) return
        length = pending.readUInt16BE(2)
        offset = 4
      } else if (length === 127) {
        if (pending.length < 10) return
        const wideLength = pending.readBigUInt64BE(2)
        if (wideLength > BigInt(MAX_MESSAGE_SIZE)) {
          socket.destroy()
          finish()
          return
        }
        length = Number(wideLength)
        offset = 10
      }
      if (length > MAX_MESSAGE_SIZE) {
        socket.destroy()
        finish()
        return
      }

      const maskLength = masked ? 4 : 0
      if (pending.length < offset + maskLength + length) return

      let payload = pending.subarray(
        offset + maskLength,
        offset + maskLength + length,
      )
      if (masked) {
        const mask = pending.subarray(offset, offset + 4)
        payload = Buffer.from(payload)
        for (let index = 0; index < payload.length; index += 1) {
          payload[index] ^= mask[index % 4]
        }
      }
      pending = pending.subarray(offset + maskLength + length)

      if (opcode === 8) {
        try {
          socket.write(websocketFrame(Buffer.alloc(0), 8))
        } catch {
          // The peer may already be closed.
        }
        socket.end()
        finish()
        return
      }
      if (opcode === 9) {
        try {
          socket.write(websocketFrame(payload, 10))
        } catch {
          finish()
        }
        continue
      }
      if (opcode === 10) continue

      if (opcode === 1 || opcode === 2) {
        fragmentedOpcode = opcode
        fragments = [payload]
      } else if (opcode === 0) {
        fragments.push(payload)
      } else {
        continue
      }

      if (fin) {
        const message = Buffer.concat(fragments)
        fragments = []
        if (fragmentedOpcode === 1) {
          onMessage(message.toString('utf8'))
        }
      }
    }
  })
  socket.on('close', finish)
  socket.on('error', finish)
}

function privateLanAddress() {
  const candidates = []
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (
        address.family !== 'IPv4' ||
        address.internal ||
        !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address.address)
      ) {
        continue
      }
      const preferred = /wi-?fi|wlan|wireless|ethernet|以太网|无线/i.test(name)
      candidates.push({ address: address.address, preferred })
    }
  }
  candidates.sort((left, right) => Number(right.preferred) - Number(left.preferred))
  return candidates[0]?.address || '127.0.0.1'
}

function makeRoomCode() {
  return String(crypto.randomInt(100000, 1000000))
}

function encodeInvite(endpoint, room) {
  return Buffer.from(JSON.stringify({ version: 1, endpoint, room }))
    .toString('base64url')
}

function decodeInvite(value) {
  const text = String(value || '').trim()
  if (!text) throw new Error('请粘贴邀请码')
  try {
    const parsed = JSON.parse(Buffer.from(text, 'base64url').toString('utf8'))
    const endpoint = new URL(String(parsed.endpoint))
    const room = String(parsed.room || '')
    if (
      endpoint.protocol !== 'ws:' ||
      !/^\d{6}$/.test(room) ||
      parsed.version !== 1
    ) {
      throw new Error()
    }
    return { endpoint: endpoint.origin, room }
  } catch {
    throw new Error('邀请码无效')
  }
}

function normalizeSnapshot(snapshot, provider) {
  if (!snapshot?.track?.id || snapshot.track.provider !== provider) {
    throw new Error('房间只能同步同一平台的歌曲')
  }
  return {
    track: snapshot.track,
    playing: Boolean(snapshot.playing),
    position: Math.max(0, Number(snapshot.position) || 0),
  }
}

function normalizeChatMessage(message) {
  const kind = message?.kind === 'sticker' ? 'sticker' : 'text'
  const maxLength = kind === 'sticker' ? 32 : 1000
  const text = String(message?.text || '').trim().slice(0, maxLength)
  if (!text) throw new Error('消息不能为空')
  return {
    id: String(message.id || crypto.randomUUID()),
    kind,
    text,
    name: String(message.name || '好友').slice(0, 30),
    sentAt: Number(message.sentAt) || Date.now(),
  }
}

function createTogetherService({ emit = () => {} } = {}) {
  let role = null
  let room = null
  let server = null
  let guestSocket = null
  let guestName = ''
  let guestId = ''
  let latestSnapshot = null
  const sockets = new Set()

  function publicState() {
    if (!role || !room) {
      return {
        status: 'idle',
        role: null,
        code: '',
        invite: '',
        provider: '',
        participants: [],
        connected: false,
      }
    }
    const participants =
      role === 'host'
        ? [{ id: 'host', name: '我', host: true }]
        : (room.participants || [])
    if (role === 'host' && guestSocket) {
      participants.push({
        id: guestId,
        name: guestName || '好友',
        host: false,
      })
    }
    return {
      status: role === 'host' || guestSocket?.readyState === WebSocket.OPEN
        ? 'connected'
        : 'connecting',
      role,
      code: room.code,
      invite: room.invite,
      provider: room.provider,
      participants,
      connected:
        role === 'host'
          ? Boolean(guestSocket)
          : guestSocket?.readyState === WebSocket.OPEN,
    }
  }

  function notifyState() {
    emit('state', publicState())
  }

  function sendJson(socket, value) {
    if (!socket) return false
    try {
      const payload = JSON.stringify(value)
      if (typeof socket.send === 'function') {
        if (socket.readyState !== WebSocket.OPEN) return false
        socket.send(payload)
      } else if (typeof socket.write === 'function' && !socket.destroyed) {
        socket.write(websocketFrame(payload))
      } else {
        return false
      }
      return true
    } catch {
      return false
    }
  }

  function closeGuest() {
    if (!guestSocket) return
    try {
      guestSocket.close()
    } catch {
      // The socket may already be closed.
    }
    guestSocket = null
    guestName = ''
    guestId = ''
    notifyState()
  }

  function startServer(code, provider) {
    return new Promise((resolve, reject) => {
      const httpServer = http.createServer((_request, response) => {
        response.writeHead(426, { 'Content-Type': 'text/plain; charset=utf-8' })
        response.end('WebSocket upgrade required')
      })

      httpServer.on('upgrade', (request, socket) => {
        let requestUrl
        try {
          requestUrl = new URL(request.url, 'http://localhost')
        } catch {
          socket.destroy()
          return
        }
        const requestedCode = requestUrl.searchParams.get('room')
        const key = request.headers['sec-websocket-key']
        if (
          requestUrl.pathname !== '/together' ||
          requestedCode !== code ||
          typeof key !== 'string'
        ) {
          socket.end(
            'HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',
          )
          return
        }
        if (guestSocket || sockets.size > 1) {
          socket.end(
            'HTTP/1.1 409 Conflict\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',
          )
          return
        }

        const accept = crypto
          .createHash('sha1')
          .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
          .digest('base64')
        socket.write(
          [
            'HTTP/1.1 101 Switching Protocols',
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Accept: ${accept}`,
            '',
            '',
          ].join('\r\n'),
        )

        guestSocket = socket
        guestId = crypto.randomUUID()
        guestName = ''
        sockets.add(socket)
        sendJson(socket, {
          type: 'welcome',
          room: {
            code,
            provider,
            participants: [
              { id: 'host', name: '房主', host: true },
              { id: guestId, name: '好友', host: false },
            ],
          },
        })
        if (latestSnapshot) {
          sendJson(socket, {
            type: 'sync',
            snapshot: latestSnapshot,
            serverTime: Date.now(),
          })
        }
        notifyState()

        attachWebSocketReader(socket, {
          onMessage: (message) => {
            try {
              const payload = JSON.parse(message)
              if (payload.type === 'hello') {
                guestName = String(payload.name || '').slice(0, 30)
                notifyState()
              } else if (
                payload.type === 'control' &&
                ['play', 'pause', 'toggle-playback'].includes(payload.action)
              ) {
                emit('control', {
                  action: payload.action,
                  participantId: guestId,
                })
              } else if (payload.type === 'chat') {
                const message = normalizeChatMessage({
                  ...payload.message,
                  name: guestName || payload.message?.name || '好友',
                })
                emit('chat', message)
              }
            } catch {
              // Ignore malformed client messages.
            }
          },
          onClose: () => {
            sockets.delete(socket)
            if (guestSocket === socket) {
              guestSocket = null
              guestName = ''
              guestId = ''
              notifyState()
            }
          },
        })
      })

      httpServer.once('error', reject)
      httpServer.listen(0, '0.0.0.0', () => {
        httpServer.removeListener('error', reject)
        resolve(httpServer)
      })
    })
  }

  async function createRoom(provider) {
    if (!PROVIDERS.has(provider)) throw new Error('当前平台不支持一起听')
    await leaveRoom()
    const code = makeRoomCode()
    server = await startServer(code, provider)
    const port = server.address().port
    const endpoint = `ws://${privateLanAddress()}:${port}`
    room = {
      code,
      provider,
      invite: encodeInvite(endpoint, code),
    }
    role = 'host'
    latestSnapshot = null
    notifyState()
    return publicState()
  }

  async function joinRoom(invite, name = '好友') {
    const parsed = decodeInvite(invite)
    await leaveRoom()
    role = 'guest'
    room = {
      code: parsed.room,
      provider: '',
      invite: String(invite).trim(),
    }
    notifyState()

    return new Promise((resolve, reject) => {
      const socket = new WebSocket(
        `${parsed.endpoint}/together?room=${parsed.room}`,
      )
      let settled = false
      const timeout = setTimeout(() => {
        if (settled) return
        settled = true
        try {
          socket.close()
        } catch {
          // Ignore close errors during timeout cleanup.
        }
        role = null
        room = null
        notifyState()
        reject(new Error('连接房间超时'))
      }, JOIN_TIMEOUT)

      const fail = (error) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        role = null
        room = null
        notifyState()
        reject(error)
      }

      socket.onopen = () => {
        guestSocket = socket
        sendJson(socket, { type: 'hello', name: String(name || '好友') })
      }
      socket.onerror = () => fail(new Error('无法连接房间，请检查网络'))
      socket.onclose = () => {
        if (!settled) {
          fail(new Error('房间已关闭'))
          return
        }
        if (role === 'guest') {
          emit('ended', { reason: '房主已关闭房间' })
          role = null
          room = null
          guestSocket = null
          notifyState()
        }
      }
      socket.onmessage = (event) => {
        let payload
        try {
          payload = JSON.parse(String(event.data))
        } catch {
          return
        }
        if (payload.type === 'welcome') {
          room = {
            ...room,
            provider: payload.room.provider,
            participants: payload.room.participants,
          }
          settled = true
          clearTimeout(timeout)
          notifyState()
          resolve(publicState())
        } else if (payload.type === 'sync' && role === 'guest') {
          emit('sync', payload)
        } else if (payload.type === 'chat' && role === 'guest') {
          try {
            emit('chat', normalizeChatMessage(payload.message))
          } catch {
            // Ignore malformed chat messages.
          }
        }
      }
    })
  }

  async function leaveRoom() {
    if (guestSocket) {
      const socket = guestSocket
      guestSocket = null
      try {
        socket.close()
      } catch {
        // The peer may already be gone.
      }
    }
    for (const socket of sockets) {
      try {
        socket.destroy()
      } catch {
        // Ignore cleanup errors.
      }
    }
    sockets.clear()
    if (server) {
      await new Promise((resolve) => server.close(() => resolve()))
    }
    server = null
    role = null
    room = null
    guestName = ''
    guestId = ''
    latestSnapshot = null
    notifyState()
  }

  function sync(snapshot) {
    if (role !== 'host' || !room) {
      return { ok: false, error: '只有房主可以同步播放' }
    }
    let normalized
    try {
      normalized = normalizeSnapshot(snapshot, room.provider)
    } catch (error) {
      return { ok: false, error: error.message }
    }
    latestSnapshot = normalized
    if (guestSocket) {
      sendJson(guestSocket, {
        type: 'sync',
        snapshot: normalized,
        serverTime: Date.now(),
      })
    }
    return { ok: true }
  }

  function control(action) {
    if (role !== 'guest' || !guestSocket) {
      return { ok: false, error: '当前不在一起听房间中' }
    }
    if (!['play', 'pause', 'toggle-playback'].includes(action)) {
      return { ok: false, error: '当前操作不受支持' }
    }
    return sendJson(guestSocket, { type: 'control', action })
      ? { ok: true }
      : { ok: false, error: '房主连接已断开' }
  }

  function chat(message) {
    if (!role || !room) {
      return { ok: false, error: '当前不在一起听房间中' }
    }
    let normalized
    try {
      normalized = normalizeChatMessage(message)
    } catch (error) {
      return { ok: false, error: error.message }
    }
    if (role === 'host') {
      return guestSocket && sendJson(guestSocket, {
        type: 'chat',
        message: normalized,
      })
        ? { ok: true, message: normalized }
        : { ok: false, error: '好友尚未加入房间' }
    }
    return sendJson(guestSocket, {
      type: 'chat',
      message: normalized,
    })
      ? { ok: true, message: normalized }
      : { ok: false, error: '房主连接已断开' }
  }

  return {
    createRoom,
    joinRoom,
    leaveRoom,
    sync,
    control,
    chat,
    getState: publicState,
  }
}

module.exports = {
  createTogetherService,
  decodeInvite,
  encodeInvite,
}
