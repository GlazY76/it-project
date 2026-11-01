import request from 'supertest';
import { createTestContext } from './helpers/test-app.js';

let ctx;
let customer;

beforeAll(async () => {
  ctx = await createTestContext();
});

beforeEach(async () => {
  customer = await ctx.registerCustomer();
});

afterAll(() => ctx.cleanup());

const cart = () => request(ctx.app).get('/api/cart').set(customer.auth);
const addItem = (body) => request(ctx.app).post('/api/cart/items').set(customer.auth).send(body);

describe('cart', () => {
  test('requires authentication', async () => {
    expect((await request(ctx.app).get('/api/cart')).status).toBe(401);
  });

  test('starts empty', async () => {
    const res = await cart();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], totalQuantity: 0, total: 0, currency: 'PLN' });
  });

  test('adds books and accumulates quantities', async () => {
    await addItem({ bookId: 17 });
    await addItem({ bookId: 1, quantity: 2 });
    const res = await addItem({ bookId: 17, quantity: 2 });
    expect(res.status).toBe(200);
    expect(res.body.items.map(({ book, quantity }) => [book.id, quantity])).toEqual([
      [17, 3],
      [1, 2],
    ]);
    expect(res.body.items[0].lineTotal).toBe(509.97);
    expect(res.body).toMatchObject({ totalQuantity: 5, total: 579.95 });
  });

  test('does not allow more copies than are in stock', async () => {
    const tooMany = await addItem({ bookId: 24, quantity: 4 }); // stock 3
    expect(tooMany.status).toBe(409);
    expect(tooMany.body.error).toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      details: [{ bookId: 24, requested: 4, available: 3 }],
    });

    const outOfStock = await addItem({ bookId: 23 });
    expect(outOfStock.status).toBe(409);
    expect(outOfStock.body.error.message).toBe('"Dive Into Python 3" is out of stock');
  });

  test('returns 404 for an unknown book and 400 for an invalid quantity', async () => {
    expect((await addItem({ bookId: 999 })).body.error.code).toBe('BOOK_NOT_FOUND');
    expect((await addItem({ bookId: 1, quantity: 0 })).status).toBe(400);
  });

  test('sets the quantity of a book in the cart', async () => {
    await addItem({ bookId: 2 });
    const res = await request(ctx.app)
      .patch('/api/cart/items/2')
      .set(customer.auth)
      .send({ quantity: 4 });
    expect(res.status).toBe(200);
    expect(res.body.items[0].quantity).toBe(4);

    const missing = await request(ctx.app)
      .patch('/api/cart/items/3')
      .set(customer.auth)
      .send({ quantity: 1 });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('CART_ITEM_NOT_FOUND');
  });

  test('removes a book and empties the cart', async () => {
    await addItem({ bookId: 4 });
    await addItem({ bookId: 5 });

    const removed = await request(ctx.app).delete('/api/cart/items/4').set(customer.auth);
    expect(removed.status).toBe(200);
    expect(removed.body.items.map((item) => item.book.id)).toEqual([5]);
    expect((await request(ctx.app).delete('/api/cart/items/4').set(customer.auth)).status).toBe(
      404,
    );

    expect((await request(ctx.app).delete('/api/cart').set(customer.auth)).status).toBe(204);
    expect((await cart()).body.items).toEqual([]);
  });

  test('each customer has their own cart', async () => {
    await addItem({ bookId: 6 });
    const other = await ctx.registerCustomer();
    const res = await request(ctx.app).get('/api/cart').set(other.auth);
    expect(res.body.items).toEqual([]);
  });
});
