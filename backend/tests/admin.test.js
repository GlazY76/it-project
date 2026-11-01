import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { REAL_DATA_DIR, createTestContext } from './helpers/test-app.js';

let ctx;
let admin;
let customer;

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
const JPEG = fs.readFileSync(path.join(REAL_DATA_DIR, 'pictures', 'pro-git.jpg'));

beforeAll(async () => {
  ctx = await createTestContext();
  admin = await ctx.createAdmin();
  customer = await ctx.registerCustomer();
});

afterAll(() => ctx.cleanup());

const asAdmin = (method, url) => request(ctx.app)[method](url).set(admin.auth);
const uploadedFile = (coverUrl) => path.join(ctx.dataDir, coverUrl.replace(/^\//, ''));

describe('access control', () => {
  test.each([
    ['get', '/api/admin/orders'],
    ['post', '/api/admin/books'],
    ['patch', '/api/admin/orders/1/status'],
    ['delete', '/api/admin/categories/1'],
  ])('%s %s needs a token and the admin role', async (method, url) => {
    expect((await request(ctx.app)[method](url)).status).toBe(401);
    const res = await request(ctx.app)[method](url).set(customer.auth);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('books', () => {
  const newBook = {
    title: 'Learning Go',
    author: 'Jon Bodner',
    price: 189.99,
    stock: 4,
    isbn: '978-1-0981-3929-2',
    publisher: "O'Reilly Media",
    year: 2024,
    level: 'intermediate',
    categoryIds: [4],
  };

  test('creates a book that appears in the catalog', async () => {
    const res = await asAdmin('post', '/api/admin/books').send(newBook);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: 'Learning Go',
      price: 189.99,
      stock: 4,
      isbn: '9781098139292',
      coverUrl: null,
      description: null,
      categories: [expect.objectContaining({ id: 4, slug: 'language-fundamentals' })],
    });

    const search = await request(ctx.app).get('/api/books').query({ q: 'learning go' });
    expect(search.body.items.map((book) => book.id)).toEqual([res.body.id]);
  });

  test('rejects a duplicate ISBN, an unknown category and missing fields', async () => {
    const duplicate = await asAdmin('post', '/api/admin/books').send({ ...newBook, title: 'Copy' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('ISBN_TAKEN');

    const unknownCategory = await asAdmin('post', '/api/admin/books').send({
      ...newBook,
      isbn: null,
      categoryIds: [999],
    });
    expect(unknownCategory.status).toBe(400);
    expect(unknownCategory.body.error.code).toBe('UNKNOWN_CATEGORY');

    const invalid = await asAdmin('post', '/api/admin/books').send({ title: '', price: -1 });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.details.map((d) => d.field).sort()).toEqual([
      'body.author',
      'body.price',
      'body.title',
    ]);
  });

  test('updates price, stock and categories without touching other fields', async () => {
    const res = await asAdmin('patch', '/api/admin/books/22').send({
      price: 44.5,
      stock: 30,
      categoryIds: [2],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      title: 'A Whirlwind Tour of Python',
      price: 44.5,
      stock: 30,
      categories: [expect.objectContaining({ slug: 'python' })],
    });

    const cleared = await asAdmin('patch', '/api/admin/books/22').send({ publisher: '' });
    expect(cleared.body.publisher).toBeNull();
    expect((await asAdmin('patch', '/api/admin/books/22').send({})).status).toBe(400);
    expect((await asAdmin('patch', '/api/admin/books/999').send({ stock: 1 })).status).toBe(404);
  });

  test('a book that appears in orders cannot be deleted', async () => {
    const res = await asAdmin('delete', '/api/admin/books/1');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BOOK_HAS_ORDERS');
  });

  test('deletes a book that was never ordered, together with its cart lines', async () => {
    await request(ctx.app).post('/api/cart/items').set(customer.auth).send({ bookId: 19 });
    expect((await asAdmin('delete', '/api/admin/books/19')).status).toBe(204);
    expect((await request(ctx.app).get('/api/books/19')).status).toBe(404);
    expect((await request(ctx.app).get('/api/cart').set(customer.auth)).body.items).toEqual([]);
  });
});

describe('covers', () => {
  test('uploads a cover, serves it and replaces it later', async () => {
    const first = await asAdmin('post', '/api/admin/books/20/cover').attach(
      'cover',
      PNG,
      'cover.png',
    );
    expect(first.status).toBe(200);
    expect(first.body.coverUrl).toMatch(/^\/pictures\/uploads\/professor-frisbys-.*-20-\w+\.png$/);
    expect(fs.existsSync(uploadedFile(first.body.coverUrl))).toBe(true);

    const served = await request(ctx.app).get(first.body.coverUrl);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/png');

    const second = await asAdmin('post', '/api/admin/books/20/cover').attach(
      'cover',
      JPEG,
      'new.jpg',
    );
    expect(second.body.coverUrl).toMatch(/\.jpg$/);
    expect(fs.existsSync(uploadedFile(second.body.coverUrl))).toBe(true);
    // The previous upload is no longer used, so it is removed
    expect(fs.existsSync(uploadedFile(first.body.coverUrl))).toBe(false);
  });

  test('never deletes an original cover when it is replaced', async () => {
    const res = await asAdmin('post', '/api/admin/books/3/cover').attach('cover', PNG, 'cover.png');
    expect(res.status).toBe(200);
    expect(fs.existsSync(path.join(ctx.dataDir, 'pictures', 'dracula.jpg'))).toBe(true);
  });

  test('deleting a book removes its uploaded cover', async () => {
    const book = (
      await asAdmin('post', '/api/admin/books').send({ title: 'Temp', author: 'X', price: 1 })
    ).body;
    const withCover = await asAdmin('post', `/api/admin/books/${book.id}/cover`).attach(
      'cover',
      PNG,
      'c.png',
    );
    const file = uploadedFile(withCover.body.coverUrl);
    expect(fs.existsSync(file)).toBe(true);

    expect((await asAdmin('delete', `/api/admin/books/${book.id}`)).status).toBe(204);
    expect(fs.existsSync(file)).toBe(false);
  });

  test('accepts only real images up to 5 MB', async () => {
    const fake = await asAdmin('post', '/api/admin/books/21/cover').attach(
      'cover',
      Buffer.from('<script>'),
      {
        filename: 'evil.jpg',
        contentType: 'image/jpeg',
      },
    );
    expect(fake.status).toBe(400);
    expect(fake.body.error.code).toBe('INVALID_IMAGE');

    const missing = await asAdmin('post', '/api/admin/books/21/cover').field('other', 'x');
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('COVER_REQUIRED');

    const huge = Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)]);
    const tooLarge = await asAdmin('post', '/api/admin/books/21/cover').attach(
      'cover',
      huge,
      'big.jpg',
    );
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.body.error.code).toBe('FILE_TOO_LARGE');

    const unknownBook = await asAdmin('post', '/api/admin/books/999/cover').attach(
      'cover',
      PNG,
      'c.png',
    );
    expect(unknownBook.status).toBe(404);
  });
});

describe('categories', () => {
  test('creates, renames and deletes a category', async () => {
    const created = await asAdmin('post', '/api/admin/categories').send({
      name: 'C# / .NET',
      type: 'language',
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: 'C# / .NET',
      slug: 'c-net',
      type: 'language',
      bookCount: 0,
    });

    const duplicate = await asAdmin('post', '/api/admin/categories').send({
      name: 'Other',
      slug: 'c-net',
      type: 'topic',
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('CATEGORY_EXISTS');

    const renamed = await asAdmin('patch', `/api/admin/categories/${created.body.id}`).send({
      name: 'C#',
    });
    expect(renamed.body).toMatchObject({ name: 'C#', slug: 'c-net' });

    expect((await asAdmin('delete', `/api/admin/categories/${created.body.id}`)).status).toBe(204);
    expect((await asAdmin('delete', `/api/admin/categories/${created.body.id}`)).status).toBe(404);
  });

  test('deleting a category only unlinks its books', async () => {
    expect((await asAdmin('delete', '/api/admin/categories/7')).status).toBe(204); // data-science
    const book = await request(ctx.app).get('/api/books/21');
    expect(book.status).toBe(200);
    expect(book.body.categories.map((c) => c.slug)).toEqual(['python']);
  });
});

describe('orders', () => {
  test('lists all orders including the original guest orders', async () => {
    const res = await asAdmin('get', '/api/admin/orders?status=delivered&limit=50');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(16);
    expect(res.body.items[0]).toMatchObject({ user: null, createdAt: null, status: 'delivered' });
    expect(res.body.items[0].items).toHaveLength(1);
  });

  test('searches by customer name, ignoring diacritics', async () => {
    const res = await asAdmin('get', '/api/admin/orders?q=wojcik');
    expect(res.body.items.map((order) => order.id).sort((a, b) => a - b)).toEqual([4, 16]);
  });

  test('moves an order through its statuses and refuses invalid changes', async () => {
    await request(ctx.app)
      .post('/api/cart/items')
      .set(customer.auth)
      .send({ bookId: 17, quantity: 2 });
    const order = (
      await request(ctx.app)
        .post('/api/orders')
        .set(customer.auth)
        .send({ address: 'ul. Grodzka 40, Lublin' })
    ).body;

    const detail = await asAdmin('get', `/api/admin/orders/${order.id}`);
    expect(detail.body.user).toEqual({
      id: customer.user.id,
      name: customer.user.name,
      email: customer.user.email,
    });

    const shipped = await asAdmin('patch', `/api/admin/orders/${order.id}/status`).send({
      status: 'shipped',
    });
    expect(shipped.status).toBe(200);
    expect(shipped.body.status).toBe('shipped');

    const invalid = await asAdmin('patch', `/api/admin/orders/${order.id}/status`).send({
      status: 'pending',
    });
    expect(invalid.status).toBe(409);
    expect(invalid.body.error).toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
      details: { from: 'shipped', to: 'pending', allowed: ['delivered'] },
    });

    const delivered = await asAdmin('patch', `/api/admin/orders/${order.id}/status`).send({
      status: 'delivered',
    });
    expect(delivered.body.status).toBe('delivered');

    // The customer sees the new status in the order history
    const history = await request(ctx.app).get(`/api/orders/${order.id}`).set(customer.auth);
    expect(history.body.status).toBe('delivered');
  });

  test('cancelling an order returns its books to stock', async () => {
    const stock = () => ctx.db.prepare('SELECT Stock FROM Books WHERE ID = 18').get().Stock;
    await request(ctx.app)
      .post('/api/cart/items')
      .set(customer.auth)
      .send({ bookId: 18, quantity: 3 });
    const before = stock();
    const order = (
      await request(ctx.app)
        .post('/api/orders')
        .set(customer.auth)
        .send({ address: 'ul. Garbary 17/1, Poznań' })
    ).body;
    expect(stock()).toBe(before - 3);

    const res = await asAdmin('patch', `/api/admin/orders/${order.id}/status`).send({
      status: 'cancelled',
    });
    expect(res.body.status).toBe('cancelled');
    expect(stock()).toBe(before);
  });

  test('returns 404 for an unknown order', async () => {
    expect((await asAdmin('get', '/api/admin/orders/9999')).status).toBe(404);
  });
});
