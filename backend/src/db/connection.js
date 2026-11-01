import { DatabaseSync } from 'node:sqlite';

/**
 * Normalises text for searching: lowercases, strips diacritics and unifies apostrophes,
 * so that "bronte" finds "Brontë" and "alice's" finds "Alice’s".
 */
export function unaccent(value) {
  if (value === null || value === undefined) return null;
  return String(value)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[łŁ]/g, 'l')
    .replace(/[‘’ʼ]/g, "'")
    .toLowerCase();
}

/** Opens the SQLite database (a file path or ':memory:') and registers custom SQL functions. */
export function openDatabase(location) {
  const db = new DatabaseSync(location, { enableForeignKeyConstraints: true, timeout: 5000 });
  db.function('unaccent', { deterministic: true }, unaccent);
  return db;
}
