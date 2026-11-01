const { app } = require('electron')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

const UPDATE_REPOSITORY =
  process.env.YUNQI_UPDATE_REPOSITORY || 'Meteor979/YunqiMusic'
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

async function fetchResponse(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/vnd.github+json',
      ...(options.headers || {}),
    },
    redirect: 'follow',
  })
  return response
}

async function checkForUpdate() {
  const response = await fetchResponse(RELEASE_API)
  if (response.status === 404) {
    return {
      available: false,
      currentVersion: app.getVersion(),
      reason: '还没有发布版本',
    }
  }
  if (!response.ok) {
    throw new Error(`GitHub Releases 请求失败（${response.status}）`)
  }

  const release = await response.json()
  const latestVersion = String(release.tag_name || release.name || '').replace(
    /^v/i,
    '',
  )
  if (!latestVersion || !isNewerVersion(latestVersion, app.getVersion())) {
    return {
      available: false,
      currentVersion: app.getVersion(),
      latestVersion: latestVersion || app.getVersion(),
    }
  }

  const manifestAsset = (release.assets || []).find(
    (asset) => asset.name === 'update.json',
  )
  if (!manifestAsset) {
    throw new Error('最新版本缺少 update.json')
  }

  const manifestResponse = await fetchResponse(manifestAsset.browser_download_url, {
    headers: { Accept: 'application/octet-stream' },
  })
  if (!manifestResponse.ok) {
    throw new Error('无法读取更新清单')
  }
  const manifest = await manifestResponse.json()
  if (
    manifest.version &&
    String(manifest.version).replace(/^v/i, '') !== latestVersion
  ) {
    throw new Error('更新清单版本与 Release 不一致')
  }
  const assetName = manifest.asset || 'app.asar'
  const appAsset = (release.assets || []).find(
    (asset) => asset.name === assetName,
  )
  if (!appAsset || !manifest.sha256) {
    throw new Error('最新版本缺少应用包或校验值')
  }

  return {
    available: true,
    currentVersion: app.getVersion(),
    latestVersion,
    assetName,
    assetUrl: appAsset.browser_download_url,
    sha256: String(manifest.sha256).toLowerCase(),
    releaseUrl: release.html_url,
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
