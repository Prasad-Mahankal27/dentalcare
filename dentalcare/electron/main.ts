import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { spawn, type ChildProcess } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
const WORKSPACE_ROOT = path.resolve(process.env.APP_ROOT, '..')
const STARTUP_TIMEOUT_MS = 45_000
const AUTO_UPDATE_INTERVAL_MS = 30 * 60 * 1000
const serviceProcesses: Array<{ name: string; process: ChildProcess }> = []
let autoUpdateTimer: NodeJS.Timeout | null = null

interface AutoUpdateStatusPayload {
  status: string
  version?: string
  percent?: number
  message?: string
}

let latestAutoUpdateStatus: AutoUpdateStatusPayload = app.isPackaged
  ? { status: 'idle' }
  : { status: 'disabled', message: 'Auto updates are available only in installed builds.' }

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function ensureDirectory(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function toSqliteUrl(filePath: string) {
  const normalized = filePath.replace(/\\/g, '/')
  return process.platform === 'win32' ? `file:/${normalized}` : `file:${normalized}`
}

function copyIfMissing(sourcePath: string, targetPath: string) {
  if (fs.existsSync(targetPath) || !fs.existsSync(sourcePath)) {
    return
  }

  ensureDirectory(path.dirname(targetPath))
  fs.copyFileSync(sourcePath, targetPath)
}

function ensureFile(filePath: string) {
  if (fs.existsSync(filePath)) {
    return
  }

  ensureDirectory(path.dirname(filePath))
  fs.closeSync(fs.openSync(filePath, 'a'))
}

function attachServiceLogs(name: string, child: ChildProcess) {
  child.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString().trimEnd()
    if (text) {
      console.log(`[${name}] ${text}`)
    }
  })

  child.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString().trimEnd()
    if (text) {
      console.error(`[${name}] ${text}`)
    }
  })

  child.on('exit', (code, signal) => {
    console.log(`[${name}] exited with code=${code ?? 'null'} signal=${signal ?? 'null'}`)
  })
}

function registerService(name: string, child: ChildProcess) {
  serviceProcesses.push({ name, process: child })
  attachServiceLogs(name, child)
}

function resolvePythonDevBinary() {
  if (process.env.PYTHON_BIN) {
    return process.env.PYTHON_BIN
  }

  const candidates = [
    path.join(WORKSPACE_ROOT, 'dental', 'bin', 'python'),
    path.join(WORKSPACE_ROOT, 'dental', 'Scripts', 'python.exe'),
  ]

  const found = candidates.find((candidate) => fs.existsSync(candidate))
  if (found) {
    return found
  }

  return process.platform === 'win32' ? 'python' : 'python3'
}

function spawnNodeService(name: string, scriptPath: string, cwd: string, extraEnv: Record<string, string> = {}) {
  const child = spawn(process.execPath, [scriptPath], {
    cwd,
    env: {
      ...process.env,
      ...extraEnv,
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: 'pipe',
    windowsHide: true,
  })

  registerService(name, child)
}

function spawnPythonService(aiServiceDir: string, writableAudioDir: string) {
  ensureDirectory(writableAudioDir)

  const sharedEnv = {
    ...process.env,
    AI_SERVICE_HOST: '127.0.0.1',
    AI_SERVICE_PORT: '8000',
    AI_RECORDING_PATH: path.join(writableAudioDir, 'recording.wav'),
  }

  if (app.isPackaged) {
    const executableName = process.platform === 'win32' ? 'ai-service.exe' : 'ai-service'
    const executablePath = path.join(aiServiceDir, executableName)

    if (!fs.existsSync(executablePath)) {
      throw new Error(`Bundled AI service executable not found: ${executablePath}`)
    }

    const child = spawn(executablePath, [], {
      cwd: aiServiceDir,
      env: sharedEnv,
      stdio: 'pipe',
      windowsHide: true,
    })

    registerService('ai-service', child)
    return
  }

  const pythonBinary = resolvePythonDevBinary()
  const devAiServiceDir = path.join(WORKSPACE_ROOT, 'ai-service')
  const child = spawn(pythonBinary, ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'], {
    cwd: devAiServiceDir,
    env: sharedEnv,
    stdio: 'pipe',
    windowsHide: true,
  })

  registerService('ai-service', child)
}

async function waitForService(url: string, serviceName: string) {
  const started = Date.now()

  while (Date.now() - started < STARTUP_TIMEOUT_MS) {
    try {
      const response = await fetch(url)
      if (response.ok || response.status === 404) {
        return
      }
    } catch {
      // Service is still booting.
    }

    await sleep(600)
  }

  throw new Error(`${serviceName} did not become ready within ${STARTUP_TIMEOUT_MS}ms (${url})`)
}

function resolveServiceDirectories() {
  if (app.isPackaged) {
    const servicesRoot = path.join(process.resourcesPath, 'services')
    return {
      backend: path.join(servicesRoot, 'backend'),
      aiBackend: path.join(servicesRoot, 'ai-backend'),
      upiPay: path.join(servicesRoot, 'upi-pay'),
      aiService: path.join(servicesRoot, 'ai-service'),
    }
  }

  return {
    backend: path.join(process.env.APP_ROOT, 'backend'),
    aiBackend: path.join(WORKSPACE_ROOT, 'ai-backend'),
    upiPay: path.join(WORKSPACE_ROOT, 'upi-pay'),
    aiService: path.join(WORKSPACE_ROOT, 'ai-service'),
  }
}

