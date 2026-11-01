let savepointCounter = 0;

/**
 * Runs `fn` atomically and returns its result. node:sqlite has no transaction helper, so this uses
 * BEGIN IMMEDIATE / COMMIT / ROLLBACK, or a SAVEPOINT when a transaction is already open.
 *
 * `fn` must be synchronous: awaiting inside it would let other requests run statements
 * on the same connection in the middle of the transaction.
 */
export function transaction(db, fn) {
  const nested = db.isTransaction;
  const savepoint = `sp_${++savepointCounter}`;
  db.exec(nested ? `SAVEPOINT ${savepoint}` : 'BEGIN IMMEDIATE');
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      throw new TypeError('transaction() callback must be synchronous');
    }
    db.exec(nested ? `RELEASE ${savepoint}` : 'COMMIT');
    return result;
  } catch (err) {
    if (nested) {
      db.exec(`ROLLBACK TO ${savepoint}`);
      db.exec(`RELEASE ${savepoint}`);
    } else if (db.isTransaction) {
      db.exec('ROLLBACK');
    }
    throw err;
  }
}
