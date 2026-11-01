# CodeShelf — Frontend Guide & API Reference
 
Everything the React frontend needs from the backend: how to run it locally, how to connect a Vite
app, the conventions every endpoint shares, ready-to-use TypeScript types and a reference of **all
backend endpoints** with real request and response examples.

- Backend code and details: [`backend/README.md`](backend/README.md)
- Interactive docs (try requests in the browser): <http://localhost:3000/api/docs>
- Machine-readable spec (OpenAPI 3.0): <http://localhost:3000/api/openapi.json>

## Contents

1. [Run the backend locally](#1-run-the-backend-locally)
2. [Connect the React app](#2-connect-the-react-app-vite)
3. [Conventions](#3-conventions)
4. [Authentication](#4-authentication)
5. [Errors](#5-errors)
6. [TypeScript types](#6-typescript-types)
7. [API client example](#7-api-client-example)
8. [Endpoints](#8-endpoints)
9. [Screens and routes](#9-screens-and-routes)
10. [Reference data](#10-reference-data)
11. [Checklist and gotchas](#11-checklist-and-gotchas)

---

## 1. Run the backend locally

Requires **Node.js 22.22 or newer**. The database (`data/shop.db`) and covers (`data/pictures/`) are
already in the repository.

```bash
cd backend
npm install
cp .env.example .env    # set JWT_SECRET to any long random string
npm run dev             # API on http://localhost:3000/api
```

Create an administrator for the admin screens:

```bash
npm run create-admin -- --email admin@codeshelf.local --password 'admin-password'
```

Customers are created through the app (`POST /api/auth/register`). To get the original data back
(24 books, 16 orders, no users), stop the server and run `npm run db:reset -- --yes`.

## 2. Connect the React app (Vite)

Proxy the API and the cover images through the Vite dev server. The app can then use relative URLs
(`/api/...`, `/pictures/...`) and no CORS setup is needed:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/pictures': 'http://localhost:3000',
    },
  },
});
```

Without the proxy, set `VITE_API_URL=http://localhost:3000`, prefix every request **and every
`coverUrl`** with it, and make sure the frontend origin is listed in the backend's `CORS_ORIGIN`
(default `http://localhost:5173`).

## 3. Conventions

| Topic             | Rule                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| Format            | JSON in and out, `camelCase` field names, integer `id`s                                                           |
| Prices            | Decimal numbers in the store currency, e.g. `"price": 169.99, "currency": "PLN"`                                  |
| Dates             | ISO 8601 in UTC, e.g. `"2026-10-25T14:15:07Z"`. Orders imported from the original database have `createdAt: null` |
| Lists             | `{ items, page, limit, total, totalPages }`. `totalPages` is `0` when nothing matches                             |
| Covers            | `coverUrl` is a path like `/pictures/dracula.jpg`, or `null` → show a placeholder                                 |
| Text              | Descriptions are plain text: render them as text, never as HTML                                                   |
| Numbers in bodies | Must be JSON numbers. `"17"` (a string) is rejected with 400, so convert form values with `Number(...)`           |
| Empty responses   | `204 No Content` for logout, password change, emptying the cart and deletions                                     |

Limits enforced by the backend (validate the same in forms):

| Field                            | Limit                             |
| -------------------------------- | --------------------------------- |
| `limit` (page size)              | 1–50, default 12                  |
| Search `q`                       | up to 100 characters              |
| Name                             | 2–100 characters                  |
| Password                         | 8–72 characters                   |
| Delivery address                 | 5–300 characters                  |
| Quantity of one book in the cart | 1–99, and never more than `stock` |
| Cover image                      | JPEG, PNG or WebP, at most 5 MB   |

## 4. Authentication

1. `POST /api/auth/register` or `POST /api/auth/login` returns `{ user, token }`.
2. Keep the token (e.g. in `localStorage`) and send it with every protected request:
   `Authorization: Bearer <token>`.
3. Tokens are valid for **7 days**. Any `401` from a protected endpoint means the session is invalid or
   expired: clear the token and send the user to the login page.
4. Logging out is client-side: delete the token. `POST /api/auth/logout` exists but changes nothing
   on the server. A token also keeps working after a password change until it expires.
5. Show the admin area only when `user.role === 'admin'`. The backend enforces this anyway with
   `403 FORBIDDEN`.
6. Login and registration allow **20 attempts per 15 minutes** per IP address; then `429 TOO_MANY_REQUESTS`.

The cart is stored **on the server per user**, so it needs a login. For guests, keep a local cart
(e.g. in `localStorage`) and after login send each line to `POST /api/cart/items`.

## 5. Errors

Every error has the same shape:

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Only 3 copies of \"Everything curl\" are available",
    "details": [{ "bookId": 24, "title": "Everything curl", "requested": 5, "available": 3 }]
  }
}
```

Branch on `code`, not on `message`. The messages are short English texts you can show as they are.

Validation errors list the invalid fields as `body.<field>`, `query.<field>` or `params.<field>`, or
just `body` when the problem is the request as a whole:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid data",
    "details": [
      { "field": "body.name", "message": "Too small: expected string to have >=2 characters" },
      { "field": "body.email", "message": "Invalid e-mail address" },
      { "field": "body.password", "message": "Password must have at least 8 characters" }
    ]
  }
}
```

| Status | Codes                                                                                                                                                                                      | Typical UI reaction                          |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| 400    | `VALIDATION_ERROR`, `INVALID_JSON`, `CART_EMPTY`, `QUANTITY_LIMIT`, `INVALID_PASSWORD`, `UNKNOWN_CATEGORY`, `COVER_REQUIRED`, `INVALID_IMAGE`, `UPLOAD_ERROR`                              | Show the message or field errors             |
| 401    | `UNAUTHORIZED` (missing, invalid or expired token), `INVALID_CREDENTIALS` (wrong login)                                                                                                    | Log out / show "wrong e-mail or password"    |
| 403    | `FORBIDDEN`                                                                                                                                                                                | The user is not an admin                     |
| 404    | `NOT_FOUND`, `BOOK_NOT_FOUND`, `CATEGORY_NOT_FOUND`, `ORDER_NOT_FOUND`, `CART_ITEM_NOT_FOUND`                                                                                              | "Not found" page or message                  |
| 409    | `EMAIL_TAKEN`, `ISBN_TAKEN`, `CATEGORY_EXISTS`, `INSUFFICIENT_STOCK`, `BOOK_HAS_ORDERS`, `ORDER_NOT_CANCELLABLE`, `ORDER_NOT_PAYABLE`, `PAYMENT_NOT_REQUIRED`, `INVALID_STATUS_TRANSITION` | Explain the conflict; often refresh the data |
| 413    | `FILE_TOO_LARGE`, `PAYLOAD_TOO_LARGE`                                                                                                                                                      | "The file must not be larger than 5 MB"      |
| 429    | `TOO_MANY_REQUESTS`                                                                                                                                                                        | "Too many attempts, try again later"         |
| 500    | `INTERNAL_ERROR`                                                                                                                                                                           | Generic error message                        |

## 6. TypeScript types

```ts
// src/api/types.ts
export type Level = 'beginner' | 'intermediate' | 'advanced';
export type CategoryType = 'language' | 'topic';
export type Role = 'customer' | 'admin';
export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
export type PaymentMethod = 'cod' | 'card'; // cash on delivery | test-mode card payment

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  type: CategoryType;
}

export interface CategoryWithCount extends Category {
  bookCount: number;
}

export interface Book {
  id: number;
  title: string;
  author: string;
  description: string | null;
  isbn: string | null;
  publisher: string | null;
  year: number | null;
  pages: number | null;
  level: Level | null; // null for the classic novels
  price: number;
  currency: string;
  stock: number;
  inStock: boolean;
  coverUrl: string | null;
  categories: Category[];
  createdAt: string;
}

export type BookSummary = Pick<
  Book,
  'id' | 'title' | 'author' | 'price' | 'currency' | 'stock' | 'inStock' | 'coverUrl'
>;

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

export interface AuthResult {
  user: User;
  token: string;
}

export interface CartLine {
  book: BookSummary;
  quantity: number;
  lineTotal: number;
}

export interface Cart {
  items: CartLine[];
  totalQuantity: number;
  total: number;
  currency: string;
}

export interface OrderItem {
  bookId: number;
  title: string;
  author: string;
  coverUrl: string | null;
  quantity: number;
  unitPrice: number; // price at the time of the order
  lineTotal: number;
}

export interface Order {
  id: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  name: string; // recipient
  address: string;
  total: number;
  currency: string;
  createdAt: string | null;
  items: OrderItem[];
}

export interface AdminOrder extends Order {
  user: { id: number; name: string; email: string } | null; // null = guest order from the original data
}

export interface BookInput {
  title: string;
  author: string;
  price: number;
  stock?: number;
  description?: string | null;
  isbn?: string | null;
  publisher?: string | null;
  year?: number | null;
  pages?: number | null;
  level?: Level | null;
  categoryIds?: number[];
}

export type BookUpdate = Partial<BookInput>;

export interface StockShortage {
  bookId: number;
  title: string;
  requested: number;
  available: number;
}

export interface ValidationIssue {
  field: string; // e.g. "body.email"
  message: string;
}
```

Alternatively, types can be generated from the running backend:
`npx openapi-typescript http://localhost:3000/api/openapi.json -o src/api/schema.d.ts`.

## 7. API client example

A small `fetch` wrapper that adds the token, sends JSON and turns error responses into exceptions:

```ts
// src/api/client.ts
const BASE_URL = `${import.meta.env.VITE_API_URL ?? ''}/api`;
const TOKEN_KEY = 'codeshelf.token';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

type Options = Omit<RequestInit, 'body'> & { json?: unknown; body?: BodyInit };

export async function api<T>(
  path: string,
  { json, body, headers, ...init }: Options = {},
): Promise<T> {
  const requestHeaders = new Headers(headers);
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) requestHeaders.set('Authorization', `Bearer ${token}`);
  if (json !== undefined) requestHeaders.set('Content-Type', 'application/json');

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: requestHeaders,
    body: json !== undefined ? JSON.stringify(json) : body,
  });
  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) setToken(null); // the session expired
    const error = data?.error ?? {};
    throw new ApiError(
      res.status,
      error.code ?? 'UNKNOWN',
      error.message ?? res.statusText,
      error.details,
    );
  }
  return data as T;
}

/** Maps VALIDATION_ERROR details to form fields: { email: "Invalid e-mail address" } */
export function fieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError) || err.code !== 'VALIDATION_ERROR') return {};
  return Object.fromEntries(
    (err.details as { field: string; message: string }[]).map((issue) => [
      issue.field.replace(/^(body|query|params)\.?/, ''),
      issue.message,
    ]),
  );
}
```

Usage:

```ts
import { api, ApiError, setToken } from './client';
import type { AuthResult, Book, Cart, Order, Page, StockShortage } from './types';

// Catalog page with filters (keep them in the page URL too, so links can be shared)
const params = new URLSearchParams({ page: '1', sort: 'price', order: 'asc', language: 'python' });
const books = await api<Page<Book>>(`/books?${params}`);

// Login
const { user, token } = await api<AuthResult>('/auth/login', {
  method: 'POST',
  json: { email: 'anna@example.com', password: 'secret-password' },
});
setToken(token);

// Add to cart: every cart endpoint answers with the whole updated cart
const cart = await api<Cart>('/cart/items', { method: 'POST', json: { bookId: 17, quantity: 1 } });

// Checkout
try {
  const order = await api<Order>('/orders', {
    method: 'POST',
    json: { address: 'ul. Długa 8, 80-827 Gdańsk', paymentMethod: 'card' },
  });
  if (order.paymentMethod === 'card') {
    await api<Order>(`/orders/${order.id}/pay`, { method: 'POST' }); // test-mode payment
  }
} catch (err) {
  if (err instanceof ApiError && err.code === 'INSUFFICIENT_STOCK') {
    const shortages = err.details as StockShortage[]; // show "only N left" and reload the cart
  }
}

// Admin: upload a cover (do not set Content-Type yourself; the browser adds the boundary)
const form = new FormData();
form.append('cover', file); // File from <input type="file" accept="image/jpeg,image/png,image/webp">
const updated = await api<Book>(`/admin/books/17/cover`, { method: 'POST', body: form });
```

## 8. Endpoints

All paths start with `/api`, except the cover images under `/pictures`.
**Auth:** – = public, **user** = any logged-in user, **admin** = logged-in administrator.

### Overview

| Method | Path                           | Auth  | Purpose                                                 | FR           |
| ------ | ------------------------------ | ----- | ------------------------------------------------------- | ------------ |
| GET    | `/api/books`                   | –     | Catalog: search, filters, sorting, pages                | FR-01–03     |
| GET    | `/api/books/:id`               | –     | Book details                                            | FR-04        |
| GET    | `/api/categories`              | –     | Categories with book counts                             | FR-02        |
| GET    | `/pictures/:file`              | –     | Cover images                                            | FR-04        |
| POST   | `/api/auth/register`           | –     | Create an account (logs in)                             | FR-05        |
| POST   | `/api/auth/login`              | –     | Log in                                                  | FR-05        |
| POST   | `/api/auth/logout`             | user  | Log out (client deletes the token)                      | FR-05        |
| GET    | `/api/auth/me`                 | user  | Current user                                            | FR-05        |
| GET    | `/api/users/me`                | user  | Profile                                                 | FR-05        |
| PATCH  | `/api/users/me`                | user  | Edit name / e-mail                                      | FR-05        |
| PUT    | `/api/users/me/password`       | user  | Change password                                         | FR-05        |
| GET    | `/api/cart`                    | user  | Cart with totals                                        | FR-06        |
| POST   | `/api/cart/items`              | user  | Add a book                                              | FR-06        |
| PATCH  | `/api/cart/items/:bookId`      | user  | Change quantity                                         | FR-06        |
| DELETE | `/api/cart/items/:bookId`      | user  | Remove a book                                           | FR-06        |
| DELETE | `/api/cart`                    | user  | Empty the cart                                          | FR-06        |
| POST   | `/api/orders`                  | user  | Place an order from the cart                            | FR-07        |
| GET    | `/api/orders`                  | user  | Order history                                           | FR-09        |
| GET    | `/api/orders/:id`              | user  | One order with its status                               | FR-09        |
| POST   | `/api/orders/:id/cancel`       | user  | Cancel a pending order                                  | –            |
| POST   | `/api/orders/:id/pay`          | user  | Test-mode card payment                                  | FR-07        |
| POST   | `/api/admin/books`             | admin | Add a book                                              | FR-10        |
| PATCH  | `/api/admin/books/:id`         | admin | Edit a book, its price, stock or categories             | FR-10, FR-11 |
| DELETE | `/api/admin/books/:id`         | admin | Delete a book                                           | FR-10        |
| POST   | `/api/admin/books/:id/cover`   | admin | Upload a cover                                          | FR-10        |
| POST   | `/api/admin/categories`        | admin | Add a category                                          | FR-10        |
| PATCH  | `/api/admin/categories/:id`    | admin | Edit a category                                         | FR-10        |
| DELETE | `/api/admin/categories/:id`    | admin | Delete a category                                       | FR-10        |
| GET    | `/api/admin/orders`            | admin | All orders                                              | FR-11        |
| GET    | `/api/admin/orders/:id`        | admin | Order details with customer                             | FR-11        |
| PATCH  | `/api/admin/orders/:id/status` | admin | Change order status                                     | FR-11        |
| GET    | `/api/health`                  | –     | Service status `{ "status": "ok", "schemaVersion": 6 }` | –            |

### 8.1 Catalog

#### `GET /api/books`

| Query parameter | Values                                 | Default                                       | Notes                                                                                                                                        |
| --------------- | -------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `page`          | integer ≥ 1                            | `1`                                           |                                                                                                                                              |
| `limit`         | 1–50                                   | `12`                                          |                                                                                                                                              |
| `q`             | text                                   | –                                             | Searches title, author and ISBN. Ignores case and accents: `bronte` finds "Brontë", `alice's` finds "Alice’s"; ISBNs with or without hyphens |
| `language`      | category slug                          | –                                             | e.g. `javascript`, `python`                                                                                                                  |
| `topic`         | category slug                          | –                                             | e.g. `data-science`, `classic-literature`                                                                                                    |
| `level`         | `beginner`, `intermediate`, `advanced` | –                                             | Classic novels have no level                                                                                                                 |
| `inStock`       | `true`, `false`                        | –                                             |                                                                                                                                              |
| `sort`          | `title`, `price`, `year`, `newest`     | `title`                                       | `year` = publication year (unknown years last), `newest` = recently added to the store                                                       |
| `order`         | `asc`, `desc`                          | `asc` for title/price, `desc` for year/newest |                                                                                                                                              |

All filters can be combined. Example: `GET /api/books?language=javascript`

```json
{
  "items": [
    {
      "id": 17,
      "title": "Eloquent JavaScript",
      "author": "Marijn Haverbeke",
      "description": "A modern introduction to programming with JavaScript. Covers the language itself, …",
      "isbn": "9781718504103",
      "publisher": "No Starch Press",
      "year": 2024,
      "pages": 456,
      "level": "beginner",
      "price": 169.99,
      "currency": "PLN",
      "stock": 12,
      "inStock": true,
      "coverUrl": "/pictures/eloquent-javascript.jpg",
      "categories": [
        { "id": 1, "name": "JavaScript", "slug": "javascript", "type": "language" },
        {
          "id": 4,
          "name": "Language fundamentals",
          "slug": "language-fundamentals",
          "type": "topic"
        }
      ],
      "createdAt": "2026-10-25T14:15:07Z"
    }
  ],
  "page": 1,
  "limit": 12,
  "total": 4,
  "totalPages": 1
}
```

Errors: `400 VALIDATION_ERROR` for unknown values (e.g. `level=expert`, `limit=500`).

#### `GET /api/books/:id`

Returns one `Book` (same shape as the list items). Errors: `404 BOOK_NOT_FOUND`, `400` for a non-numeric id.

#### `GET /api/categories`

Optional query: `type=language` or `type=topic`. Returns `CategoryWithCount[]`:

```json
[
  { "id": 1, "name": "JavaScript", "slug": "javascript", "type": "language", "bookCount": 4 },
  { "id": 2, "name": "Python", "slug": "python", "type": "language", "bookCount": 3 }
]
```

Use `slug` as the value of the `language` / `topic` filters.

#### `GET /pictures/:file`

Static images. Use `book.coverUrl` directly as the `<img src>` (with the Vite proxy).

### 8.2 Auth

#### `POST /api/auth/register`

```json
{ "name": "Anna Kowalska", "email": "anna@example.com", "password": "secret-password" }
```

`201` → `AuthResult` (the user is logged in straight away):

```json
{
  "user": {
    "id": 1,
    "name": "Anna Kowalska",
    "email": "anna@example.com",
    "role": "customer",
    "createdAt": "2026-10-25T14:15:07Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIs…"
}
```

E-mails are trimmed and lowercased. Errors: `400 VALIDATION_ERROR`, `409 EMAIL_TAKEN`, `429 TOO_MANY_REQUESTS`.

#### `POST /api/auth/login`

Body `{ "email", "password" }` → `200 AuthResult`. Errors: `401 INVALID_CREDENTIALS` (the same for an
unknown e-mail and a wrong password), `429 TOO_MANY_REQUESTS`.

#### `POST /api/auth/logout` (user)

`204`. Delete the token on the client.

#### `GET /api/auth/me` (user)

`200 User`. Use it on app start to check whether a stored token is still valid.

### 8.3 Profile (user)

| Endpoint                     | Body                                   | Response   | Errors                                                                  |
| ---------------------------- | -------------------------------------- | ---------- | ----------------------------------------------------------------------- |
| `GET /api/users/me`          | –                                      | `200 User` | –                                                                       |
| `PATCH /api/users/me`        | `{ "name"?, "email"? }` (at least one) | `200 User` | `400 VALIDATION_ERROR`, `409 EMAIL_TAKEN`                               |
| `PUT /api/users/me/password` | `{ "currentPassword", "newPassword" }` | `204`      | `400 INVALID_PASSWORD` (wrong current password), `400 VALIDATION_ERROR` |

### 8.4 Cart (user)

Every cart endpoint except `DELETE /api/cart` responds with the **whole updated cart**, so the UI can
replace its cart state with the response. Lines are in the order they were added.

| Endpoint                         | Body                                                             | Response   | Errors                                                               |
| -------------------------------- | ---------------------------------------------------------------- | ---------- | -------------------------------------------------------------------- |
| `GET /api/cart`                  | –                                                                | `200 Cart` | –                                                                    |
| `POST /api/cart/items`           | `{ "bookId": 17, "quantity": 1 }` (quantity optional, default 1) | `200 Cart` | `404 BOOK_NOT_FOUND`, `409 INSUFFICIENT_STOCK`, `400 QUANTITY_LIMIT` |
| `PATCH /api/cart/items/:bookId`  | `{ "quantity": 3 }`                                              | `200 Cart` | `404 CART_ITEM_NOT_FOUND`, `409 INSUFFICIENT_STOCK`                  |
| `DELETE /api/cart/items/:bookId` | –                                                                | `200 Cart` | `404 CART_ITEM_NOT_FOUND`                                            |
| `DELETE /api/cart`               | –                                                                | `204`      | –                                                                    |

`POST /api/cart/items` **adds** to the quantity already in the cart. Use `PATCH` to set an exact
quantity. Example `Cart`:

```json
{
  "items": [
    {
      "book": {
        "id": 17,
        "title": "Eloquent JavaScript",
        "author": "Marijn Haverbeke",
        "price": 169.99,
        "currency": "PLN",
        "stock": 12,
        "inStock": true,
        "coverUrl": "/pictures/eloquent-javascript.jpg"
      },
      "quantity": 2,
      "lineTotal": 339.98
    },
    {
      "book": {
        "id": 12,
        "title": "Jane Eyre",
        "author": "Charlotte Brontë",
        "price": 37.99,
        "currency": "PLN",
        "stock": 8,
        "inStock": true,
        "coverUrl": "/pictures/jane-eyre.jpg"
      },
      "quantity": 1,
      "lineTotal": 37.99
    }
  ],
  "totalQuantity": 3,
  "total": 377.97,
  "currency": "PLN"
}
```

`409 INSUFFICIENT_STOCK` example (`details` is an array of `StockShortage`):

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Only 3 copies of \"Everything curl\" are available",
    "details": [{ "bookId": 24, "title": "Everything curl", "requested": 5, "available": 3 }]
  }
}
```

The cart does not reserve books: stock is checked when adding or changing a line and again at checkout.

### 8.5 Orders (user)

#### `POST /api/orders` — checkout

Turns the cart into an order. The stock is reduced and the cart emptied, so reload or clear the cart
state afterwards.

| Field           | Required | Notes                                                           |
| --------------- | -------- | --------------------------------------------------------------- |
| `address`       | yes      | 5–300 characters                                                |
| `name`          | no       | Recipient, 2–100 characters; defaults to the account name       |
| `paymentMethod` | no       | `cod` (cash on delivery, default) or `card` (test-mode payment) |

`201` → `Order`:

```json
{
  "id": 17,
  "status": "pending",
  "paymentMethod": "card",
  "name": "Anna Kowalska",
  "address": "ul. Długa 8, 80-827 Gdańsk",
  "total": 377.97,
  "currency": "PLN",
  "createdAt": "2026-10-25T14:15:07Z",
  "items": [
    {
      "bookId": 17,
      "title": "Eloquent JavaScript",
      "author": "Marijn Haverbeke",
      "coverUrl": "/pictures/eloquent-javascript.jpg",
      "quantity": 2,
      "unitPrice": 169.99,
      "lineTotal": 339.98
    },
    {
      "bookId": 12,
      "title": "Jane Eyre",
      "author": "Charlotte Brontë",
      "coverUrl": "/pictures/jane-eyre.jpg",
      "quantity": 1,
      "unitPrice": 37.99,
      "lineTotal": 37.99
    }
  ]
}
```

Errors:

- `400 CART_EMPTY`.
- `400 VALIDATION_ERROR`, e.g. a missing address.
- `409 INSUFFICIENT_STOCK`: `details` lists **every** book that is short. Nothing is changed and the cart stays as it was.

#### Other order endpoints

| Endpoint                       | Response                                                       | Errors                                                                              |
| ------------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `GET /api/orders?page=&limit=` | `200 Page<Order>`, newest first                                | –                                                                                   |
| `GET /api/orders/:id`          | `200 Order`                                                    | `404 ORDER_NOT_FOUND`, also for orders of other users                               |
| `POST /api/orders/:id/cancel`  | `200 Order` with status `cancelled`; the books return to stock | `409 ORDER_NOT_CANCELLABLE` (only `pending` orders)                                 |
| `POST /api/orders/:id/pay`     | `200 Order` with status `paid`                                 | `409 PAYMENT_NOT_REQUIRED` (a `cod` order), `409 ORDER_NOT_PAYABLE` (not `pending`) |

`/pay` is a **test-mode stub**: no card data is sent. It stands in for the Stripe test-mode integration
planned for the integration phase.

### 8.6 Admin — books (admin)

Customers get `403 FORBIDDEN` and requests without a token get `401`. The admin book list is the
public `GET /api/books`, which includes books that are out of stock.

Fields for `POST /api/admin/books` (create) and `PATCH /api/admin/books/:id` (edit; send only the
fields that change):

| Field         | Type                                             | On create    | Notes                                                           |
| ------------- | ------------------------------------------------ | ------------ | --------------------------------------------------------------- |
| `title`       | string, 1–200                                    | required     |                                                                 |
| `author`      | string, 1–200                                    | required     |                                                                 |
| `price`       | number, 0–100000                                 | required     | e.g. `189.99`                                                   |
| `stock`       | integer ≥ 0                                      | default `0`  | Stock management (FR-11) is `PATCH { "stock": 25 }`             |
| `description` | string ≤ 5000 or `null`                          | optional     | `""` is stored as `null`                                        |
| `isbn`        | string or `null`                                 | optional     | 10 or 13 digits; hyphens and spaces are removed; must be unique |
| `publisher`   | string ≤ 200 or `null`                           | optional     |                                                                 |
| `year`        | integer 1000–9999 or `null`                      | optional     |                                                                 |
| `pages`       | integer ≥ 1 or `null`                            | optional     |                                                                 |
| `level`       | `beginner`, `intermediate`, `advanced` or `null` | optional     |                                                                 |
| `categoryIds` | integer array (≤ 20)                             | default `[]` | On `PATCH` it **replaces** all categories of the book           |

| Endpoint                          | Response                                                | Errors                                                                                                                       |
| --------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/admin/books`           | `201 Book` (`coverUrl: null` until a cover is uploaded) | `400 VALIDATION_ERROR`, `400 UNKNOWN_CATEGORY`, `409 ISBN_TAKEN`                                                             |
| `PATCH /api/admin/books/:id`      | `200 Book`                                              | the same, plus `404 BOOK_NOT_FOUND`; an empty body is `400`                                                                  |
| `DELETE /api/admin/books/:id`     | `204`                                                   | `404 BOOK_NOT_FOUND`, `409 BOOK_HAS_ORDERS`                                                                                  |
| `POST /api/admin/books/:id/cover` | `200 Book` with the new `coverUrl`                      | `400 COVER_REQUIRED`, `400 INVALID_IMAGE`, `400 UPLOAD_ERROR` (wrong field name), `413 FILE_TOO_LARGE`, `404 BOOK_NOT_FOUND` |

Notes:

- **Delete:** a book that has ever been ordered cannot be deleted. Show the message from the error and
  suggest setting its stock to 0 instead:

  ```json
  {
    "error": {
      "code": "BOOK_HAS_ORDERS",
      "message": "This book appears in orders and cannot be deleted. Set its stock to 0 instead."
    }
  }
  ```

- **Cover upload:** send `multipart/form-data` with the image in the field **`cover`**. JPEG, PNG and
  WebP up to 5 MB are accepted; the type is checked from the file content. Each upload gets a new
  URL, so browsers never show a cached old cover.
- **Creating a book with a cover** takes two requests: `POST /api/admin/books`, then
  `POST /api/admin/books/:id/cover`.

### 8.7 Admin — categories (admin)

| Endpoint                           | Body                                                  | Response                | Errors                                          |
| ---------------------------------- | ----------------------------------------------------- | ----------------------- | ----------------------------------------------- |
| `POST /api/admin/categories`       | `{ "name": "Go", "type": "language", "slug"?: "go" }` | `201 CategoryWithCount` | `409 CATEGORY_EXISTS` (slug in use)             |
| `PATCH /api/admin/categories/:id`  | any of `name`, `slug`, `type`                         | `200 CategoryWithCount` | `404 CATEGORY_NOT_FOUND`, `409 CATEGORY_EXISTS` |
| `DELETE /api/admin/categories/:id` | –                                                     | `204`                   | `404 CATEGORY_NOT_FOUND`                        |

The `slug` is generated from the name when omitted (lowercase letters, digits and hyphens). Deleting
a category does not delete books; they only lose that category.

### 8.8 Admin — orders (admin)

#### `GET /api/admin/orders`

Query: `page`, `limit`, `status` (one `OrderStatus`) and `q`. `q` searches the recipient name, the
address, the customer e-mail and the order number; it ignores accents (`wojcik` finds "Wójcik").
Returns `Page<AdminOrder>`, newest first. Orders from the original database (no date) come last.

```json
{
  "items": [
    {
      "id": 16,
      "status": "delivered",
      "paymentMethod": "cod",
      "name": "Jan Wójcik",
      "address": "ul. Floriańska 5, 31-019 Kraków",
      "total": 39.99,
      "currency": "PLN",
      "createdAt": null,
      "items": [
        {
          "bookId": 3,
          "title": "Dracula",
          "author": "Bram Stoker",
          "coverUrl": "/pictures/dracula.jpg",
          "quantity": 1,
          "unitPrice": 39.99,
          "lineTotal": 39.99
        }
      ],
      "user": null
    }
  ],
  "page": 1,
  "limit": 1,
  "total": 2,
  "totalPages": 2
}
```

`user` is `null` for the 16 guest orders from the original data, otherwise `{ id, name, email }`.

#### `GET /api/admin/orders/:id`

`200 AdminOrder`, or `404 ORDER_NOT_FOUND`.

#### `PATCH /api/admin/orders/:id/status`

Body `{ "status": "shipped" }` → `200 AdminOrder`. Only these changes are allowed, so show only the
matching buttons:

| Current status           | Can change to                  |
| ------------------------ | ------------------------------ |
| `pending`                | `paid`, `shipped`, `cancelled` |
| `paid`                   | `shipped`, `cancelled`         |
| `shipped`                | `delivered`                    |
| `delivered`, `cancelled` | – (final)                      |

Cancelling returns the books to stock. Any other change is rejected:

```json
{
  "error": {
    "code": "INVALID_STATUS_TRANSITION",
    "message": "An order cannot go from \"pending\" to \"delivered\"",
    "details": { "from": "pending", "to": "delivered", "allowed": ["paid", "shipped", "cancelled"] }
  }
}
```

## 9. Screens and routes

The screens from the project plan, with suggested React Router paths and the endpoints each one uses:

| Screen               | Suggested route                                        | Endpoints                                                                                       | Notes                                                                 |
| -------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Catalog / home       | `/`                                                    | `GET /api/books`, `GET /api/categories`                                                         | Keep filters in the URL (`/?q=git&language=javascript&page=2`)        |
| Book details         | `/books/:id`                                           | `GET /api/books/:id`, `POST /api/cart/items`                                                    | Disable "Add to cart" when `inStock` is false; max quantity = `stock` |
| Register / Login     | `/register`, `/login`                                  | `POST /api/auth/register`, `POST /api/auth/login`                                               | Save the token; go back to the previous page                          |
| Profile              | `/profile`                                             | `GET`, `PATCH /api/users/me`, `PUT /api/users/me/password`                                      |                                                                       |
| Cart                 | `/cart`                                                | `GET /api/cart`, `PATCH`, `DELETE /api/cart/items/:bookId`, `DELETE /api/cart`                  | Show the cart badge from `totalQuantity`                              |
| Checkout (≤ 3 steps) | `/checkout`                                            | `POST /api/orders`, then `POST /api/orders/:id/pay` for `card`                                  | 1. review cart, 2. address + payment, 3. confirmation                 |
| Order history        | `/orders`, `/orders/:id`                               | `GET /api/orders`, `GET /api/orders/:id`, `POST /api/orders/:id/cancel`                         | Show "Cancel" only for `pending` orders                               |
| Admin: books         | `/admin/books`, `/admin/books/new`, `/admin/books/:id` | `GET /api/books`, `POST`, `PATCH`, `DELETE /api/admin/books`, `POST /api/admin/books/:id/cover` | Stock is edited with `PATCH { stock }`                                |
| Admin: categories    | `/admin/categories`                                    | `GET /api/categories`, `POST`, `PATCH`, `DELETE /api/admin/categories`                          |                                                                       |
| Admin: orders        | `/admin/orders`, `/admin/orders/:id`                   | `GET /api/admin/orders`, `GET /api/admin/orders/:id`, `PATCH /api/admin/orders/:id/status`      | Filter by status; show only allowed status buttons                    |

Not in the backend yet (integration phase): order confirmation e-mails (FR-08; the frontend shows the
on-screen confirmation), reviews (FR-12), wishlist (FR-13) and Stripe Checkout, which will replace
`/pay`.

## 10. Reference data

Load categories from `GET /api/categories` instead of hard-coding them. Current data:

| Type     | Name (`slug`)                                                                                                                                                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| language | JavaScript (`javascript`), Python (`python`)                                                                                                                                                                                                                             |
| topic    | Classic literature (`classic-literature`), Language fundamentals (`language-fundamentals`), Version control (`version-control`), Functional programming (`functional-programming`), Data science (`data-science`), Command line & networking (`command-line-networking`) |

Suggested labels:

| Value                                    | Label                                  |
| ---------------------------------------- | -------------------------------------- |
| `beginner` / `intermediate` / `advanced` | Beginner / Intermediate / Advanced     |
| `cod` / `card`                           | Cash on delivery / Card (test payment) |
| `pending`                                | Pending                                |
| `paid`                                   | Paid                                   |
| `shipped`                                | Shipped                                |
| `delivered`                              | Delivered                              |
| `cancelled`                              | Cancelled                              |

The catalog has 24 books: 15 classic novels (no level) and 9 programming books. "Dive Into Python 3"
is out of stock, which is handy for testing the out-of-stock state.

Price formatting example: `new Intl.NumberFormat('en', { style: 'currency', currency: book.currency }).format(book.price)`.

## 11. Checklist and gotchas

- [ ] Vite proxy for `/api` **and** `/pictures`.
- [ ] Send `Authorization: Bearer <token>`; on `401` clear the token and redirect to login.
- [ ] Hide admin routes unless `user.role === 'admin'`.
- [ ] Convert numeric form values to numbers before sending (`bookId`, `quantity`, `price`, `stock`, `year`, `pages`, `categoryIds`).
- [ ] Replace cart state with the response of every cart call; clear it after a successful checkout.
- [ ] Handle `INSUFFICIENT_STOCK` both when adding to the cart and at checkout (`details` says what is left).
- [ ] `coverUrl` and `createdAt` can be `null`: show a placeholder image and "—".
- [ ] Never render `description` as HTML.
- [ ] Do not set `Content-Type` when sending `FormData` (cover upload).
- [ ] Use `GET /api/auth/me` on start-up to restore the session from a stored token.
