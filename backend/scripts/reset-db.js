// Deletes the database and rebuilds it from the baseline (original data) plus all migrations.
// Usage: stop the server, then run `npm run db:reset -- --yes`
import fs from 'node:fs';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';

const config = loadConfig();

if (!process.argv.includes('--yes')) {
  console.log(`This deletes ${config.dbPath} with all users, carts and new orders,`);
  console.log('then rebuilds it with the original 24 books and 16 orders.');
  console.log('Stop the server first, then run: npm run db:reset -- --yes');
  process.exit(1);
}

for (const suffix of ['', '-journal', '-wal', '-shm']) {
  fs.rmSync(`${config.dbPath}${suffix}`, { force: true });
}

const db = openDatabase(config.dbPath);
const { version } = await migrate(db, { log: (message) => console.log(`[db] ${message}`) });
db.close();
console.log(`${config.dbPath} rebuilt (version ${version})`);
