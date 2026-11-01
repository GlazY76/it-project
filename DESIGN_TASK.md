# CodeShelf — Design Task: Pages for the Web Interface (Figma)

CodeShelf is an online bookstore for programming books (it also sells some classic novels).
Please design the pages listed below in Figma. The visual style, layout and components are up to you.
This list only says **which pages exist and what each one has to contain**.

General requirements from the project plan:

- Desktop and mobile versions (the layout must work from 360 px wide).
- English only.
- Checkout takes no more than 3 steps.
- Prices are in PLN.

---

## Shared elements (on every page)

- **Header:** logo, search field, cart icon with the number of items, Login/Register (or the user's
  name with links to Profile, My orders and Log out), and a link to the Admin panel for admins only.
- **Footer.**

---

## Customer pages

### 1. Catalog (home page)
- Book list with paging.
- Search by title, author or ISBN.
- Filters: programming language, topic, level (beginner / intermediate / advanced), "in stock only".
- Sorting: title, price, publication year, newest.
- Book card: cover, title, author, price, "Add to cart" button, out-of-stock state.
- "No books found" state.

### 2. Book details
- Cover, title, author, description.
- Publisher, year, pages, ISBN, level, categories.
- Price and availability (in stock / out of stock).
- Quantity selector and "Add to cart" button.

### 3. Login
- E-mail, password, "Log in" button, link to Register, error message for wrong credentials.

### 4. Register
- Name, e-mail, password, "Create account" button, link to Login, field error messages.

### 5. Cart
- List of books: cover, title, author, price, quantity selector, remove button, line total.
- Order total and "Checkout" button.
- Empty cart state.
- Message when there are not enough copies in stock.

### 6. Checkout (3 steps)
1. **Review:** books, quantities and total.
2. **Delivery and payment:** recipient name, delivery address, payment method
   (cash on delivery / card — test payment).
3. **Confirmation:** "Thank you" message, order number, ordered books, total, status.

### 7. Profile
- Edit name and e-mail.
- Change password (current password, new password).

### 8. My orders
- List of orders: order number, date, status, number of books, total.
- Empty state ("You have no orders yet").

### 9. Order details
- Order number, date, status, payment method, recipient and address.
- Books with quantity, price and line total; order total.
- "Cancel order" button (only for pending orders), "Pay" button (only for unpaid card orders).

---

## Admin pages (only for administrators)

### 10. Admin — Books
- Table: cover, title, author, price, stock, actions (edit, delete).
- Search and "Add book" button.

### 11. Admin — Add / Edit book
- Form: title, author, description, ISBN, publisher, year, pages, level, price, stock, categories.
- Cover image upload with preview.
- Save and Delete buttons.
- Message when a book cannot be deleted because it has been ordered.

### 12. Admin — Categories
- List of categories: name, type (language / topic), number of books.
- Add, edit and delete a category.

### 13. Admin — Orders
- Table: order number, date, customer, total, status.
- Filter by status and search (customer name, e-mail, address, order number).

### 14. Admin — Order details
- Customer (name, e-mail), recipient, address, payment method.
- Ordered books with quantities and prices, total.
- Status change: pending → paid / shipped / cancelled, paid → shipped / cancelled,
  shipped → delivered.

---

## Other

### 15. Page not found (404)

Also please show these states somewhere in the design: loading, error messages and success
notifications (e.g. "Added to cart").
