import { conflict, notFound } from '../../utils/http-error.js';
import { slugify } from '../../utils/slug.js';
import { isConstraintError } from '../../utils/sql.js';

export const toCategoryDto = (row) => ({
  id: row.ID,
  name: row.Name,
  slug: row.Slug,
  type: row.Type,
});

const WITH_BOOK_COUNT = `
  SELECT c.*, (SELECT count(*) FROM BookCategories bc WHERE bc.CategoryId = c.ID) AS BookCount
  FROM Categories c`;

function rethrowSlugTaken(err) {
  if (isConstraintError(err) && err.message.includes('Categories.Slug')) {
    throw conflict('CATEGORY_EXISTS', 'A category with this slug already exists');
  }
  throw err;
}

export function createCategoriesService(db) {
  const selectAll = db.prepare(`${WITH_BOOK_COUNT} ORDER BY c.Type, c.Name`);
  const selectByType = db.prepare(`${WITH_BOOK_COUNT} WHERE c.Type = ? ORDER BY c.Name`);
  const selectById = db.prepare(`${WITH_BOOK_COUNT} WHERE c.ID = ?`);
  const insertCategory = db.prepare(
    'INSERT INTO Categories (Name, Slug, Type) VALUES (?, ?, ?) RETURNING ID',
  );
  const deleteCategory = db.prepare('DELETE FROM Categories WHERE ID = ?');

  const toDto = (row) => ({ ...toCategoryDto(row), bookCount: row.BookCount });

  function list({ type } = {}) {
    return (type ? selectByType.all(type) : selectAll.all()).map(toDto);
  }

  function getById(id) {
    const row = selectById.get(id);
    if (!row) throw notFound('Category not found', 'CATEGORY_NOT_FOUND');
    return toDto(row);
  }

  function create({ name, slug, type }) {
    try {
      const { ID } = insertCategory.get(name, slug ?? slugify(name), type);
      return getById(ID);
    } catch (err) {
      rethrowSlugTaken(err);
    }
  }

  function update(id, { name, slug, type }) {
    getById(id);
    const changes = Object.entries({ Name: name, Slug: slug, Type: type }).filter(
      ([, value]) => value !== undefined,
    );
    try {
      db.prepare(
        `UPDATE Categories SET ${changes.map(([column]) => `${column} = ?`).join(', ')} WHERE ID = ?`,
      ).run(...changes.map(([, value]) => value), id);
    } catch (err) {
      rethrowSlugTaken(err);
    }
    return getById(id);
  }

  /** Deleting a category only unlinks it from books (ON DELETE CASCADE). */
  function remove(id) {
    if (deleteCategory.run(id).changes === 0) {
      throw notFound('Category not found', 'CATEGORY_NOT_FOUND');
    }
  }

  return { list, getById, create, update, remove };
}
