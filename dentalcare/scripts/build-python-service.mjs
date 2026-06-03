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
const pyInstallerConfigRoot = path.join(workRoot, 'pyinstaller-config')
const outputFolder = path.join(distRoot, 'ai-service')

function runOrThrow(command, args, cwd = workspaceRoot) {
  const printable = [command, ...args].join(' ')
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      PYINSTALLER_CONFIG_DIR: pyInstallerConfigRoot,
    },
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
  const services = [
    { name: 'ai-service', dir: aiServiceRoot, entry: path.join(aiServiceRoot, 'run_server.py') },
    { name: 'flask-backend', dir: path.join(workspaceRoot, 'flask-backend'), entry: path.join(workspaceRoot, 'flask-backend', 'run.py') },
    { name: 'whatsapp', dir: path.join(workspaceRoot, 'whatsapp'), entry: path.join(workspaceRoot, 'whatsapp', 'whatsapp.py') }
  ]

  for (const svc of services) {
    if (!fs.existsSync(svc.entry)) {
      throw new Error(`Missing entrypoint for ${svc.name}: ${svc.entry}`)
    }
  }
}

function main() {
  ensureBuildInputs()

  const python = resolvePythonBinary()

  runOrThrow(python, ['-m', 'pip', 'install', '--upgrade', 'pip'])
  runOrThrow(python, ['-m', 'pip', 'install', '-r', path.join(aiServiceRoot, 'requirements.txt'), 'pyinstaller'])
  runOrThrow(python, ['-m', 'pip', 'install', '-r', path.join(workspaceRoot, 'flask-backend', 'requirements.txt')])
  
  const services = [
    { name: 'ai-service', dir: aiServiceRoot, entry: path.join(aiServiceRoot, 'run_server.py') },
    { name: 'flask-backend', dir: path.join(workspaceRoot, 'flask-backend'), entry: path.join(workspaceRoot, 'flask-backend', 'run.py') },
    { name: 'whatsapp', dir: path.join(workspaceRoot, 'whatsapp'), entry: path.join(workspaceRoot, 'whatsapp', 'whatsapp.py') }
  ]

  for (const svc of services) {
    const distRoot = path.join(svc.dir, 'dist')
    const workRoot = path.join(svc.dir, 'build')
    const specRoot = path.join(workRoot, 'spec')
    const pyInstallerConfigRoot = path.join(workRoot, 'pyinstaller-config')
    const outputFolder = path.join(distRoot, svc.name)

    fs.rmSync(outputFolder, { recursive: true, force: true })
    fs.mkdirSync(specRoot, { recursive: true })
    fs.mkdirSync(pyInstallerConfigRoot, { recursive: true })

    const envFile = path.join(svc.dir, '.env')
    const pyInstallerArgs = [
      '-m', 'PyInstaller',
      '--noconfirm', '--clean',
      '--name', svc.name,
      '--distpath', distRoot,
      '--workpath', workRoot,
      '--specpath', specRoot,
      '--hidden-import', 'uvicorn.logging',
      '--hidden-import', 'uvicorn.loops.auto',
      '--hidden-import', 'uvicorn.protocols.http.auto',
      '--hidden-import', 'uvicorn.protocols.websockets.auto',
      '--hidden-import', 'uvicorn.lifespan.on',
      '--hidden-import', 'uvicorn.lifespan.off',
      '--strip',
      '--exclude-module', 'tkinter',
      '--exclude-module', 'pytest',
      '--exclude-module', 'unittest',
      svc.entry
    ]

    if (fs.existsSync(envFile)) {
      pyInstallerArgs.splice(pyInstallerArgs.length - 1, 0, '--add-data', `${envFile}${path.delimiter}.`)
    }

    runOrThrow(python, pyInstallerArgs, svc.dir)

    const executable = path.join(outputFolder, process.platform === 'win32' ? `${svc.name}.exe` : svc.name)
    if (fs.existsSync(executable) && process.platform !== 'win32') {
      fs.chmodSync(executable, 0o755)
    }

    console.log(`Built ${svc.name} bundle at ${outputFolder}`)
  }
}

main()
