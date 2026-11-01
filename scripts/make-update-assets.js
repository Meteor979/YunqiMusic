const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
)
const builtAsar = path.join(
  root,
  'dist',
  'win-unpacked',
  'resources',
  'app.asar',
)

if (!fs.existsSync(builtAsar)) {
  throw new Error('app.asar is missing. Run the pack:dir build first.')
}

const releaseDir = path.join(root, 'release')
fs.mkdirSync(releaseDir, { recursive: true })

const outputAsar = path.join(releaseDir, 'app.asar')
fs.copyFileSync(builtAsar, outputAsar)

const sha256 = crypto
  .createHash('sha256')
  .update(fs.readFileSync(outputAsar))
  .digest('hex')

const manifest = {
  version: packageJson.version,
  asset: 'app.asar',
  sha256,
}

fs.writeFileSync(
  path.join(releaseDir, 'update.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
)

console.log(`Prepared Yunqi Music ${packageJson.version}`)
console.log(`SHA-256 ${sha256}`)
