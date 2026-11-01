import { jest } from '@jest/globals';
import { openDatabase, unaccent } from '../src/db/connection.js';
import { transaction } from '../src/db/transaction.js';
import { detectImageType } from '../src/modules/books/covers.service.js';
import { fromCents, toCents } from '../src/utils/money.js';
import { slugify } from '../src/utils/slug.js';
import { escapeLike, toDbValue, toIsoTimestamp } from '../src/utils/sql.js';

describe('text helpers', () => {
  test('unaccent normalises case, diacritics, Polish ł and apostrophes', () => {
    expect(unaccent('Emily Brontë')).toBe('emily bronte');
    expect(unaccent('Alice’s')).toBe("alice's");
    expect(unaccent('Łódź, Wiśniewska')).toBe('lodz, wisniewska');
    expect(unaccent(null)).toBeNull();
  });

  test('slugify builds file and category slugs', () => {
    expect(slugify('Alice’s Adventures in Wonderland')).toBe('alices-adventures-in-wonderland');
    expect(slugify("You Don't Know JS Yet: Scope & Closures")).toBe(
      'you-dont-know-js-yet-scope-closures',
    );
    expect(slugify('***')).toBe('item');
  });

  test('escapeLike escapes LIKE wildcards', () => {
    expect(escapeLike('100%_off\\')).toBe('100\\%\\_off\\\\');
  });
});

describe('value helpers', () => {
  test('toDbValue converts values node:sqlite cannot bind', () => {
    expect(toDbValue(true)).toBe(1);
    expect(toDbValue(false)).toBe(0);
    expect(toDbValue(undefined)).toBeNull();
    expect(toDbValue('x')).toBe('x');
  });

  test('money is converted between decimal prices and integer cents', () => {
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(fromCents(4999)).toBe(49.99);
  });

  test('SQLite timestamps become ISO 8601', () => {
    expect(toIsoTimestamp('2026-10-26 09:30:00')).toBe('2026-10-26T09:30:00Z');
    expect(toIsoTimestamp(null)).toBeNull();
  });

  test('image types are detected from their content', () => {
    expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
    expect(detectImageType(Buffer.from('\x89PNG\r\n\x1a\n....', 'latin1'))).toBe('png');
    expect(detectImageType(Buffer.from('RIFF0000WEBPVP8 '))).toBe('webp');
    expect(detectImageType(Buffer.from('GIF89a'))).toBeNull();
  });
});

describe('transaction()', () => {
  let db;
  const names = () =>
    db
      .prepare('SELECT name FROM t ORDER BY name')
      .all()
      .map((row) => row.name);

  beforeEach(() => {
    db = openDatabase(':memory:');
    db.exec('CREATE TABLE t (name TEXT NOT NULL)');
  });

  afterEach(() => db.close());

  test('commits and returns the callback result', () => {
    const result = transaction(db, () => {
      db.prepare("INSERT INTO t VALUES ('a')").run();
      return 42;
    });
    expect(result).toBe(42);
    expect(names()).toEqual(['a']);
    expect(db.isTransaction).toBe(false);
  });

  test('rolls back everything when the callback throws', () => {
    expect(() =>
      transaction(db, () => {
        db.prepare("INSERT INTO t VALUES ('a')").run();
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(names()).toEqual([]);
    expect(db.isTransaction).toBe(false);
  });

  test('a failing nested transaction only rolls back its own changes', () => {
    transaction(db, () => {
      db.prepare("INSERT INTO t VALUES ('outer')").run();
      expect(() =>
        transaction(db, () => {
          db.prepare("INSERT INTO t VALUES ('inner')").run();
          throw new Error('inner failed');
        }),
      ).toThrow('inner failed');
    });
    expect(names()).toEqual(['outer']);
  });

  test('refuses async callbacks', () => {
    const callback = jest.fn(async () => {});
    expect(() => transaction(db, callback)).toThrow('must be synchronous');
    expect(callback).toHaveBeenCalled();
    expect(db.isTransaction).toBe(false);
  });
});
