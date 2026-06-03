import { app } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Determine the environment
export const isPackaged = app.isPackaged;

// Resolve the directory of the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Root paths depending on environment
export const APP_ROOT = path.join(__dirname, '..', '..');
export const WORKSPACE_ROOT = path.resolve(APP_ROOT, '..');

// Services paths
export function getServicesRoot(): string {
  if (isPackaged) {
    return path.join(process.resourcesPath, 'services');
  }
  return WORKSPACE_ROOT;
}

export function getServiceDir(serviceName: string): string {
  if (isPackaged) {
    return path.join(getServicesRoot(), serviceName);
  }
  
  // In dev, backend lives in dentalcare/backend, other services in WORKSPACE_ROOT
  if (serviceName === 'backend') {
    return path.join(APP_ROOT, 'backend');
  }
  return path.join(WORKSPACE_ROOT, serviceName);
}

// Runtime paths for user data
export function getRuntimeDataRoot(): string {
  return path.join(app.getPath('userData'), 'runtime-data');
}

export function getRuntimeDataDir(serviceName: string): string {
  return path.join(getRuntimeDataRoot(), serviceName);
}

// Env path resolver
export function getEnvPath(): string {
  if (isPackaged) {
    return path.join(process.resourcesPath, '.env.production');
  }
  return path.join(APP_ROOT, '.env');
}
