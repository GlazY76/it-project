/** node:sqlite cannot bind booleans or undefined, so convert them to 1/0 and NULL. */
export function toDbValue(value) {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

/** Escapes LIKE wildcards in user input; use together with `ESCAPE '\'`. */
export function escapeLike(value) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** True for SQLITE_CONSTRAINT errors (UNIQUE, CHECK, NOT NULL, FOREIGN KEY...). */
export function isConstraintError(err) {
  return err?.code === 'ERR_SQLITE_ERROR' && (err.errcode & 0xff) === 19;
}

/** Converts SQLite's CURRENT_TIMESTAMP format (UTC, "YYYY-MM-DD HH:MM:SS") to ISO 8601. */
export function toIsoTimestamp(value) {
  return value ? `${value.replace(' ', 'T')}Z` : null;
}
