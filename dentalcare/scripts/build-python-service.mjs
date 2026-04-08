import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const appRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(appRoot, '..')
const aiServiceRoot = path.join(workspaceRoot, 'ai-service')

const entryScript = path.join(aiServiceRoot, 'run_server.py')
const distRoot = path.join(aiServiceRoot, 'dist')
const workRoot = path.join(aiServiceRoot, 'build')
const specRoot = path.join(workRoot, 'spec')
const outputFolder = path.join(distRoot, 'ai-service')

function runOrThrow(command, args, cwd = workspaceRoot) {
  const printable = [command, ...args].join(' ')
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${printable}`)
  }
}

function resolvePythonBinary() {
  if (process.env.PYTHON_BIN) {
    return process.env.PYTHON_BIN
  }

  const candidates = [
    path.join(workspaceRoot, 'dental', 'bin', 'python'),
    path.join(workspaceRoot, 'dental', 'Scripts', 'python.exe'),
    process.platform === 'win32' ? 'python' : 'python3',
    'python',
  ]

  for (const candidate of candidates) {
    if (candidate.includes(path.sep) && !fs.existsSync(candidate)) {
      continue
    }

    const check = spawnSync(candidate, ['--version'], {
      cwd: workspaceRoot,
      stdio: 'ignore',
      env: process.env,
    })

    if (!check.error && check.status === 0) {
      return candidate
    }
  }

  throw new Error('No Python executable found. Set PYTHON_BIN to a valid interpreter path.')
}

function ensureBuildInputs() {
  if (!fs.existsSync(entryScript)) {
    throw new Error(`Missing AI entrypoint: ${entryScript}`)
  }

  if (!fs.existsSync(path.join(aiServiceRoot, 'requirements.txt'))) {
    throw new Error(`Missing requirements.txt in ${aiServiceRoot}`)
  }
}

function copyEnvIfPresent() {
  const envPath = path.join(aiServiceRoot, '.env')
  const packagedEnvPath = path.join(outputFolder, '.env')

  if (!fs.existsSync(envPath)) {
    return
  }

  fs.copyFileSync(envPath, packagedEnvPath)
}

function main() {
  ensureBuildInputs()

  const python = resolvePythonBinary()
  const addDataSeparator = process.platform === 'win32' ? ';' : ':'

  fs.rmSync(outputFolder, { recursive: true, force: true })
  fs.mkdirSync(specRoot, { recursive: true })

  runOrThrow(python, ['-m', 'pip', 'install', '--upgrade', 'pip'])
  runOrThrow(python, ['-m', 'pip', 'install', '-r', path.join(aiServiceRoot, 'requirements.txt'), 'pyinstaller'])

  const pyInstallerArgs = [
    '-m',
    'PyInstaller',
    '--noconfirm',
    '--clean',
    '--name',
    'ai-service',
    '--distpath',
    distRoot,
    '--workpath',
    workRoot,
    '--specpath',
    specRoot,
    '--collect-all',
    'google.generativeai',
    '--hidden-import',
    'uvicorn.logging',
    '--hidden-import',
    'uvicorn.loops.auto',
    '--hidden-import',
    'uvicorn.protocols.http.auto',
    '--hidden-import',
    'uvicorn.protocols.websockets.auto',
    '--hidden-import',
    'uvicorn.lifespan.on',
    '--hidden-import',
    'uvicorn.lifespan.off',
  ]

  const envPath = path.join(aiServiceRoot, '.env')
  if (fs.existsSync(envPath)) {
    pyInstallerArgs.push('--add-data', `${envPath}${addDataSeparator}.`)
  }

  pyInstallerArgs.push(entryScript)
  runOrThrow(python, pyInstallerArgs, aiServiceRoot)

  copyEnvIfPresent()

  const executable = path.join(
    outputFolder,
    process.platform === 'win32' ? 'ai-service.exe' : 'ai-service',
  )
  if (fs.existsSync(executable) && process.platform !== 'win32') {
    fs.chmodSync(executable, 0o755)
  }

  console.log(`Built AI service bundle at ${outputFolder}`)
}

main()
