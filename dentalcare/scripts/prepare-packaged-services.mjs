import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const appRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(appRoot, '..')
const stageRoot = path.join(appRoot, 'build', 'packaged-services')

const junkNames = new Set([
  '.DS_Store',
  '.cache',
  '.github',
  '.git',
  '.idea',
  '.vscode',
  '__pycache__',
  '__tests__',
  'coverage',
  'docs',
  'examples',
  'screenshots',
  'test',
  'tests',
])

const junkExtensions = [
  '.bak',
  '.backup',
  '.cmd',
  '.log',
  '.map',
  '.md',
  '.pyc',
  '.spec',
  '.ts',
  '.tsx',
]

function isJunkPath(filePath) {
  const parts = filePath.split(path.sep)
  const base = path.basename(filePath)
  const lower = base.toLowerCase()

  if (filePath.includes(`${path.sep}node_modules${path.sep}puppeteer${path.sep}.local-chromium${path.sep}`)) {
    return true
  }

  if (parts.includes('node_modules') && parts.includes('puppeteer') && parts.includes('.local-chromium')) {
    return true
  }

  if (parts.includes('node_modules') && parts.includes('.bin') && base === 'prisma') {
    return true
  }

  if (parts.includes('node_modules') && parts[parts.indexOf('node_modules') + 1] === 'prisma') {
    return true
  }

  if (
    parts.includes('node_modules') &&
    parts[parts.indexOf('node_modules') + 1] === '@prisma' &&
    parts[parts.indexOf('node_modules') + 2] === 'engines'
  ) {
    return true
  }

  if (parts.some((part) => junkNames.has(part))) {
    return true
  }

  if (lower === 'package-lock.json' || lower === '.package-lock.json' || lower === 'npm-shrinkwrap.json') {
    return true
  }

  if (lower.startsWith('readme')) {
    return true
  }

  return junkExtensions.some((extension) => lower.endsWith(extension))
}

function shouldKeepPrismaEngine(filePath) {
  const base = path.basename(filePath)

  if (!base.includes('query_engine') && !base.includes('schema-engine') && !base.includes('libquery_engine')) {
    return true
  }

  return base.includes('darwin-arm64')
}

function copyFile(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(source, target)
}

function copyTree(source, target, options = {}) {
  if (!fs.existsSync(source)) {
    throw new Error(`Missing build input: ${source}`)
  }

  const stats = fs.statSync(source)

  if (stats.isDirectory()) {
    fs.mkdirSync(target, { recursive: true })

    for (const entry of fs.readdirSync(source)) {
      const nextSource = path.join(source, entry)
      const nextTarget = path.join(target, entry)
      const relativePath = path.relative(source, nextSource)

      if (options.filter && !options.filter(nextSource, relativePath)) {
        continue
      }

      copyTree(nextSource, nextTarget, options)
    }

    return
  }

  if (options.filter && !options.filter(source, path.basename(source))) {
    return
  }

  copyFile(source, target)
}

function writeRuntimePackage(sourcePackagePath, targetPackagePath, options = {}) {
  const sourcePackage = JSON.parse(fs.readFileSync(sourcePackagePath, 'utf-8'))
  const omittedDependencies = new Set(options.omitDependencies ?? [])
  const dependencies = Object.fromEntries(
    Object.entries(sourcePackage.dependencies ?? {}).filter(([name]) => !omittedDependencies.has(name)),
  )
  const runtimePackage = {
    name: sourcePackage.name,
    version: sourcePackage.version,
    private: true,
    main: sourcePackage.main,
    dependencies,
  }

  fs.mkdirSync(path.dirname(targetPackagePath), { recursive: true })
  fs.writeFileSync(targetPackagePath, `${JSON.stringify(runtimePackage, null, 2)}\n`)
}

function copyLockfileForPrune(sourceDir, targetDir) {
  const sourceLockfile = path.join(sourceDir, 'package-lock.json')
  if (fs.existsSync(sourceLockfile)) {
    copyFile(sourceLockfile, path.join(targetDir, 'package-lock.json'))
  }
}

function removePruneMetadata(targetDir) {
  for (const relativePath of ['package-lock.json', path.join('node_modules', '.package-lock.json')]) {
    fs.rmSync(path.join(targetDir, relativePath), { force: true })
  }
}