async function startLocalServices() {
  const serviceDirs = resolveServiceDirectories()
  const runtimeRoot = path.join(app.getPath('userData'), 'runtime-data')

  const backendDataDir = path.join(runtimeRoot, 'backend')
  const upiDataDir = path.join(runtimeRoot, 'upi-pay')
  const aiDataDir = path.join(runtimeRoot, 'ai-service')

  ensureDirectory(backendDataDir)
  ensureDirectory(upiDataDir)
  ensureDirectory(aiDataDir)

  const backendDbPath = path.join(backendDataDir, 'dev.db')
  copyIfMissing(path.join(serviceDirs.backend, 'prisma', 'dev.db'), backendDbPath)
  copyIfMissing(path.join(serviceDirs.backend, 'dev.db'), backendDbPath)
  ensureFile(backendDbPath)

  spawnNodeService('backend', path.join(serviceDirs.backend, 'index.js'), serviceDirs.backend, {
    DATABASE_URL: toSqliteUrl(backendDbPath),
  })

  spawnNodeService('ai-backend', path.join(serviceDirs.aiBackend, 'index.js'), serviceDirs.aiBackend)
  spawnNodeService('upi-pay', path.join(serviceDirs.upiPay, 'server.js'), serviceDirs.upiPay, {
    PAYMENTS_DB_PATH: path.join(upiDataDir, 'payments.db'),
  })
  spawnPythonService(serviceDirs.aiService, aiDataDir)

  await Promise.all([
    waitForService('http://127.0.0.1:4000/health', 'backend'),
    waitForService('http://127.0.0.1:3000/health', 'ai-backend'),
    waitForService('http://127.0.0.1:3002/status/__health__', 'upi-pay'),
    waitForService('http://127.0.0.1:8000/health', 'ai-service'),
  ])
}

function stopLocalServices() {
  for (const service of serviceProcesses) {
    const pid = service.process.pid
    if (!pid || service.process.killed) {
      continue
    }

    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { windowsHide: true })
      continue
    }

    service.process.kill('SIGTERM')
  }
}

function emitAutoUpdateStatus(status: string, meta: Record<string, unknown> = {}) {
  latestAutoUpdateStatus = {
    status,
    ...meta,
  }

  win?.webContents.send('auto-update-status', latestAutoUpdateStatus)
}

async function checkForUpdatesNow() {
  if (!app.isPackaged) {
    const message = 'Auto updates are available only in installed builds.'
    emitAutoUpdateStatus('disabled', { message })
    return { ok: false, message }
  }

  try {
    await autoUpdater.checkForUpdatesAndNotify()
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[auto-update] manual check failed', message)
    emitAutoUpdateStatus('error', { message })
    return { ok: false, message }
  }
}

function registerIpcHandlers() {
  ipcMain.handle('app:get-version', () => app.getVersion())
  ipcMain.handle('updater:get-status', () => latestAutoUpdateStatus)
  ipcMain.handle('updater:check', async () => checkForUpdatesNow())
}

function stopAutoUpdates() {
  if (autoUpdateTimer) {
    clearInterval(autoUpdateTimer)
    autoUpdateTimer = null
  }

  autoUpdater.removeAllListeners()
}

function startAutoUpdates() {
  if (!app.isPackaged) {
    console.log('[auto-update] skipped in development mode')
    emitAutoUpdateStatus('disabled', { message: 'Auto updates are available only in installed builds.' })
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    console.log('[auto-update] checking for updates')
    emitAutoUpdateStatus('checking')
  })

  autoUpdater.on('update-available', (info) => {
    console.log(`[auto-update] update available: ${info.version}`)
    emitAutoUpdateStatus('available', { version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[auto-update] no updates available')
    emitAutoUpdateStatus('not-available')
  })

  autoUpdater.on('download-progress', (progress) => {
    emitAutoUpdateStatus('downloading', { percent: progress.percent })
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[auto-update] update downloaded: ${info.version}. Installing now.`)
    emitAutoUpdateStatus('downloaded', { version: info.version })
    autoUpdater.quitAndInstall(false, true)
  })

  autoUpdater.on('error', (error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[auto-update] error', message)
    emitAutoUpdateStatus('error', { message })
  })

  const checkNow = async () => {
    await checkForUpdatesNow()
  }

  void checkNow()
  autoUpdateTimer = setInterval(() => {
    void checkNow()
  }, AUTO_UPDATE_INTERVAL_MS)
}

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'Orisyn_logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('before-quit', () => {
  stopAutoUpdates()
  stopLocalServices()
})

app.whenReady().then(async () => {
  try {
    registerIpcHandlers()
    await startLocalServices()
    createWindow()
    startAutoUpdates()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown startup error'
    console.error('[startup] failed to initialize local services', error)
    dialog.showErrorBox('Service Startup Failed', `Unable to start bundled services.\n\n${message}`)
    app.quit()
  }
})
