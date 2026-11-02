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
      { attempts: 2, timeout: 20000 },
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
  let response
  try {
    response = await fetchResponse(
      update.assetUrl,
      { headers: { Accept: 'application/octet-stream' } },
      { attempts: 1, timeout: 180000 },
    )
  } catch {
    throw new Error('更新文件下载超时，请检查网络后重试')
  }
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
  const file = fs.openSync(downloadPath, 'w')
  try {
    fs.writeFileSync(file, data)
    fs.fsyncSync(file)
  } finally {
    fs.closeSync(file)
  }
  return {
    updateDir,
    downloadPath,
    sha256: update.sha256,
  }
}

function createReplacementScript() {
  return `
param(
  [int]$AppProcessId,
  [string]$Source,
  [string]$Target,
  [string]$Restart,
  [string]$ExpectedHash,
  [string]$LogPath
)

$ErrorActionPreference = 'Stop'

function Write-UpdateLog([string]$Message) {
  try {
    Add-Content -LiteralPath $LogPath -Value (
      (Get-Date).ToString('o') + ' ' + $Message
    ) -Encoding UTF8
  } catch {
    # Logging must never prevent the update.
  }
}

function Test-FileHash([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
  $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
  return $actual -eq $ExpectedHash
}

$staging = $null
$backup = $null
try {
  Write-UpdateLog 'Waiting for the application to exit.'
  Wait-Process -Id $AppProcessId -ErrorAction SilentlyContinue
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    if (-not (Get-Process -Id $AppProcessId -ErrorAction SilentlyContinue)) {
      break
    }
    Start-Sleep -Milliseconds 250
  }
  Start-Sleep -Milliseconds 1800

  $targetDirectory = Split-Path -Parent $Target
  $staging = Join-Path $targetDirectory 'app.asar.update'
  $backup = Join-Path $targetDirectory 'app.asar.previous'

  Remove-Item -LiteralPath $staging -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue

  Write-UpdateLog 'Copying the verified update onto the target volume.'
  $staged = $false
  for ($attempt = 0; $attempt -lt 80; $attempt++) {
    try {
      [System.IO.File]::Copy($Source, $staging, $true)
      if (Test-FileHash $staging) {
        $staged = $true
        break
      }
      Write-UpdateLog 'The staged update did not match its expected hash.'
    } catch {
      Write-UpdateLog ('Staging attempt failed: ' + $_.Exception.Message)
    }
    Start-Sleep -Milliseconds 500
  }
  if (-not $staged) {
    throw 'Could not create a verified local staging file.'
  }

  Write-UpdateLog 'Atomically replacing app.asar.'
  $installed = $false
  for ($attempt = 0; $attempt -lt 80; $attempt++) {
    try {
      if (Test-Path -LiteralPath $Target -PathType Leaf) {
        [System.IO.File]::Replace($staging, $Target, $backup, $true)
      } else {
        Move-Item -LiteralPath $staging -Destination $Target -Force -ErrorAction Stop
      }
      if (Test-FileHash $Target) {
        $installed = $true
        break
      }
      Write-UpdateLog 'The installed package did not match its expected hash.'
    } catch {
      Write-UpdateLog ('Replacement attempt failed: ' + $_.Exception.Message)
    }

    if (-not (Test-Path -LiteralPath $staging -PathType Leaf)) {
      try {
        [System.IO.File]::Copy($Source, $staging, $true)
      } catch {
        Write-UpdateLog ('Restaging failed: ' + $_.Exception.Message)
      }
    }
    Start-Sleep -Milliseconds 500
  }
  if (-not $installed) {
    throw 'Could not atomically replace app.asar.'
  }

  Write-UpdateLog 'Update installed. Restarting the application.'
  if ($Restart -and (Test-Path -LiteralPath $Restart -PathType Leaf)) {
    Start-Process -FilePath $Restart -WorkingDirectory (Split-Path -Parent $Restart)
  }
} catch {
  Write-UpdateLog ('Update failed: ' + $_.Exception.Message)
  if (
    $backup -and
    (Test-Path -LiteralPath $backup -PathType Leaf) -and
    -not (Test-Path -LiteralPath $Target -PathType Leaf)
  ) {
    try {
      Copy-Item -LiteralPath $backup -Destination $Target -Force -ErrorAction Stop
      Write-UpdateLog 'Restored the previous app.asar.'
    } catch {
      Write-UpdateLog ('Could not restore the previous app.asar: ' + $_.Exception.Message)
    }
  }
} finally {
  if ($staging) {
    Remove-Item -LiteralPath $staging -Force -ErrorAction SilentlyContinue
  }
  if ($backup) {
    Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue
}
`
}

function launchReplacement({ updateDir, downloadPath, sha256 }) {
  const appPath = app.getAppPath()
  if (!appPath.endsWith('app.asar')) {
    throw new Error('开发模式下不能安装更新')
  }

  const scriptPath = path.join(updateDir, 'apply-update.ps1')
  const logPath = path.join(updateDir, 'apply-update.log')
  const script = createReplacementScript()
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
      '-AppProcessId',
      String(process.pid),
      '-Source',
      downloadPath,
      '-Target',
      appPath,
      '-Restart',
      process.execPath,
      '-ExpectedHash',
      sha256,
      '-LogPath',
      logPath,
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
  setTimeout(() => app.quit(), 300)
  return { started: true }
}

module.exports = {
  checkForUpdate,
  installUpdate,
  UPDATE_REPOSITORY,
  createReplacementScript,
}
