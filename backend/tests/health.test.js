import request from 'supertest';
import { createTestContext } from './helpers/test-app.js';

let ctx;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(() => ctx.cleanup());

describe('infrastructure', () => {
  test('GET /api/health reports the schema version', async () => {
    const res = await request(ctx.app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', schemaVersion: 6 });
  });

  test('covers are served as static files that other origins may display', async () => {
    const res = await request(ctx.app).get('/pictures/dracula.jpg');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  test('a missing picture returns a JSON 404', async () => {
    const res = await request(ctx.app).get('/pictures/missing.jpg');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('unknown API routes return a JSON 404 with the full path', async () => {
    const res = await request(ctx.app).get('/api/nothing-here?x=1');
    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({
      code: 'NOT_FOUND',
      message: 'Route GET /api/nothing-here not found',
    });
  });

  test('malformed JSON bodies are rejected with 400', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  test('CORS allows the configured frontend origin', async () => {
    const res = await request(ctx.app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  test('API documentation is available', async () => {
    const spec = await request(ctx.app).get('/api/openapi.json');
    expect(spec.status).toBe(200);
    expect(spec.body.openapi).toBe('3.0.3');
    expect(Object.keys(spec.body.paths)).toEqual(expect.arrayContaining(['/books', '/orders']));

    const ui = await request(ctx.app).get('/api/docs/');
    expect(ui.status).toBe(200);
    expect(ui.headers['content-type']).toMatch(/text\/html/);
  });
});
