import { transaction } from '../../db/transaction.js';
import { badRequest, conflict, notFound } from '../../utils/http-error.js';
import { toCents } from '../../utils/money.js';
import { pageResult, toLimitOffset } from '../../utils/pagination.js';
import { escapeLike, isConstraintError, toDbValue } from '../../utils/sql.js';
import { toCategoryDto } from '../categories/categories.service.js';
import { toBookDto } from './books.mapper.js';

// Whitelists: user input never reaches the SQL text directly
const SORT_COLUMNS = {
  title: 'b.Name COLLATE NOCASE',
  price: 'b.PriceCents',
  year: 'b.Year',
  newest: 'b.CreatedAt',
};
const DEFAULT_ORDER = { title: 'asc', price: 'asc', year: 'desc', newest: 'desc' };

// API field -> Books column
const WRITABLE_COLUMNS = {
  title: 'Name',
  author: 'Author',
  description: 'Description',
  isbn: 'Isbn',
  publisher: 'Publisher',
  year: 'Year',
  pages: 'Pages',
  level: 'Level',
  price: 'PriceCents',
  stock: 'Stock',
};

function rethrowIsbnTaken(err) {
  if (isConstraintError(err) && err.message.includes('Books.Isbn')) {
    throw conflict('ISBN_TAKEN', 'Another book already has this ISBN');
  }
  throw err;
}

/** [[column, value], ...] for the fields present in `data`, ready to bind. */
function toColumnValues(data) {
  return Object.entries(WRITABLE_COLUMNS)
    .filter(([field]) => data[field] !== undefined)
    .map(([field, column]) => [
      column,
      toDbValue(field === 'price' ? toCents(data.price) : data[field]),
    ]);
}

