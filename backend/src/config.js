import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Builds the configuration from environment variables; the defaults suit local development. */
export function createConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const dataDir = path.resolve(BACKEND_ROOT, env.DATA_DIR || '../data');
  const dbPath = env.DB_PATH
    ? path.resolve(BACKEND_ROOT, env.DB_PATH)
    : path.join(dataDir, 'shop.db');

  return {
    env: nodeEnv,
    port: Number(env.PORT) || 3000,
    dataDir,
    dbPath,
    // e.g. data/shop.db -> data/shop.original.db, written once before the first migration
    backupPath: path.join(path.dirname(dbPath), `${path.basename(dbPath, '.db')}.original.db`),
    picturesDir: path.join(dataDir, 'pictures'),
    jwt: {
      secret: env.JWT_SECRET || (nodeEnv === 'test' ? 'test-secret' : undefined),
      expiresIn: env.JWT_EXPIRES_IN || '7d',
    },
    bcryptRounds: nodeEnv === 'test' ? 4 : 10,
    corsOrigins: (env.CORS_ORIGIN || 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    currency: env.CURRENCY || 'PLN',
    mockPayments: (env.MOCK_PAYMENTS ?? 'true') === 'true',
    rateLimit: nodeEnv !== 'test',
    logRequests: nodeEnv !== 'test',
  };
}

/** Loads backend/.env (when present) into process.env and returns the configuration. */
export function loadConfig() {
  try {
    process.loadEnvFile(path.join(BACKEND_ROOT, '.env'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return createConfig(process.env);
}

/** The HTTP server cannot issue tokens without a secret, so fail fast with a helpful message. */
export function assertServerConfig(config) {
  if (!config.jwt.secret) {
    throw new Error(
      'JWT_SECRET is not set. Copy backend/.env.example to backend/.env and set a long random secret.',
    );
  }
}
