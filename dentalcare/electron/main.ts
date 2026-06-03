import { app, BrowserWindow, dialog, ipcMain, systemPreferences } from 'electron'
import { autoUpdater } from 'electron-updater'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { spawn, type ChildProcess } from 'node:child_process'
import log from 'electron-log'
import { loadEnvironment, getEnv } from './utils/env'
import { getServiceDir, getRuntimeDataDir, isPackaged, APP_ROOT, WORKSPACE_ROOT, getServicesRoot } from './utils/paths'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
process.env.APP_ROOT = APP_ROOT

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let isAppReady = false
const STARTUP_TIMEOUT_MS = 45_000
const AUTO_UPDATE_INTERVAL_MS = 30 * 60 * 1000
const serviceProcesses: Array<{ name: string; process: ChildProcess }> = []
let autoUpdateTimer: NodeJS.Timeout | null = null
const startupWarnings: string[] = []

interface AutoUpdateStatusPayload {
  status: string
  version?: string
  percent?: number
  message?: string
}

interface MediaPermissionStatusPayload {
  granted: boolean
  status: string
  message?: string
}

let latestAutoUpdateStatus: AutoUpdateStatusPayload = isPackaged
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
      log.info(`[${name}] ${text}`)
    }
  })

  child.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString().trimEnd()
    if (text) {
      log.error(`[${name}] ${text}`)
    }
  })

  child.on('exit', (code, signal) => {
    log.info(`[${name}] exited with code=${code ?? 'null'} signal=${signal ?? 'null'}`)
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

function spawnPythonService(aiServiceDir: string, writableAudioDir: string, envOverrides: Record<string, string> = {}) {
  ensureDirectory(writableAudioDir)

  const sharedEnv = {
    ...process.env,
    ...envOverrides,
    AI_SERVICE_HOST: '127.0.0.1',
    AI_SERVICE_PORT: '8000',
    AI_RECORDING_PATH: path.join(writableAudioDir, 'recording.wav'),
  }

  if (isPackaged) {
    const executableName = process.platform === 'win32' ? 'ai-service.exe' : 'ai-service'
    const executablePath = path.join(aiServiceDir, executableName)

    if (!fs.existsSync(executablePath)) {
      throw new Error(`Bundled AI service executable not found: ${executablePath}`)
    }

    try {
      if (process.platform !== 'win32') {
        fs.chmodSync(executablePath, 0o755)
      }
    } catch (e) {
      log.warn(`Failed to chmod 755 on ${executablePath}: ${e}`)
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

function spawnFlaskBackendService(dir: string, dataDir: string, envOverrides: Record<string, string> = {}) {
  ensureDirectory(dataDir)
  const sharedEnv = {
    ...process.env,
    ...envOverrides,
    FLASK_ENV: "development",
    FLASK_DEBUG: "1",
    FLASK_SECRET_KEY: envOverrides.FLASK_SECRET_KEY || "replace-with-a-long-random-value",
    HOST: "127.0.0.1",
    PORT: "5001"
  }

  if (isPackaged) {
    const preferredExecutableName = process.platform === 'win32' ? 'flask-backend.exe' : 'flask-backend'
    const fallbackExecutableName = process.platform === 'win32' ? 'flask-backend' : 'flask-backend.exe'
    const preferredExecutablePath = path.join(dir, preferredExecutableName)
    const fallbackExecutablePath = path.join(dir, fallbackExecutableName)
    const executablePath = fs.existsSync(preferredExecutablePath) ? preferredExecutablePath : fs.existsSync(fallbackExecutablePath) ? fallbackExecutablePath : null

    if (!executablePath) throw new Error(`Bundled flask-backend executable not found at ${dir}.`)

    try {
      if (process.platform !== 'win32') fs.chmodSync(executablePath, 0o755)
    } catch (e) {
      log.warn(`Failed to chmod 755 on ${executablePath}: ${e}`)
    }

    const child = spawn(executablePath, [], { cwd: dir, env: sharedEnv, stdio: 'pipe', windowsHide: true })
    registerService('flask-backend', child)
    return
  }

  const pythonBinary = resolvePythonDevBinary()
  const child = spawn(pythonBinary, ['run.py'], { cwd: dir, env: sharedEnv, stdio: 'pipe', windowsHide: true })
  registerService('flask-backend', child)
}

function spawnWhatsappService(dir: string, dataDir: string, envOverrides: Record<string, string> = {}) {
  ensureDirectory(dataDir)
  const sharedEnv = {
    ...process.env,
    ...envOverrides
  }

  if (isPackaged) {
    const preferredExecutableName = process.platform === 'win32' ? 'whatsapp.exe' : 'whatsapp'
    const fallbackExecutableName = process.platform === 'win32' ? 'whatsapp' : 'whatsapp.exe'
    const preferredExecutablePath = path.join(dir, preferredExecutableName)
    const fallbackExecutablePath = path.join(dir, fallbackExecutableName)
    const executablePath = fs.existsSync(preferredExecutablePath) ? preferredExecutablePath : fs.existsSync(fallbackExecutablePath) ? fallbackExecutablePath : null

    if (!executablePath) throw new Error(`Bundled whatsapp executable not found at ${dir}.`)

    try {
      if (process.platform !== 'win32') fs.chmodSync(executablePath, 0o755)
    } catch (e) {
      log.warn(`Failed to chmod 755 on ${executablePath}: ${e}`)
    }

    const child = spawn(executablePath, [], { cwd: dir, env: sharedEnv, stdio: 'pipe', windowsHide: true })
    registerService('whatsapp', child)
    return
  }

  const pythonBinary = resolvePythonDevBinary()
  const child = spawn(pythonBinary, ['whatsapp.py'], { cwd: dir, env: sharedEnv, stdio: 'pipe', windowsHide: true })
  registerService('whatsapp', child)
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

function warnStartup(message: string) {
  startupWarnings.push(message)
  log.warn(`[startup] ${message}`)
}

async function waitForOptionalService(url: string, serviceName: string) {
  try {
    await waitForService(url, serviceName)
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    warnStartup(`${serviceName} is unavailable. Related features may be limited. ${message}`)
    return false
  }
}

async function startLocalServices() {
  const envConf = getEnv()

  const backendDir = getServiceDir('backend')
  const aiBackendDir = getServiceDir('ai-backend')
  const upiPayDir = getServiceDir('upi-pay')

  const backendDataDir = getRuntimeDataDir('backend')
  const upiDataDir = getRuntimeDataDir('upi-pay')

  ensureDirectory(backendDataDir)
  ensureDirectory(upiDataDir)

  const backendDbPath = path.join(backendDataDir, 'dev.db')
  copyIfMissing(path.join(backendDir, 'prisma', 'dev.db'), backendDbPath)
  copyIfMissing(path.join(backendDir, 'dev.db'), backendDbPath)
  ensureFile(backendDbPath)

  spawnNodeService('backend', path.join(backendDir, 'index.js'), backendDir, {
    DATABASE_URL: toSqliteUrl(backendDbPath),
    SMTP_HOST: envConf.SMTP_HOST || '',
    SMTP_PORT: envConf.SMTP_PORT || '',
    SMTP_SECURE: envConf.SMTP_SECURE || '',
    SMTP_USER: envConf.SMTP_USER || '',
    SMTP_PASS: envConf.SMTP_PASS || '',
    PORT: envConf.PORT || '4000',
    WHATSAPP_BOOKING_SECRET: envConf.WHATSAPP_BOOKING_SECRET || '',
    GH_TOKEN: envConf.GH_TOKEN || '',
    JWT_SECRET: envConf.JWT_SECRET || '',
    SUPABASE_URL: envConf.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: envConf.SUPABASE_ANON_KEY || '',
    SUPABASE_SERVICE_ROLE_KEY: envConf.SUPABASE_SERVICE_ROLE_KEY || '',
    SYNC_ENABLED: envConf.SYNC_ENABLED || 'true'
  })

  spawnNodeService('ai-backend', path.join(aiBackendDir, 'index.js'), aiBackendDir, {
    MONGO_URL: envConf.MONGO_URL || '',
    GEMINI_API_KEY: envConf.GEMINI_API_KEY || '',
    GROQ_API_KEY: envConf.GROQ_API_KEY || '',
    GROQ_MODEL: envConf.GROQ_MODEL || '',
    PORT: '3000',
    DEEPGRAM_API_KEY: envConf.DEEPGRAM_API_KEY || ''
  })

  let upiSpawned = false
  try {
    spawnNodeService('upi-pay', path.join(upiPayDir, 'server.js'), upiPayDir, {
      PAYMENTS_DB_PATH: path.join(upiDataDir, 'payments.db'),
      EMAIL_USER: envConf.EMAIL_USER || '',
      EMAIL_PASS: envConf.EMAIL_PASS || '',
      UPI_ID: envConf.UPI_ID || '',
      UPI_NAME: envConf.UPI_NAME || ''
    })
    upiSpawned = true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    warnStartup(`upi-pay failed to start. Payment verification will be unavailable. ${message}`)
  }

  const serviceChecks: Promise<void>[] = [
    waitForService('http://127.0.0.1:4000/health', 'backend'),
    waitForService('http://127.0.0.1:3000/health', 'ai-backend'),
  ]

  if (upiSpawned) {
    serviceChecks.push(waitForOptionalService('http://127.0.0.1:3002/status/__health__', 'upi-pay').then(() => undefined))
  }

  await Promise.all(serviceChecks)
}

async function showStartupWarningsIfAny() {
  if (startupWarnings.length === 0 || !win) {
    return
  }

  const detail = startupWarnings.join('\n')
  startupWarnings.length = 0

  await dialog.showMessageBox(win, {
    type: 'warning',
    title: 'Limited Functionality',
    message: 'Some optional services could not be started.',
    detail,
    buttons: ['OK'],
  })
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
  if (!isPackaged) {
    const message = 'Auto updates are available only in installed builds.'
    emitAutoUpdateStatus('disabled', { message })
    return { ok: false, message }
  }

  try {
    await autoUpdater.checkForUpdatesAndNotify()
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.error('[auto-update] manual check failed', message)
    emitAutoUpdateStatus('error', { message })
    return { ok: false, message }
  }
}

function getMicrophoneAccessStatus(): MediaPermissionStatusPayload {
  if (process.platform !== 'darwin') {
    return { granted: true, status: 'not-required' }
  }

  const status = systemPreferences.getMediaAccessStatus('microphone')
  return {
    granted: status === 'granted',
    status,
  }
}

async function requestMicrophoneAccess(): Promise<MediaPermissionStatusPayload> {
  if (process.platform !== 'darwin') {
    return { granted: true, status: 'not-required' }
  }

  const currentStatus = systemPreferences.getMediaAccessStatus('microphone')
  if (currentStatus === 'granted') {
    return { granted: true, status: currentStatus }
  }

  try {
    const granted = await systemPreferences.askForMediaAccess('microphone')
    const updatedStatus = systemPreferences.getMediaAccessStatus('microphone')

    if (granted || updatedStatus === 'granted') {
      return { granted: true, status: updatedStatus }
    }

    const blocked = updatedStatus === 'denied' || updatedStatus === 'restricted'
    return {
      granted: false,
      status: updatedStatus,
      message: blocked
        ? 'Microphone access is blocked. Enable it in System Settings > Privacy & Security > Microphone.'
        : 'Microphone access was not granted.',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      granted: false,
      status: 'error',
      message: `Unable to request microphone access. ${message}`,
    }
  }
}

function registerIpcHandlers() {
  ipcMain.handle('app:get-version', () => app.getVersion())
  ipcMain.handle('updater:get-status', () => latestAutoUpdateStatus)
  ipcMain.handle('updater:check', async () => checkForUpdatesNow())
  ipcMain.handle('media:get-microphone-access', () => getMicrophoneAccessStatus())
  ipcMain.handle('media:request-microphone-access', async () => requestMicrophoneAccess())
}

function stopAutoUpdates() {
  if (autoUpdateTimer) {
    clearInterval(autoUpdateTimer)
    autoUpdateTimer = null
  }
  autoUpdater.removeAllListeners()
}

function startAutoUpdates() {
  if (!isPackaged) {
    log.info('[auto-update] skipped in development mode')
    emitAutoUpdateStatus('disabled', { message: 'Auto updates are available only in installed builds.' })
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    log.info('[auto-update] checking for updates')
    emitAutoUpdateStatus('checking')
  })

  autoUpdater.on('update-available', (info) => {
    log.info(`[auto-update] update available: ${info.version}`)
    emitAutoUpdateStatus('available', { version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    log.info('[auto-update] no updates available')
    emitAutoUpdateStatus('not-available')
  })

  autoUpdater.on('download-progress', (progress) => {
    emitAutoUpdateStatus('downloading', { percent: progress.percent })
  })

  autoUpdater.on('update-downloaded', (info) => {
    log.info(`[auto-update] update downloaded: ${info.version}. Installing now.`)
    emitAutoUpdateStatus('downloaded', { version: info.version })
    autoUpdater.quitAndInstall(false, true)
  })

  autoUpdater.on('error', (error) => {
    const message = error instanceof Error ? error.message : String(error)
    log.error('[auto-update] error', message)
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
    icon: path.join(process.env.VITE_PUBLIC as string, 'Orisyn_logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (isAppReady && BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

function killOrphanedPorts() {
  try {
    log.info('Cleaning configured ports...')
    const ports = [3000, 8000, 4000, 5000, 5001, 5173]
    for (const port of ports) {
      try {
        if (process.platform === 'win32') {
           const out = require('node:child_process').execSync(`netstat -ano | findstr :${port}`).toString()
           const pids = new Set(out.trim().split('\\n').map((l: string) => l.trim().split(/\\s+/).pop()))
           for (const pid of pids) if (pid) require('node:child_process').execSync(`taskkill /F /PID ${pid}`)
        } else {
           const out = require('node:child_process').execSync(`lsof -ti tcp:${port}`).toString()
           const pids = new Set(out.trim().split('\\n').filter((p: string) => p.trim()))
           for (const pid of pids) require('node:child_process').execSync(`kill -9 ${pid}`)
        }
      } catch (e) { /* ignore */ }
    }
  } catch (e) { /* ignore */ }
}

app.on('before-quit', () => {
  isAppReady = false
  stopAutoUpdates()
  stopLocalServices()
  killOrphanedPorts()
})

app.whenReady().then(async () => {
  try {
    log.info('=== Application Starting ===')
    loadEnvironment() // Load .env configuration
    registerIpcHandlers()
    killOrphanedPorts()

    // Set a safety timeout to ensure window opens even if services are slow
    const serviceTimeout = setTimeout(() => {
      if (!isAppReady && !win) {
        log.warn('[startup] services taking too long, creating window anyway')
        createWindow()
        isAppReady = true
      }
    }, 10000)

    try {
      await startLocalServices()
      clearTimeout(serviceTimeout)
    } catch (error) {
      log.error('[startup] service startup error (window will still open):', error)
      clearTimeout(serviceTimeout)
    }

    if (!win) {
      createWindow()
    }

    await showStartupWarningsIfAny()
    startAutoUpdates()
    isAppReady = true
  } catch (error) {
    log.error('[startup] failed to initialize', error)
    if (!win) {
      createWindow()
    }
    isAppReady = true
  }
})
