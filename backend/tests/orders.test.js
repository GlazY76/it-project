import request from 'supertest';
import { createTestContext } from './helpers/test-app.js';

let ctx;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(() => ctx.cleanup());

const stockOf = (bookId) =>
  ctx.db.prepare('SELECT Stock FROM Books WHERE ID = ?').get(bookId).Stock;

async function fillCart(customer, items) {
  for (const item of items) {
    const res = await request(ctx.app).post('/api/cart/items').set(customer.auth).send(item);
    expect(res.status).toBe(200);
  }
}

function placeOrder(customer, body = { address: 'ul. Długa 8, 80-827 Gdańsk' }) {
  return request(ctx.app).post('/api/orders').set(customer.auth).send(body);
}

describe('checkout', () => {
  test('turns the cart into a pending order, takes the books out of stock and empties the cart', async () => {
    const customer = await ctx.registerCustomer({ name: 'Piotr Nowak' });
    const stockBefore = { 16: stockOf(16), 3: stockOf(3) };
    await fillCart(customer, [
      { bookId: 16, quantity: 2 },
      { bookId: 3, quantity: 1 },
    ]);

    const res = await placeOrder(customer);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'pending',
      paymentMethod: 'cod',
      name: 'Piotr Nowak',
      address: 'ul. Długa 8, 80-827 Gdańsk',
      total: 339.97,
      currency: 'PLN',
    });
    expect(res.body.createdAt).not.toBeNull();
    expect(res.body.items).toEqual([
      expect.objectContaining({
        bookId: 16,
        title: 'Pro Git',
        quantity: 2,
        unitPrice: 149.99,
        lineTotal: 299.98,
      }),
      expect.objectContaining({ bookId: 3, title: 'Dracula', quantity: 1, unitPrice: 39.99 }),
    ]);

    expect(stockOf(16)).toBe(stockBefore[16] - 2);
    expect(stockOf(3)).toBe(stockBefore[3] - 1);
    expect((await request(ctx.app).get('/api/cart').set(customer.auth)).body.items).toEqual([]);
  });

  test('keeps the price paid even when the catalog price changes later', async () => {
    const customer = await ctx.registerCustomer();
    await fillCart(customer, [{ bookId: 10 }]);
    const order = (await placeOrder(customer)).body;
    ctx.db.prepare('UPDATE Books SET PriceCents = 99999 WHERE ID = 10').run();

    const res = await request(ctx.app).get(`/api/orders/${order.id}`).set(customer.auth);
    expect(res.body.items[0].unitPrice).toBe(24.99);
    expect(res.body.total).toBe(24.99);
  });

  test('uses the recipient name from the request when given', async () => {
    const customer = await ctx.registerCustomer();
    await fillCart(customer, [{ bookId: 4 }]);
    const res = await placeOrder(customer, {
      name: 'Maria Wiśniewska',
      address: 'ul. Piotrkowska 101/3, 90-425 Łódź',
      paymentMethod: 'card',
    });
    expect(res.body).toMatchObject({ name: 'Maria Wiśniewska', paymentMethod: 'card' });
  });

  test('rejects an empty cart and a missing address', async () => {
    const customer = await ctx.registerCustomer();
    const empty = await placeOrder(customer);
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe('CART_EMPTY');

    const noAddress = await placeOrder(customer, {});
    expect(noAddress.status).toBe(400);
    expect(noAddress.body.error.details[0].field).toBe('body.address');
  });

  test('fails without changes when the stock dropped after the books were added to the cart', async () => {
    const customer = await ctx.registerCustomer();
    await fillCart(customer, [{ bookId: 24, quantity: 3 }]);
    ctx.db.prepare('UPDATE Books SET Stock = 1 WHERE ID = 24').run();

    const res = await placeOrder(customer);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      details: [{ bookId: 24, title: 'Everything curl', requested: 3, available: 1 }],
    });
    expect(stockOf(24)).toBe(1);
    expect((await request(ctx.app).get('/api/cart').set(customer.auth)).body.totalQuantity).toBe(3);
  });
});

describe('order history', () => {
  test('lists only the customer’s own orders, newest first', async () => {
    const customer = await ctx.registerCustomer();
    const other = await ctx.registerCustomer();
    await fillCart(customer, [{ bookId: 5 }]);
    const first = (await placeOrder(customer)).body;
    await fillCart(customer, [{ bookId: 6 }]);
    const second = (await placeOrder(customer)).body;
    await fillCart(other, [{ bookId: 7 }]);
    await placeOrder(other);

    const res = await request(ctx.app).get('/api/orders').set(customer.auth);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items.map((order) => order.id)).toEqual([second.id, first.id]);
  });

  test('hides other customers’ orders', async () => {
    const owner = await ctx.registerCustomer();
    const stranger = await ctx.registerCustomer();
    await fillCart(owner, [{ bookId: 8 }]);
    const order = (await placeOrder(owner)).body;

    const res = await request(ctx.app).get(`/api/orders/${order.id}`).set(stranger.auth);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
    // Legacy guest orders belong to nobody
    expect((await request(ctx.app).get('/api/orders/1').set(owner.auth)).status).toBe(404);
  });
});

describe('cancel and pay', () => {
  test('a pending order can be cancelled once and its books return to stock', async () => {
    const customer = await ctx.registerCustomer();
    const before = stockOf(9);
    await fillCart(customer, [{ bookId: 9, quantity: 2 }]);
    const order = (await placeOrder(customer)).body;
    expect(stockOf(9)).toBe(before - 2);

    const res = await request(ctx.app).post(`/api/orders/${order.id}/cancel`).set(customer.auth);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
    expect(stockOf(9)).toBe(before);

    const again = await request(ctx.app).post(`/api/orders/${order.id}/cancel`).set(customer.auth);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ORDER_NOT_CANCELLABLE');
  });

  test('the test-mode payment marks a pending card order as paid', async () => {
    const customer = await ctx.registerCustomer();
    await fillCart(customer, [{ bookId: 11 }]);
    const order = (
      await placeOrder(customer, { address: 'ul. Rynek 6, Rzeszów', paymentMethod: 'card' })
    ).body;

    const paid = await request(ctx.app).post(`/api/orders/${order.id}/pay`).set(customer.auth);
    expect(paid.status).toBe(200);
    expect(paid.body.status).toBe('paid');

    const twice = await request(ctx.app).post(`/api/orders/${order.id}/pay`).set(customer.auth);
    expect(twice.body.error.code).toBe('ORDER_NOT_PAYABLE');
  });

  test('cash-on-delivery orders cannot be paid online', async () => {
    const customer = await ctx.registerCustomer();
    await fillCart(customer, [{ bookId: 12 }]);
    const order = (await placeOrder(customer)).body;
    const res = await request(ctx.app).post(`/api/orders/${order.id}/pay`).set(customer.auth);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PAYMENT_NOT_REQUIRED');
  });
});

describe('without mock payments', () => {
  test('the pay endpoint does not exist', async () => {
    const strict = await createTestContext({ env: { MOCK_PAYMENTS: 'false' } });
    try {
      const customer = await strict.registerCustomer();
      const res = await request(strict.app).post('/api/orders/1/pay').set(customer.auth);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    } finally {
      strict.cleanup();
    }
  });
});
