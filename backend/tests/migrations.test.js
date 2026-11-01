import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../src/db/connection.js';
import { currentVersion, latestVersion, migrate } from '../src/db/migrate.js';
import { REAL_DATA_DIR } from './helpers/test-app.js';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeshelf-migrations-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const count = (db, sql) => db.prepare(sql).get().n;

/** Invariants that must hold after migrating any copy of the shop database. */
function expectHealthyDatabase(db) {
  expect(currentVersion(db)).toBe(latestVersion());
  expect(db.prepare('PRAGMA integrity_check').get().integrity_check).toBe('ok');
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  expect(
    count(
      db,
      'SELECT count(*) AS n FROM Orders o WHERE NOT EXISTS (SELECT 1 FROM OrderItems oi WHERE oi.OrderId = o.ID)',
    ),
  ).toBe(0);
  for (const { CoverPath } of db
    .prepare(
      "SELECT CoverPath FROM Books WHERE CoverPath LIKE 'pictures/%' AND CoverPath NOT LIKE 'pictures/uploads/%'",
    )
    .all()) {
    expect(fs.existsSync(path.join(REAL_DATA_DIR, CoverPath))).toBe(true);
  }
}

test('an empty database gets the original data and all migrations', async () => {
  const db = openDatabase(':memory:');
  const result = await migrate(db);
  expect(result.applied).toHaveLength(latestVersion());
  expectHealthyDatabase(db);
  expect(count(db, 'SELECT count(*) AS n FROM Books')).toBe(24);
  expect(count(db, 'SELECT count(*) AS n FROM Orders')).toBe(16);
  expect(count(db, 'SELECT count(*) AS n FROM Books WHERE PriceCents > 0')).toBe(24);
  expect(
    count(db, "SELECT count(*) AS n FROM Orders WHERE Status = 'delivered' AND TotalCents > 0"),
  ).toBe(16);
  db.close();
});

test('the real data/shop.db migrates cleanly and only once', async () => {
  const dbPath = path.join(tmpDir, 'shop.db');
  fs.copyFileSync(path.join(REAL_DATA_DIR, 'shop.db'), dbPath);
  const db = openDatabase(dbPath);

  await migrate(db, { backupPath: path.join(tmpDir, 'shop.original.db') });
  expectHealthyDatabase(db);
  expect(count(db, 'SELECT count(*) AS n FROM Books')).toBeGreaterThanOrEqual(1);

  const second = await migrate(db, { backupPath: path.join(tmpDir, 'shop.original.db') });
  expect(second.applied).toEqual([]);
  db.close();
});

test('the original database is backed up before the first migration', async () => {
  const dbPath = path.join(tmpDir, 'shop.db');
  const backupPath = path.join(tmpDir, 'shop.original.db');
  const original = openDatabase(dbPath);
  original.exec(fs.readFileSync(new URL('../src/db/baseline.sql', import.meta.url), 'utf8'));
  original.close();

  const db = openDatabase(dbPath);
  const logs = [];
  await migrate(db, { backupPath, log: (message) => logs.push(message) });
  db.close();

  expect(logs[0]).toBe(`Backed up the original database to ${backupPath}`);
  const backup = openDatabase(backupPath);
  expect(currentVersion(backup)).toBe(0);
  expect(count(backup, 'SELECT count(*) AS n FROM Books')).toBe(24);
  expect(
    backup.prepare("SELECT name FROM sqlite_master WHERE name = 'Users'").get(),
  ).toBeUndefined();
  backup.close();
});
