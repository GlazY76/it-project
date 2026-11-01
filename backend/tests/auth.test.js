import request from 'supertest';
import { createTestContext } from './helpers/test-app.js';

let ctx;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(() => ctx.cleanup());

describe('registration and login', () => {
  test('registers a customer with a normalised e-mail and returns a token', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/register')
      .send({ name: 'Anna Kowalska', email: '  Anna.K@Example.COM ', password: 'secret-password' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      name: 'Anna Kowalska',
      email: 'anna.k@example.com',
      role: 'customer',
    });
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(typeof res.body.token).toBe('string');
  });

  test('rejects a second account with the same e-mail in any letter case', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/register')
      .send({ name: 'Someone Else', email: 'ANNA.K@example.com', password: 'another-password' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  test('validates the registration data', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/register')
      .send({ name: 'A', email: 'not-an-email', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field).sort()).toEqual([
      'body.email',
      'body.name',
      'body.password',
    ]);
  });

  test('logs in with the right password only', async () => {
    const ok = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'anna.k@example.com', password: 'secret-password' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe('anna.k@example.com');

    const wrong = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'anna.k@example.com', password: 'wrong-password' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');

    const unknown = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'secret-password' });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error).toEqual(wrong.body.error);
  });
});

describe('authentication', () => {
  test('GET /api/auth/me returns the user for a valid token', async () => {
    const { user, auth } = await ctx.registerCustomer();
    const res = await request(ctx.app).get('/api/auth/me').set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(user);
  });

  test('missing, malformed and forged tokens are rejected', async () => {
    expect((await request(ctx.app).get('/api/auth/me')).status).toBe(401);
    expect(
      (await request(ctx.app).get('/api/auth/me').set('Authorization', 'Token abc')).status,
    ).toBe(401);
    const forged = await request(ctx.app).get('/api/auth/me').set('Authorization', 'Bearer a.b.c');
    expect(forged.status).toBe(401);
    expect(forged.body.error.code).toBe('UNAUTHORIZED');
  });

  test('a token stops working when its user is deleted', async () => {
    const { user, auth } = await ctx.registerCustomer();
    ctx.db.prepare('DELETE FROM Users WHERE ID = ?').run(user.id);
    expect((await request(ctx.app).get('/api/auth/me').set(auth)).status).toBe(401);
  });

  test('logout responds with 204', async () => {
    const { auth } = await ctx.registerCustomer();
    expect((await request(ctx.app).post('/api/auth/logout').set(auth)).status).toBe(204);
  });
});

describe('profile', () => {
  test('updates the name and e-mail', async () => {
    const { auth } = await ctx.registerCustomer();
    const res = await request(ctx.app)
      .patch('/api/users/me')
      .set(auth)
      .send({ name: 'Jan Wójcik', email: 'Jan.Wojcik@example.com' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Jan Wójcik', email: 'jan.wojcik@example.com' });
    expect((await request(ctx.app).get('/api/users/me').set(auth)).body.name).toBe('Jan Wójcik');
  });

  test('rejects an e-mail that belongs to another account and an empty update', async () => {
    const first = await ctx.registerCustomer();
    const second = await ctx.registerCustomer();
    const taken = await request(ctx.app)
      .patch('/api/users/me')
      .set(second.auth)
      .send({ email: first.user.email });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe('EMAIL_TAKEN');

    const empty = await request(ctx.app).patch('/api/users/me').set(second.auth).send({});
    expect(empty.status).toBe(400);
  });

  test('changes the password after checking the current one', async () => {
    const { user, auth } = await ctx.registerCustomer();
    const wrong = await request(ctx.app)
      .put('/api/users/me/password')
      .set(auth)
      .send({ currentPassword: 'not-my-password', newPassword: 'brand-new-password' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('INVALID_PASSWORD');

    const ok = await request(ctx.app)
      .put('/api/users/me/password')
      .set(auth)
      .send({ currentPassword: 'secret-password', newPassword: 'brand-new-password' });
    expect(ok.status).toBe(204);

    const login = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'brand-new-password' });
    expect(login.status).toBe(200);
  });
});