export function createBooksService(db, { currency }) {
  const selectById = db.prepare('SELECT * FROM Books WHERE ID = ?');
  const selectCategories = db.prepare(`
    SELECT bc.BookId, c.*
    FROM BookCategories bc
    JOIN Categories c ON c.ID = bc.CategoryId
    WHERE bc.BookId IN (SELECT value FROM json_each(?))
    ORDER BY c.Type, c.Name`);
  const countCategories = db.prepare(
    'SELECT count(*) AS n FROM Categories WHERE ID IN (SELECT value FROM json_each(?))',
  );
  const deleteLinks = db.prepare('DELETE FROM BookCategories WHERE BookId = ?');
  const insertLink = db.prepare('INSERT INTO BookCategories (BookId, CategoryId) VALUES (?, ?)');
  const selectIsOrdered = db.prepare(`
    SELECT EXISTS (SELECT 1 FROM OrderItems WHERE BookId = ?)
        OR EXISTS (SELECT 1 FROM Orders WHERE BookId = ?) AS ordered`);
  const deleteBook = db.prepare('DELETE FROM Books WHERE ID = ?');
  const updateCoverPath = db.prepare('UPDATE Books SET CoverPath = ? WHERE ID = ?');
  const selectCoverUse = db.prepare('SELECT 1 FROM Books WHERE CoverPath = ? LIMIT 1');

  function toDtos(rows) {
    const categories = new Map(rows.map((row) => [row.ID, []]));
    if (rows.length > 0) {
      for (const row of selectCategories.all(JSON.stringify(rows.map((r) => r.ID)))) {
        categories.get(row.BookId).push(toCategoryDto(row));
      }
    }
    return rows.map((row) => toBookDto(row, { categories: categories.get(row.ID), currency }));
  }

  function getRow(id) {
    const row = selectById.get(id);
    if (!row) throw notFound('Book not found', 'BOOK_NOT_FOUND');
    return row;
  }

  /** Catalog with search, filters, sorting and pagination (FR-01..FR-03). */
  function list({ page, limit, q, language, topic, level, inStock, sort, order }) {
    const where = [];
    const params = [];

    if (q) {
      // unaccent() ignores case, diacritics and apostrophe style; ISBNs are compared without hyphens
      const conditions = [
        "unaccent(b.Name) LIKE '%' || unaccent(?) || '%' ESCAPE '\\'",
        "unaccent(b.Author) LIKE '%' || unaccent(?) || '%' ESCAPE '\\'",
      ];
      params.push(escapeLike(q), escapeLike(q));
      const isbnDigits = q.replace(/[\s-]/g, '').toUpperCase();
      if (/^\d{3,13}X?$/.test(isbnDigits)) {
        conditions.push("b.Isbn LIKE '%' || ? || '%'");
        params.push(isbnDigits);
      }
      where.push(`(${conditions.join(' OR ')})`);
    }

    for (const [type, slug] of [
      ['language', language],
      ['topic', topic],
    ]) {
      if (!slug) continue;
      where.push(`EXISTS (
        SELECT 1 FROM BookCategories bc JOIN Categories c ON c.ID = bc.CategoryId
        WHERE bc.BookId = b.ID AND c.Type = ? AND c.Slug = ?)`);
      params.push(type, slug);
    }

    if (level) {
      where.push('b.Level = ?');
      params.push(level);
    }
    if (inStock !== undefined) {
      where.push(inStock ? 'b.Stock > 0' : 'b.Stock = 0');
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const direction = (order ?? DEFAULT_ORDER[sort]).toUpperCase();
    const { offset } = toLimitOffset({ page, limit });

    const { total } = db
      .prepare(`SELECT count(*) AS total FROM Books b ${whereSql}`)
      .get(...params);
    const rows = db
      .prepare(
        `SELECT b.* FROM Books b ${whereSql}
         ORDER BY ${SORT_COLUMNS[sort]} ${direction} NULLS LAST, b.ID ASC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset);

    return pageResult(toDtos(rows), { page, limit, total });
  }

  function getById(id) {
    return toDtos([getRow(id)])[0];
  }

  function assertCategoriesExist(categoryIds) {
    const unique = [...new Set(categoryIds)];
    if (countCategories.get(JSON.stringify(unique)).n !== unique.length) {
      throw badRequest('UNKNOWN_CATEGORY', 'One or more categories do not exist');
    }
    return unique;
  }

  function replaceCategories(bookId, categoryIds) {
    deleteLinks.run(bookId);
    for (const categoryId of categoryIds) insertLink.run(bookId, categoryId);
  }

  function create(data) {
    const categoryIds = assertCategoriesExist(data.categoryIds ?? []);
    const values = toColumnValues(data);
    const columns = [...values.map(([column]) => column), 'CreatedAt'];
    const placeholders = [...values.map(() => '?'), 'CURRENT_TIMESTAMP'];
    try {
      return transaction(db, () => {
        const { ID } = db
          .prepare(
            `INSERT INTO Books (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING ID`,
          )
          .get(...values.map(([, value]) => value));
        replaceCategories(ID, categoryIds);
        return getById(ID);
      });
    } catch (err) {
      rethrowIsbnTaken(err);
    }
  }

  function update(id, data) {
    getRow(id);
    const categoryIds =
      data.categoryIds === undefined ? undefined : assertCategoriesExist(data.categoryIds);
    const values = toColumnValues(data);
    try {
      return transaction(db, () => {
        if (values.length > 0) {
          db.prepare(
            `UPDATE Books SET ${values.map(([column]) => `${column} = ?`).join(', ')} WHERE ID = ?`,
          ).run(...values.map(([, value]) => value), id);
        }
        if (categoryIds) replaceCategories(id, categoryIds);
        return getById(id);
      });
    } catch (err) {
      rethrowIsbnTaken(err);
    }
  }

  /**
   * Books that appear in orders cannot be deleted (the original schema uses ON DELETE RESTRICT);
   * cart lines and category links are removed by cascade. Returns the old CoverPath.
   */
  function remove(id) {
    const row = getRow(id);
    if (selectIsOrdered.get(id, id).ordered) {
      throw conflict(
        'BOOK_HAS_ORDERS',
        'This book appears in orders and cannot be deleted. Set its stock to 0 instead.',
      );
    }
    deleteBook.run(id);
    return row.CoverPath;
  }

  /** Sets a new CoverPath and returns the previous one. */
  function setCoverPath(id, coverPath) {
    const previous = getRow(id).CoverPath;
    updateCoverPath.run(coverPath, id);
    return previous;
  }

  function isCoverInUse(coverPath) {
    return selectCoverUse.get(coverPath) !== undefined;
  }

  return { list, getById, create, update, remove, setCoverPath, isCoverInUse };
}
