import { transaction } from '../../db/transaction.js';
import { badRequest, conflict, notFound } from '../../utils/http-error.js';
import { fromCents } from '../../utils/money.js';
import { pageResult, toLimitOffset } from '../../utils/pagination.js';
import { escapeLike, toIsoTimestamp } from '../../utils/sql.js';
import { toCoverUrl } from '../books/books.mapper.js';

// Allowed status changes (FR-11). Cancelling puts the books back in stock.
export const STATUS_TRANSITIONS = {
  pending: ['paid', 'shipped', 'cancelled'],
  paid: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

const ORDER_SELECT = `
  SELECT o.*, u.Name AS UserName, u.Email AS UserEmail
  FROM Orders o
  LEFT JOIN Users u ON u.ID = o.UserId`;

const orderNotFound = () => notFound('Order not found', 'ORDER_NOT_FOUND');

export function createOrdersService(db, { currency }) {
  const selectCart = db.prepare(`
    SELECT ci.BookId, ci.Quantity, b.Name, b.PriceCents, b.Stock
    FROM CartItems ci
    JOIN Books b ON b.ID = ci.BookId
    WHERE ci.UserId = ?
    ORDER BY ci.rowid`);
  const insertOrder = db.prepare(`
    INSERT INTO Orders (Address, Name, BookId, UserId, Status, PaymentMethod, TotalCents, CreatedAt)
    VALUES (?, ?, ?, ?, 'pending', ?, ?, CURRENT_TIMESTAMP)
    RETURNING ID`);
  const insertItem = db.prepare(
    'INSERT INTO OrderItems (OrderId, BookId, Quantity, UnitPriceCents) VALUES (?, ?, ?, ?)',
  );
  const decrementStock = db.prepare('UPDATE Books SET Stock = Stock - ? WHERE ID = ?');
  const restockOrder = db.prepare(`
    UPDATE Books SET Stock = Stock + oi.Quantity
    FROM OrderItems oi
    WHERE oi.BookId = Books.ID AND oi.OrderId = ?`);
  const clearCart = db.prepare('DELETE FROM CartItems WHERE UserId = ?');
  const selectOrder = db.prepare(`${ORDER_SELECT} WHERE o.ID = ?`);
  const selectItems = db.prepare(`
    SELECT oi.OrderId, oi.BookId, oi.Quantity, oi.UnitPriceCents, b.Name, b.Author, b.CoverPath
    FROM OrderItems oi
    JOIN Books b ON b.ID = oi.BookId
    WHERE oi.OrderId IN (SELECT value FROM json_each(?))
    ORDER BY oi.ID`);
  const countUserOrders = db.prepare('SELECT count(*) AS total FROM Orders WHERE UserId = ?');
  const selectUserOrders = db.prepare(`
    ${ORDER_SELECT}
    WHERE o.UserId = ?
    ORDER BY o.CreatedAt DESC NULLS LAST, o.ID DESC
    LIMIT ? OFFSET ?`);
  const updateStatus = db.prepare('UPDATE Orders SET Status = ? WHERE ID = ?');

  function toItemDto(item) {
    return {
      bookId: item.BookId,
      title: item.Name,
      author: item.Author,
      coverUrl: toCoverUrl(item.CoverPath),
      quantity: item.Quantity,
      unitPrice: fromCents(item.UnitPriceCents),
      lineTotal: fromCents(item.UnitPriceCents * item.Quantity),
    };
  }

  /** Customers see their own orders; administrators also get the owner (null for guest orders). */
  function toDtos(rows, { includeUser = false } = {}) {
    const items = new Map(rows.map((row) => [row.ID, []]));
    if (rows.length > 0) {
      for (const item of selectItems.all(JSON.stringify(rows.map((row) => row.ID)))) {
        items.get(item.OrderId).push(toItemDto(item));
      }
    }
    return rows.map((row) => ({
      id: row.ID,
      status: row.Status,
      paymentMethod: row.PaymentMethod,
      name: row.Name,
      address: row.Address,
      total: fromCents(row.TotalCents),
      currency,
      createdAt: toIsoTimestamp(row.CreatedAt),
      items: items.get(row.ID),
      ...(includeUser && {
        user: row.UserId ? { id: row.UserId, name: row.UserName, email: row.UserEmail } : null,
      }),
    }));
  }

  function getRow(orderId) {
    const row = selectOrder.get(orderId);
    if (!row) throw orderNotFound();
    return row;
  }

  // Other users' orders are reported as missing rather than forbidden, so ids cannot be probed
  function getOwnRow(userId, orderId) {
    const row = getRow(orderId);
    if (row.UserId !== userId) throw orderNotFound();
    return row;
  }

  /**
   * Turns the user's cart into an order (FR-07) in one transaction: checks stock, stores the
   * order with a price snapshot, takes the books out of stock and empties the cart.
   */
  function checkout(userId, { name, address, paymentMethod }) {
    const orderId = transaction(db, () => {
      const lines = selectCart.all(userId);
      if (lines.length === 0) throw badRequest('CART_EMPTY', 'Your cart is empty');

      const shortages = lines
        .filter((line) => line.Quantity > line.Stock)
        .map((line) => ({
          bookId: line.BookId,
          title: line.Name,
          requested: line.Quantity,
          available: line.Stock,
        }));
      if (shortages.length > 0) {
        throw conflict(
          'INSUFFICIENT_STOCK',
          'Some books are not available in the requested quantity',
          shortages,
        );
      }

      const totalCents = lines.reduce((sum, line) => sum + line.PriceCents * line.Quantity, 0);
      // Orders.BookId comes from the original schema (NOT NULL): it stores the first book
      const { ID } = insertOrder.get(
        address,
        name,
        lines[0].BookId,
        userId,
        paymentMethod,
        totalCents,
      );
      for (const line of lines) {
        insertItem.run(ID, line.BookId, line.Quantity, line.PriceCents);
        decrementStock.run(line.Quantity, line.BookId);
      }
      clearCart.run(userId);
      return ID;
    });
    return getForUser(userId, orderId);
  }

  function listForUser(userId, { page, limit }) {
    const { total } = countUserOrders.get(userId);
    const { offset } = toLimitOffset({ page, limit });
    const rows = selectUserOrders.all(userId, limit, offset);
    return pageResult(toDtos(rows), { page, limit, total });
  }

  function getForUser(userId, orderId) {
    return toDtos([getOwnRow(userId, orderId)])[0];
  }

  function cancelForUser(userId, orderId) {
    return transaction(db, () => {
      const row = getOwnRow(userId, orderId);
      if (row.Status !== 'pending') {
        throw conflict('ORDER_NOT_CANCELLABLE', 'Only pending orders can be cancelled');
      }
      restockOrder.run(orderId);
      updateStatus.run('cancelled', orderId);
      return getForUser(userId, orderId);
    });
  }

  /** Test-mode payment stub for card orders, until Stripe test mode is integrated. */
  function payForUser(userId, orderId) {
    return transaction(db, () => {
      const row = getOwnRow(userId, orderId);
      if (row.PaymentMethod !== 'card') {
        throw conflict('PAYMENT_NOT_REQUIRED', 'This order is paid in cash on delivery');
      }
      if (row.Status !== 'pending') {
        throw conflict('ORDER_NOT_PAYABLE', 'Only pending orders can be paid');
      }
      updateStatus.run('paid', orderId);
      return getForUser(userId, orderId);
    });
  }

  /** All orders, including the legacy guest orders, for the admin panel. */
  function list({ page, limit, status, q }) {
    const where = [];
    const params = [];
    if (status) {
      where.push('o.Status = ?');
      params.push(status);
    }
    if (q) {
      const conditions = ['Name', 'Address']
        .map((column) => `unaccent(o.${column}) LIKE '%' || unaccent(?) || '%' ESCAPE '\\'`)
        .concat("unaccent(u.Email) LIKE '%' || unaccent(?) || '%' ESCAPE '\\'");
      params.push(escapeLike(q), escapeLike(q), escapeLike(q));
      if (/^\d+$/.test(q)) {
        conditions.push('o.ID = ?');
        params.push(Number(q));
      }
      where.push(`(${conditions.join(' OR ')})`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const { offset } = toLimitOffset({ page, limit });
    const { total } = db
      .prepare(
        `SELECT count(*) AS total FROM Orders o LEFT JOIN Users u ON u.ID = o.UserId ${whereSql}`,
      )
      .get(...params);
    const rows = db
      .prepare(
        `${ORDER_SELECT} ${whereSql} ORDER BY o.CreatedAt DESC NULLS LAST, o.ID DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset);
    return pageResult(toDtos(rows, { includeUser: true }), { page, limit, total });
  }

  function getById(orderId) {
    return toDtos([getRow(orderId)], { includeUser: true })[0];
  }

  function changeStatus(orderId, status) {
    return transaction(db, () => {
      const { Status: current } = getRow(orderId);
      const allowed = STATUS_TRANSITIONS[current];
      if (!allowed.includes(status)) {
        throw conflict(
          'INVALID_STATUS_TRANSITION',
          `An order cannot go from "${current}" to "${status}"`,
          { from: current, to: status, allowed },
        );
      }
      if (status === 'cancelled') restockOrder.run(orderId);
      updateStatus.run(status, orderId);
      return getById(orderId);
    });
  }

  return {
    checkout,
    listForUser,
    getForUser,
    cancelForUser,
    payForUser,
    list,
    getById,
    changeStatus,
  };
}
