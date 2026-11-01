# CodeShelf — Backend

REST API of the CodeShelf online bookstore: catalog, search, accounts, cart, orders and an admin API.
It runs on **Node.js + Express 5** and stores data in the SQLite database **`../data/shop.db`** using
Node's built-in `node:sqlite` module. Book covers live in `../data/pictures/`.

> **Deviation from the project plan (change request):** the plan names PostgreSQL + Prisma. The course
> provides `data/shop.db` (SQLite), so the backend uses SQLite through `node:sqlite`. No ORM is used;
> all queries are parameterised SQL.

## Quick start

Requirements: **Node.js 22.22 or newer** (`node:sqlite` is built in; nothing to install for the database).

```bash
cd backend
npm install
cp .env.example .env        # then set JWT_SECRET to a long random string
npm run dev                 # http://localhost:3000/api, restarts on file changes
npm run create-admin -- --email admin@codeshelf.local --password 'choose-a-password'
```

- API documentation (Swagger UI): <http://localhost:3000/api/docs>
- Health check: <http://localhost:3000/api/health>
- Covers: <http://localhost:3000/pictures/dracula.jpg>

On the first start, the server backs up the original database to `data/shop.original.db` and then
applies the migrations (see [Database](#database)).

## Scripts

| Command                                                     | What it does                                                                                       |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `npm run dev`                                               | Starts the API with auto-restart (`node --watch`)                                                  |
| `npm start`                                                 | Starts the API                                                                                     |
| `npm test`                                                  | Runs all Jest + Supertest tests (in-memory database, nothing on disk is changed)                   |
| `npm run test:coverage`                                     | Tests with a coverage report (fails below 60%)                                                     |
| `npm run lint` / `npm run format`                           | ESLint / Prettier                                                                                  |
| `npm run db:migrate`                                        | Applies pending migrations (the server also does this on start)                                    |
| `npm run db:reset -- --yes`                                 | Deletes `shop.db` and rebuilds it with the original 24 books and 16 orders (stop the server first) |
| `npm run create-admin -- --email … --password … [--name …]` | Creates an administrator, or promotes an existing user                                             |

## Configuration (`.env`)

| Variable         | Default                 | Meaning                                                        |
| ---------------- | ----------------------- | -------------------------------------------------------------- |
| `PORT`           | `3000`                  | HTTP port                                                      |
| `DATA_DIR`       | `../data`               | Folder with `shop.db` and `pictures/` (relative to `backend/`) |
| `DB_PATH`        | `<DATA_DIR>/shop.db`    | Optional: a different database file                            |
| `JWT_SECRET`     | – (required)            | Secret used to sign login tokens                               |
| `JWT_EXPIRES_IN` | `7d`                    | Token lifetime                                                 |
| `CORS_ORIGIN`    | `http://localhost:5173` | Allowed frontend origins, comma-separated                      |
| `CURRENCY`       | `PLN`                   | Currency code returned with prices                             |
| `MOCK_PAYMENTS`  | `true`                  | Enables `POST /api/orders/:id/pay` (test-mode card payment)    |

## Database

`data/shop.db` originally had two tables, `Books` (24 rows) and `Orders` (16 one-book guest orders).
They are extended by **additive migrations** in `src/db/migrations/`: existing tables, columns and rows
are never removed. `PRAGMA user_version` stores the number of the last applied migration.

| Migration           | Adds                                                                           |
| ------------------- | ------------------------------------------------------------------------------ |
| `001_users`         | `Users` (customers and admins, bcrypt password hashes)                         |
| `002_book_details`  | `Books.Isbn, Publisher, Year, Pages, Level, PriceCents, Stock, CreatedAt`      |
| `003_categories`    | `Categories` (language / topic) and `BookCategories`                           |
| `004_seed_catalog`  | Prices, stock, edition details and categories for the 24 original books        |
| `005_cart`          | `CartItems`                                                                    |
| `006_order_details` | `Orders.UserId, Status, PaymentMethod, TotalCents, CreatedAt` and `OrderItems` |

Good to know:

- Money is stored in integer **grosze** (`PriceCents`); the API returns decimal prices (`169.99`).
- `CHECK (Stock >= 0)` makes overselling impossible even if the code had a bug.
- The 16 original orders became `delivered`, cash-on-delivery orders with one `OrderItem` each, priced
  at the current catalog price. Their date is unknown (`createdAt: null`) and they have no user account.
- `Orders.BookId` (from the original schema) is kept; new orders store their first book there.
  `OrderItems` is the source of truth.
- `src/db/baseline.sql` is a dump of the original `shop.db`. It is used for empty databases (tests,
  `db:reset`), so every environment starts from the same data.
- To add a schema change, create `src/db/migrations/007_something.sql`. It runs once, inside a transaction.
- With `node:sqlite`, a transaction callback (`transaction(db, () => { … })` in `src/db/transaction.js`)
  must be **synchronous**. Do any `await` (e.g. password hashing) before the transaction starts.

### Covers

- `Books.CoverPath` holds a path relative to `data/`, e.g. `pictures/dracula.jpg`. The API exposes it
  as `coverUrl: "/pictures/dracula.jpg"`, served statically by this server.
- Uploads (`POST /api/admin/books/:id/cover`) go to `data/pictures/uploads/`. They must be JPEG, PNG
  or WebP (checked by content) and at most 5 MB.
- An uploaded cover is deleted when it is replaced or its book is deleted. **The original covers in
  `data/pictures/` are never deleted.**

## API overview

All endpoints are under `/api` and use JSON. See `/api/docs` for every field and response.

- **Lists:** `{ items, page, limit, total, totalPages }`, with `?page=1&limit=12` (limit ≤ 50).
- **Errors:** `{ "error": { "code": "INSUFFICIENT_STOCK", "message": "…", "details": … } }`, with
  status 400 (validation), 401, 403, 404, 409 (conflicts) or 413.
- **Authentication:** send `Authorization: Bearer <token>`, using the token from register or login.

| Area             | Endpoints                                                                                                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalog (public) | `GET /books?q=&language=&topic=&level=&inStock=&sort=title\|price\|year\|newest&order=asc\|desc`, `GET /books/:id`, `GET /categories?type=`                                                        |
| Auth             | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`                                                                                                                     |
| Profile          | `GET/PATCH /users/me`, `PUT /users/me/password`                                                                                                                                                    |
| Cart             | `GET /cart`, `POST /cart/items`, `PATCH/DELETE /cart/items/:bookId`, `DELETE /cart`                                                                                                                |
| Orders           | `POST /orders` (checkout from the cart), `GET /orders`, `GET /orders/:id`, `POST /orders/:id/cancel`, `POST /orders/:id/pay`                                                                       |
| Admin            | `POST/PATCH/DELETE /admin/books[/:id]`, `POST /admin/books/:id/cover`, `POST/PATCH/DELETE /admin/categories[/:id]`, `GET /admin/orders`, `GET /admin/orders/:id`, `PATCH /admin/orders/:id/status` |

Search (`q`) ignores letter case and diacritics: "bronte" finds "Brontë", and `alice's` finds "Alice’s".
ISBNs can be typed with or without hyphens.

Example:

```bash
TOKEN=$(curl -s -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"anna@example.com","password":"secret-password"}' | jq -r .token)
curl -X POST localhost:3000/api/cart/items -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"bookId": 17, "quantity": 2}'
curl -X POST localhost:3000/api/orders -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"address": "ul. Długa 8, 80-827 Gdańsk"}'
```

### Order statuses

`pending → paid | shipped | cancelled`, `paid → shipped | cancelled`, `shipped → delivered`.
Cancelling (by an admin, or by the customer while the order is pending) puts the books back in stock.

## Frontend integration (Vite)

Proxy the API and the covers so that the React app can use relative URLs:

```js
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/pictures': 'http://localhost:3000',
    },
  },
});
```

## Project structure

```
src/
  server.js            starts the HTTP server (opens the DB, migrates, listens)
  app.js               createApp({ db, config }): middleware + services, used by the tests
  routes.js            all /api routes
  config.js            environment variables
  db/                  connection, transaction helper, migration runner, baseline + migrations
  middleware/          auth (JWT, admin role), zod validation, upload, error handler
  modules/<feature>/   *.routes.js (HTTP), *.service.js (logic + SQL), *.schemas.js (zod)
  utils/               errors, money, pagination, slugs, SQL helpers
tests/                 Jest + Supertest; each file gets its own in-memory database
docs/openapi.yaml      API specification (served at /api/docs)
scripts/               migrate, reset-db, create-admin
```

## Testing

```bash
npm test                # 86 tests, about 2 seconds
npm run test:coverage
```

Each test file builds an in-memory database from the baseline and migrations, so tests never touch
`data/shop.db`. `migrations.test.js` additionally migrates a temporary copy of the real `shop.db`.

## Next steps (integration phase, PDF weeks 8–9)

- Stripe test mode: replace the `POST /orders/:id/pay` stub with Stripe Checkout and a webhook.
- Order confirmation e-mails (FR-08) with nodemailer.
- Reviews and wishlist (FR-12, FR-13) as new migrations and modules.
- Dockerfile with a persistent volume for `data/`. SQLite needs a persistent disk on the host.
