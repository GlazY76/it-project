import request from 'supertest';
import { createTestContext } from './helpers/test-app.js';

let ctx;
const titles = (res) => res.body.items.map((book) => book.title);

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(() => ctx.cleanup());

describe('GET /api/books', () => {
  test('returns the first page sorted by title', async () => {
    const res = await request(ctx.app).get('/api/books');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, limit: 12, total: 24, totalPages: 2 });
    expect(res.body.items).toHaveLength(12);
    const sorted = [...titles(res)].sort((a, b) =>
      a.localeCompare(b, 'en', { sensitivity: 'base' }),
    );
    expect(titles(res)).toEqual(sorted);
  });

  test('pages do not overlap', async () => {
    const first = await request(ctx.app).get('/api/books?page=1');
    const second = await request(ctx.app).get('/api/books?page=2');
    const ids = [...first.body.items, ...second.body.items].map((book) => book.id);
    expect(new Set(ids).size).toBe(24);
  });

  test('rejects an invalid limit', async () => {
    const res = await request(ctx.app).get('/api/books?limit=500');
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('query.limit');
  });

  test('sorts by price in both directions', async () => {
    const desc = await request(ctx.app).get('/api/books?sort=price&order=desc&limit=1');
    expect(desc.body.items[0]).toMatchObject({
      title: 'Python Data Science Handbook',
      price: 199.99,
    });
    const asc = await request(ctx.app).get('/api/books?sort=price&limit=1');
    expect(asc.body.items[0]).toMatchObject({ title: 'The Time Machine', price: 24.99 });
  });

  test('sorts by year with unknown years last', async () => {
    const res = await request(ctx.app).get('/api/books?sort=year&limit=50');
    expect(res.body.items[0].title).toBe('Eloquent JavaScript');
    expect(res.body.items.at(-1).year).toBeNull();
  });

  test('search ignores case and diacritics: "bronte" finds both Brontë sisters', async () => {
    const res = await request(ctx.app).get('/api/books?q=bronte');
    expect(titles(res).sort()).toEqual(['Jane Eyre', 'Wuthering Heights']);
  });

  test("search treats ’ and ' alike", async () => {
    const res = await request(ctx.app).get("/api/books?q=alice's");
    expect(titles(res)).toEqual(['Alice’s Adventures in Wonderland']);
  });

  test('search matches an ISBN written with hyphens', async () => {
    const res = await request(ctx.app).get('/api/books?q=978-1-4842-0077-3');
    expect(titles(res)).toEqual(['Pro Git']);
  });

  test('LIKE wildcards in the search text are taken literally', async () => {
    const res = await request(ctx.app).get('/api/books?q=%25');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  test('filters by language, topic, level and stock', async () => {
    const js = await request(ctx.app).get('/api/books?language=javascript');
    expect(js.body.total).toBe(4);

    const dataScience = await request(ctx.app).get('/api/books?topic=data-science');
    expect(titles(dataScience)).toEqual(['Python Data Science Handbook']);

    const beginnerPython = await request(ctx.app).get('/api/books?language=python&level=beginner');
    expect(titles(beginnerPython)).toEqual(['A Whirlwind Tour of Python']);

    const outOfStock = await request(ctx.app).get('/api/books?inStock=false');
    expect(titles(outOfStock)).toEqual(['Dive Into Python 3']);

    const inStock = await request(ctx.app).get('/api/books?inStock=true');
    expect(inStock.body.total).toBe(23);
  });

  test('rejects unknown filter values', async () => {
    const res = await request(ctx.app).get('/api/books?level=expert&sort=random');
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field).sort()).toEqual([
      'query.level',
      'query.sort',
    ]);
  });
});

describe('GET /api/books/:id', () => {
  test('returns all book details', async () => {
    const res = await request(ctx.app).get('/api/books/17');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 17,
      title: 'Eloquent JavaScript',
      author: 'Marijn Haverbeke',
      isbn: '9781718504103',
      publisher: 'No Starch Press',
      year: 2024,
      pages: 456,
      level: 'beginner',
      price: 169.99,
      currency: 'PLN',
      stock: 12,
      inStock: true,
      coverUrl: '/pictures/eloquent-javascript.jpg',
    });
    expect(res.body.categories.map((c) => c.slug).sort()).toEqual([
      'javascript',
      'language-fundamentals',
    ]);
    expect(res.body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  test('returns 404 for an unknown book and 400 for an invalid id', async () => {
    const missing = await request(ctx.app).get('/api/books/999');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('BOOK_NOT_FOUND');

    const invalid = await request(ctx.app).get('/api/books/abc');
    expect(invalid.status).toBe(400);
  });
});

describe('GET /api/categories', () => {
  test('lists all categories with book counts', async () => {
    const res = await request(ctx.app).get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(8);
    expect(res.body.find((c) => c.slug === 'classic-literature').bookCount).toBe(15);
  });

  test('filters by type', async () => {
    const res = await request(ctx.app).get('/api/categories?type=language');
    expect(res.body.map(({ slug, bookCount }) => ({ slug, bookCount }))).toEqual([
      { slug: 'javascript', bookCount: 4 },
      { slug: 'python', bookCount: 3 },
    ]);
  });
});
