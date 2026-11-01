import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { backup } from 'node:sqlite';
import { transaction } from './transaction.js';

const dbDir = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(dbDir, 'migrations');
const BASELINE_FILE = path.join(dbDir, 'baseline.sql');

/** Migration files named NNN_description.sql, ordered by their version number NNN. */
export function listMigrations() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => /^\d{3}_[\w-]+\.sql$/.test(file))
    .sort()
    .map((file) => ({
      version: Number(file.slice(0, 3)),
      file,
      sql: fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'),
    }));
}

export function latestVersion() {
  return listMigrations().at(-1)?.version ?? 0;
}

export function currentVersion(db) {
  return db.prepare('PRAGMA user_version').get().user_version;
}

/**
 * Brings the database schema up to date. PRAGMA user_version stores the last applied migration.
 *
 * 1. A database without the Books table (new file, ':memory:') gets baseline.sql first:
 *    the original shop.db schema and data.
 * 2. Before the first migration of an existing database, a one-time copy is written to `backupPath`.
 * 3. Each pending migration runs in its own transaction together with the user_version update.
 */
export async function migrate(db, { backupPath, log = () => {} } = {}) {
  const hasBooksTable = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'Books'")
    .get();

  if (!hasBooksTable) {
    transaction(db, () => db.exec(fs.readFileSync(BASELINE_FILE, 'utf8')));
    log('Created the baseline schema and data (24 books, 16 orders)');
  }

  const fromVersion = currentVersion(db);
  const pending = listMigrations().filter((migration) => migration.version > fromVersion);

  if (pending.length > 0 && hasBooksTable && fromVersion === 0 && backupPath) {
    if (!fs.existsSync(backupPath)) {
      await backup(db, backupPath);
      log(`Backed up the original database to ${backupPath}`);
    }
  }

  for (const migration of pending) {
    transaction(db, () => {
      db.exec(migration.sql);
      db.exec(`PRAGMA user_version = ${migration.version}`);
    });
    log(`Applied migration ${migration.file}`);
  }

  return { applied: pending.map((migration) => migration.file), version: currentVersion(db) };
}