function removeRuntimeJunk(targetDir) {
  const removals = [
    path.join('node_modules', '.bin', 'prisma'),
    path.join('node_modules', 'prisma'),
    path.join('node_modules', '@prisma', 'engines'),
    path.join('node_modules', 'puppeteer', '.local-chromium'),
  ]

  for (const relativePath of removals) {
    fs.rmSync(path.join(targetDir, relativePath), { recursive: true, force: true })
  }

  for (const packageName of []) {
    for (const relativePath of ['deps', 'src', 'build']) {
      fs.rmSync(path.join(targetDir, 'node_modules', packageName, relativePath), { recursive: true, force: true })
    }
  }

  const prismaRuntimeDir = path.join(targetDir, 'node_modules', '@prisma', 'client', 'runtime')
  if (fs.existsSync(prismaRuntimeDir)) {
    for (const entry of fs.readdirSync(prismaRuntimeDir)) {
      if (/(postgresql|mysql|sqlserver|cockroachdb|mongodb)/i.test(entry)) {
        fs.rmSync(path.join(prismaRuntimeDir, entry), { force: true })
      }
    }
  }
}

function copyServiceNodeModules(sourceDir, targetDir) {
  const sourceNodeModules = path.join(sourceDir, 'node_modules')

  if (!fs.existsSync(sourceNodeModules)) {
    throw new Error(`Missing node_modules for ${sourceDir}. Install dependencies before packaging.`)
  }

  copyTree(sourceNodeModules, path.join(targetDir, 'node_modules'), {
    filter(filePath) {
      return !isJunkPath(filePath) && shouldKeepPrismaEngine(filePath)
    },
  })
}

function pruneProductionDependencies(targetDir) {
  const result = spawnSync('npm', ['prune', '--omit=dev', '--ignore-scripts'], {
    cwd: targetDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  })

  if (result.status !== 0) {
    throw new Error(`npm prune failed in ${targetDir}`)
  }

  removePruneMetadata(targetDir)
  removeRuntimeJunk(targetDir)
}

function stageBackend() {
  const source = path.join(appRoot, 'backend')
  const target = path.join(stageRoot, 'backend')

  writeRuntimePackage(path.join(source, 'package.json'), path.join(target, 'package.json'), {
    omitDependencies: ['prisma', 'react-router-dom'],
  })
  copyLockfileForPrune(source, target)

  for (const item of ['index.js', 'app.js', 'auth.js', 'config', 'db', 'routes', 'subscription', 'sync', 'utils', 'sql', '.env']) {
    copyTree(path.join(source, item), path.join(target, item), {
      filter(filePath) {
        return !isJunkPath(filePath)
      },
    })
  }

  fs.mkdirSync(path.join(target, 'prisma'), { recursive: true })
  copyFile(path.join(source, 'prisma', 'build.db'), path.join(target, 'prisma', 'build.db'))
  copyServiceNodeModules(source, target)
  pruneProductionDependencies(target)
}

function stageAiBackend() {
  const source = path.join(workspaceRoot, 'ai-backend')
  const target = path.join(stageRoot, 'ai-backend')

  writeRuntimePackage(path.join(source, 'package.json'), path.join(target, 'package.json'))
  copyLockfileForPrune(source, target)

  for (const item of ['index.js', 'controllers', 'models', 'routes', '.env']) {
    copyTree(path.join(source, item), path.join(target, item), {
      filter(filePath) {
        return !isJunkPath(filePath)
      },
    })
  }

  copyServiceNodeModules(source, target)
  pruneProductionDependencies(target)
}

function stageUpiPay() {
  const source = path.join(workspaceRoot, 'upi-pay')
  const target = path.join(stageRoot, 'upi-pay')

  writeRuntimePackage(path.join(source, 'package.json'), path.join(target, 'package.json'))
  copyLockfileForPrune(source, target)

  for (const item of ['server.js', 'emailWatcher.js', 'verification.js', 'public', '.env']) {
    copyTree(path.join(source, item), path.join(target, item), {
      filter(filePath) {
        const lower = path.basename(filePath).toLowerCase()
        return !isJunkPath(filePath) && !lower.endsWith('.test.js')
      },
    })
  }

  copyServiceNodeModules(source, target)
  pruneProductionDependencies(target)
}

export default async function preparePackagedServices() {
  fs.rmSync(stageRoot, { recursive: true, force: true })
  fs.mkdirSync(stageRoot, { recursive: true })

  stageBackend()
  stageAiBackend()
  stageUpiPay()

  console.log(`[prepare-packaged-services] staged production services in ${stageRoot}`)
}

if (process.argv[1] === __filename) {
  await preparePackagedServices()
}
