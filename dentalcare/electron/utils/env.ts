import fs from 'node:fs';
import dotenv from 'dotenv';
import log from 'electron-log';
import { getEnvPath } from './paths';

export interface AppEnvConfig {
  [key: string]: string | undefined;
}

let envConfig: AppEnvConfig = {};

export function loadEnvironment(): AppEnvConfig {
  const envPath = getEnvPath();

  if (fs.existsSync(envPath)) {
    log.info(`Loading environment variables from: ${envPath}`);
    const result = dotenv.config({ path: envPath });
    
    if (result.error) {
      log.error(`Failed to parse .env file at ${envPath}:`, result.error);
    } else {
      envConfig = { ...result.parsed, ...process.env };
      log.info(`Successfully loaded environment configuration.`);
    }
  } else {
    log.warn(`Environment file not found at: ${envPath}. Relying on system environment variables.`);
    envConfig = { ...process.env };
  }

  // Debugging critical keys without leaking secrets fully
  validateEnvKey('SUPABASE_URL');
  validateEnvKey('SUPABASE_SERVICE_ROLE_KEY');
  validateEnvKey('DATABASE_URL');

  return envConfig;
}

function validateEnvKey(key: string) {
  if (envConfig[key]) {
    log.info(`[ENV] ${key} is securely loaded.`);
  } else {
    log.warn(`[ENV] WARNING: ${key} is missing from the environment configuration!`);
  }
}

export function getEnv(): AppEnvConfig {
  return envConfig;
}
