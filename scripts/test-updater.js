const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')
const { createReplacementScript } = require('../src/main/updater')

const powershellPath = path.join(
  process.env.SystemRoot || 'C:\\Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe',
)
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yunqi-updater-test-'))
const sourceDir = path.join(root, 'source')
const targetDir = path.join(root, 'target')
const sourcePath = path.join(sourceDir, 'update.bin')
const targetPath = path.join(targetDir, 'app.asar')
const helperPath = path.join(root, 'apply-update.ps1')
const readyPath = path.join(root, 'helper.ready')
const logPath = path.join(root, 'update.log')
const expected = Buffer.from('yunqi updater integration test')
const expectedHash = crypto
  .createHash('sha256')
  .update(expected)
  .digest('hex')
  .toUpperCase()

fs.mkdirSync(sourceDir, { recursive: true })
fs.mkdirSync(targetDir, { recursive: true })
fs.writeFileSync(sourcePath, expected)
fs.writeFileSync(targetPath, 'old package')
fs.writeFileSync(helperPath, `\uFEFF${createReplacementScript()}`, 'utf8')

const helper = spawn(
  powershellPath,
  [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-WindowStyle',
    'Hidden',
    '-File',
    helperPath,
  ],
  {
    cwd: root,
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      YUNQI_UPDATE_PID: '2147483647',
      YUNQI_UPDATE_SOURCE: sourcePath,
      YUNQI_UPDATE_TARGET: targetPath,
      YUNQI_UPDATE_RESTART: '',
      YUNQI_UPDATE_HASH: expectedHash,
      YUNQI_UPDATE_LOG: logPath,
      YUNQI_UPDATE_READY: readyPath,
    },
  },
)

const timeout = setTimeout(() => {
  helper.kill()
  console.error('FAIL: updater helper timed out')
  process.exitCode = 1
}, 15000)

helper.once('error', (error) => {
  clearTimeout(timeout)
  console.error(`FAIL: could not start updater helper: ${error.message}`)
  process.exitCode = 1
})

helper.once('exit', (code) => {
  clearTimeout(timeout)
  const installed = fs.existsSync(targetPath)
    ? fs.readFileSync(targetPath)
    : Buffer.alloc(0)
  const installedHash = crypto
    .createHash('sha256')
    .update(installed)
    .digest('hex')
    .toUpperCase()
  const ready = fs.existsSync(readyPath)
  const log = fs.existsSync(logPath)
    ? fs.readFileSync(logPath, 'utf8').trim()
    : 'NO LOG'

  console.log(log)
  console.log(`helper exit: ${code}`)
  console.log(`ready signal: ${ready}`)
  console.log(`installed hash matches: ${installedHash === expectedHash}`)

  if (code !== 0 || !ready || installedHash !== expectedHash) {
    process.exitCode = 1
  }

  fs.rmSync(root, { recursive: true, force: true })
})
