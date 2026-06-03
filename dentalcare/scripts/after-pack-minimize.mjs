import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const removableDirectoryNames = new Set([
  '.cache',
  '.github',
  '.git',
  '__pycache__',
  '__tests__',
  'coverage',
  'docs',
  'examples',
  'screenshots',
  'test',
  'tests',
])

const removableFilePatterns = [
  /^readme/i,
  /\.d\.ts$/i,
  /\.log$/i,
  /\.map$/i,
  /\.md$/i,
  /\.pyc$/i,
  /\.ts$/i,
  /\.tsx$/i,
]

function walk(root, visitor) {
  if (!fs.existsSync(root)) {
    return
  }

  const stats = fs.lstatSync(root)
  visitor(root, stats)

  if (!stats.isDirectory()) {
    return
  }

  for (const entry of fs.readdirSync(root)) {
    walk(path.join(root, entry), visitor)
  }
}

function removePath(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true })
}

function removeJunk(appOutDir) {
  const pathsToRemove = []

  walk(appOutDir, (entryPath, stats) => {
    const base = path.basename(entryPath)
    const lower = base.toLowerCase()

    if (base === '.DS_Store' || lower.startsWith('.env')) {
      pathsToRemove.push(entryPath)
      return
    }

    if (stats.isDirectory() && removableDirectoryNames.has(base)) {
      pathsToRemove.push(entryPath)
      return
    }

    if (stats.isFile() && removableFilePatterns.some((pattern) => pattern.test(base))) {
      pathsToRemove.push(entryPath)
    }
  })

  for (const entryPath of pathsToRemove.sort((a, b) => b.length - a.length)) {
    removePath(entryPath)
  }
}

function removeExtraLocales(appOutDir) {
  const allowedLocales = new Set(['en-US.pak', 'en.pak'])
  const localeDirs = []

  walk(appOutDir, (entryPath, stats) => {
    if (stats.isDirectory() && path.basename(entryPath) === 'locales') {
      localeDirs.push(entryPath)
    }
  })

  for (const localeDir of localeDirs) {
    for (const entry of fs.readdirSync(localeDir)) {
      if (!allowedLocales.has(entry)) {
        removePath(path.join(localeDir, entry))
      }
    }
  }
}

function removeDebugSymbols(appOutDir) {
  walk(appOutDir, (entryPath, stats) => {
    if (stats.isDirectory() && entryPath.endsWith('.dSYM')) {
      removePath(entryPath)
    }
  })
}

function removePackagedRuntimeJunk(appOutDir) {
  const resourcesDir = path.join(appOutDir, 'Orisyn.app', 'Contents', 'Resources')
  const directRemovals = [
    path.join(resourcesDir, 'services', 'ai-service', '_internal', 'googleapiclient', 'discovery_cache', 'documents'),
    path.join(resourcesDir, 'services', 'backend', 'node_modules', 'prisma'),
    path.join(resourcesDir, 'services', 'backend', 'node_modules', '@prisma', 'engines'),
    path.join(resourcesDir, 'services', 'backend', 'node_modules', '.bin', 'prisma'),
    path.join(resourcesDir, 'services', 'backend', 'node_modules', 'puppeteer', '.local-chromium'),
    path.join(resourcesDir, 'services', 'backend', 'node_modules', 'sqlite3', 'deps'),
    path.join(resourcesDir, 'services', 'backend', 'node_modules', 'sqlite3', 'src'),
    path.join(resourcesDir, 'services', 'backend', 'node_modules', 'sqlite3', 'build'),
    path.join(resourcesDir, 'services', 'upi-pay', 'node_modules', 'sqlite3', 'deps'),
    path.join(resourcesDir, 'services', 'upi-pay', 'node_modules', 'sqlite3', 'src'),
    path.join(resourcesDir, 'services', 'upi-pay', 'node_modules', 'sqlite3', 'build'),
  ]

  for (const targetPath of directRemovals) {
    removePath(targetPath)
  }
}

function stripMachOBinaries(appOutDir) {
  if (process.platform !== 'darwin') {
    return
  }

  walk(appOutDir, (entryPath, stats) => {
    if (!stats.isFile()) {
      return
    }

    const fileResult = spawnSync('file', ['-b', entryPath], { encoding: 'utf-8' })
    if (fileResult.status !== 0 || !fileResult.stdout.includes('Mach-O')) {
      return
    }

    spawnSync('strip', ['-x', entryPath], { stdio: 'ignore' })
  })
}

export default async function afterPack(context) {
  const appOutDir = context.appOutDir

  removeJunk(appOutDir)
  removePackagedRuntimeJunk(appOutDir)
  removeExtraLocales(appOutDir)
  removeDebugSymbols(appOutDir)
  stripMachOBinaries(appOutDir)

  console.log(`[after-pack-minimize] minimized ${appOutDir}`)
}
