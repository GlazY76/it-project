import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp, createServices } from '../../src/app.js';
import { BACKEND_ROOT, createConfig } from '../../src/config.js';
import { openDatabase } from '../../src/db/connection.js';
import { migrate } from '../../src/db/migrate.js';

export const REAL_DATA_DIR = path.resolve(BACKEND_ROOT, '../data');

/**
 * A fresh app on an in-memory database. migrate() loads the baseline, so every test file starts
 * with the original 24 books and 16 orders. Uploads go to a temporary data folder.
 */
export async function createTestContext({ env = {} } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeshelf-test-'));
  fs.mkdirSync(path.join(dataDir, 'pictures'));
  fs.copyFileSync(
    path.join(REAL_DATA_DIR, 'pictures', 'dracula.jpg'),
    path.join(dataDir, 'pictures', 'dracula.jpg'),
  );

  const config = createConfig({ NODE_ENV: 'test', DATA_DIR: dataDir, ...env });
  const db = openDatabase(':memory:');
  await migrate(db);
  const app = createApp({ db, config });
  const { usersService, authService } = createServices(db, config);
  let userCounter = 0;

  /** Registers a customer through the API; returns `{ user, token, auth }` (auth = headers). */
  async function registerCustomer(overrides = {}) {
    userCounter += 1;
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: `Customer ${userCounter}`,
        email: `customer${userCounter}@example.com`,
        password: 'secret-password',
        ...overrides,
      });
    if (res.status !== 201) throw new Error(`Registration failed: ${JSON.stringify(res.body)}`);
    return { ...res.body, auth: { Authorization: `Bearer ${res.body.token}` } };
  }

  /** Inserts an administrator directly (there is no public way to become one). */
  async function createAdmin() {
    userCounter += 1;
    const user = usersService.create({
      name: 'Admin',
      email: `admin${userCounter}@example.com`,
      passwordHash: await authService.hashPassword('admin-password'),
      role: 'admin',
    });
    const token = authService.issueToken(user);
    return { user, token, auth: { Authorization: `Bearer ${token}` } };
  }

  function cleanup() {
    db.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }

  return { app, db, config, dataDir, registerCustomer, createAdmin, cleanup };
}
