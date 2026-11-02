const { app } = require('electron')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

const UPDATE_REPOSITORY =
  process.env.YUNQI_UPDATE_REPOSITORY || 'Meteor979/YunqiMusic'
const LATEST_RELEASE_ROOT = `https://github.com/${UPDATE_REPOSITORY}/releases/latest/download`
const RELEASE_API = `https://api.github.com/repos/${UPDATE_REPOSITORY}/releases/latest`
const USER_AGENT = 'YunqiMusic-Updater'

function versionParts(version) {
  return String(version)
    .replace(/^v/i, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0)
}

function isNewerVersion(candidate, current) {
  const next = versionParts(candidate)
  const present = versionParts(current)
  for (let index = 0; index < Math.max(next.length, present.length); index += 1) {
    if ((next[index] || 0) > (present[index] || 0)) return true
    if ((next[index] || 0) < (present[index] || 0)) return false
  }
  return false
}

async function fetchResponse(url, options = {}, retryOptions = {}) {
  const attempts = retryOptions.attempts || 2
  const timeout = retryOptions.timeout || 12000
  let lastError = null
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetch(url, {
        ...options,
        headers: {
          'User-Agent': USER_AGENT,
          'Cache-Control': 'no-cache',
          ...(options.headers || {}),
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeout),
      })
    } catch (error) {
      lastError = error
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
      }
    }
  }
  throw lastError
}

async function checkForUpdate() {
  let manifest = null
  let assetUrl = ''

  try {
    const directResponse = await fetchResponse(
      `${LATEST_RELEASE_ROOT}/update.json`,
      { headers: { Accept: 'application/json' } },
      { attempts: 1, timeout: 10000 },
    )
    if (directResponse.status === 404) {
      return {
        available: false,
        currentVersion: app.getVersion(),
        reason: '还没有发布版本',
      }
    }
    if (directResponse.ok) {
      manifest = await directResponse.json()
    }
  } catch {
    // Fall back to the GitHub release API when the redirect CDN is unavailable.
  }

  if (!manifest) {
    const releaseResponse = await fetchResponse(
      RELEASE_API,
      { headers: { Accept: 'application/vnd.github+json' } },
      { attempts: 2, timeout: 12000 },
    )
    if (releaseResponse.status === 404) {
      return {
        available: false,
        currentVersion: app.getVersion(),
        reason: '还没有发布版本',
      }
    }
    if (!releaseResponse.ok) {
      throw new Error(`GitHub Releases 请求失败（${releaseResponse.status}）`)
    }
    const release = await releaseResponse.json()
    const manifestAsset = (release.assets || []).find(
      (asset) => asset.name === 'update.json',
    )
    if (!manifestAsset) throw new Error('最新版本缺少 update.json')
    const manifestResponse = await fetchResponse(
      manifestAsset.browser_download_url,
      { headers: { Accept: 'application/octet-stream' } },
      { attempts: 2, timeout: 12000 },
    )
    if (!manifestResponse.ok) throw new Error('无法读取更新清单')
    manifest = await manifestResponse.json()
    const assetName = manifest.asset || 'app.asar'
    const appAsset = (release.assets || []).find(
      (asset) => asset.name === assetName,
    )
    if (!appAsset) throw new Error('Update asset is missing')
    assetUrl = appAsset.browser_download_url
  }

  const latestVersion = String(manifest.version || '').replace(/^v/i, '')
  if (!latestVersion || !isNewerVersion(latestVersion, app.getVersion())) {
    return {
      available: false,
      currentVersion: app.getVersion(),
      latestVersion: latestVersion || app.getVersion(),
    }
  }

  const assetName = manifest.asset || 'app.asar'
  if (!manifest.sha256) {
    throw new Error('最新版本缺少应用包或校验值')
  }

  return {
    available: true,
    currentVersion: app.getVersion(),
    latestVersion,
    assetName,
    assetUrl:
      assetUrl ||
      `${LATEST_RELEASE_ROOT}/${encodeURIComponent(assetName)}`,
    sha256: String(manifest.sha256).toLowerCase(),
    releaseUrl: `https://github.com/${UPDATE_REPOSITORY}/releases/latest`,
  }
}

async function downloadUpdate(update) {
  const response = await fetchResponse(update.assetUrl, {
    headers: { Accept: 'application/octet-stream' },
  })
  if (!response.ok) {
    throw new Error(`更新下载失败（${response.status}）`)
  }

  const contentLength = Number(response.headers.get('content-length') || 0)
  if (contentLength > 80 * 1024 * 1024) {
    throw new Error('更新文件大小异常')
  }

  const data = Buffer.from(await response.arrayBuffer())
  if (data.length > 80 * 1024 * 1024) {
    throw new Error('更新文件大小异常')
  }

  const actualHash = crypto.createHash('sha256').update(data).digest('hex')
  if (actualHash !== update.sha256) {
    throw new Error('更新文件校验失败')
  }

  const updateDir = path.join(
    app.getPath('temp'),
    `yunqi-update-${update.latestVersion}-${Date.now()}`,
  )
  fs.mkdirSync(updateDir, { recursive: true })
  const downloadPath = path.join(updateDir, 'app.asar')
  fs.writeFileSync(downloadPath, data)
  return { updateDir, downloadPath }
}

function launchReplacement({ updateDir, downloadPath }) {
  const appPath = app.getAppPath()
  if (!appPath.endsWith('app.asar')) {
    throw new Error('开发模式下不能安装更新')
  }

  const scriptPath = path.join(updateDir, 'apply-update.ps1')
  const script = `
param(
  [int]$ProcessId,
  [string]$Source,
  [string]$Target,
  [string]$Restart
)

try {
  Wait-Process -Id $ProcessId -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 900

  $copied = $false
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    try {
      Copy-Item -LiteralPath $Source -Destination $Target -Force -ErrorAction Stop
      $copied = $true
      break
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }

  if ($copied) {
    Start-Process -FilePath $Restart -WorkingDirectory (Split-Path -Parent $Restart)
  }
} finally {
  Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue
}
`

  fs.writeFileSync(scriptPath, `\ufeff${script}`, 'utf8')
  const helper = spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-WindowStyle',
      'Hidden',
      '-File',
      scriptPath,
      '-ProcessId',
      String(process.pid),
      '-Source',
      downloadPath,
      '-Target',
      appPath,
      '-Restart',
      process.execPath,
    ],
    {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    },
  )
  helper.unref()
}

async function installUpdate(update) {
  if (process.platform !== 'win32' || !app.isPackaged) {
    throw new Error('当前运行方式不支持自动安装更新')
  }

  const downloaded = await downloadUpdate(update)
  launchReplacement(downloaded)
  setTimeout(() => app.quit(), 150)
  return { started: true }
}

module.exports = {
  checkForUpdate,
  installUpdate,
  UPDATE_REPOSITORY,
}
