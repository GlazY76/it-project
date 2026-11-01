import { transaction } from '../../db/transaction.js';
import { badRequest, conflict, notFound } from '../../utils/http-error.js';
import { fromCents } from '../../utils/money.js';
import { toBookSummaryDto } from '../books/books.mapper.js';

export const MAX_ITEM_QUANTITY = 99;

export function createCartService(db, { currency }) {
  const selectItems = db.prepare(`
    SELECT ci.Quantity, b.*
    FROM CartItems ci
    JOIN Books b ON b.ID = ci.BookId
    WHERE ci.UserId = ?
    ORDER BY ci.rowid`); // insertion order: an upsert keeps the rowid
  const selectItem = db.prepare('SELECT Quantity FROM CartItems WHERE UserId = ? AND BookId = ?');
  const selectBook = db.prepare('SELECT ID, Name, Stock FROM Books WHERE ID = ?');
  const upsertItem = db.prepare(`
    INSERT INTO CartItems (UserId, BookId, Quantity) VALUES (?, ?, ?)
    ON CONFLICT (UserId, BookId) DO UPDATE SET Quantity = excluded.Quantity`);
  const deleteItem = db.prepare('DELETE FROM CartItems WHERE UserId = ? AND BookId = ?');
  const deleteAll = db.prepare('DELETE FROM CartItems WHERE UserId = ?');

  function get(userId) {
    const rows = selectItems.all(userId);
    const totalCents = rows.reduce((sum, row) => sum + row.PriceCents * row.Quantity, 0);
    return {
      items: rows.map((row) => ({
        book: toBookSummaryDto(row, currency),
        quantity: row.Quantity,
        lineTotal: fromCents(row.PriceCents * row.Quantity),
      })),
      totalQuantity: rows.reduce((sum, row) => sum + row.Quantity, 0),
      total: fromCents(totalCents),
      currency,
    };
  }

  function assertAvailable(bookId, quantity) {
    const book = selectBook.get(bookId);
    if (!book) throw notFound('Book not found', 'BOOK_NOT_FOUND');
    if (quantity > MAX_ITEM_QUANTITY) {
      throw badRequest('QUANTITY_LIMIT', `At most ${MAX_ITEM_QUANTITY} copies of a book per order`);
    }
    if (quantity > book.Stock) {
      const message =
        book.Stock === 0
          ? `"${book.Name}" is out of stock`
          : `Only ${book.Stock} copies of "${book.Name}" are available`;
      throw conflict('INSUFFICIENT_STOCK', message, [
        { bookId, title: book.Name, requested: quantity, available: book.Stock },
      ]);
    }
  }

  /** Adds `quantity` copies (on top of what is already in the cart). */
  function addItem(userId, { bookId, quantity }) {
    transaction(db, () => {
      const newQuantity = (selectItem.get(userId, bookId)?.Quantity ?? 0) + quantity;
      assertAvailable(bookId, newQuantity);
      upsertItem.run(userId, bookId, newQuantity);
    });
    return get(userId);
  }

  function setQuantity(userId, bookId, quantity) {
    transaction(db, () => {
      if (!selectItem.get(userId, bookId)) {
        throw notFound('This book is not in your cart', 'CART_ITEM_NOT_FOUND');
      }
      assertAvailable(bookId, quantity);
      upsertItem.run(userId, bookId, quantity);
    });
    return get(userId);
  }

  function removeItem(userId, bookId) {
    if (deleteItem.run(userId, bookId).changes === 0) {
      throw notFound('This book is not in your cart', 'CART_ITEM_NOT_FOUND');
    }
    return get(userId);
  }

  function clear(userId) {
    deleteAll.run(userId);
  }

  return { get, addItem, setQuantity, removeItem, clear };
}
