-- Orders with several books, an owner, a status and a payment method (FR-07, FR-09, FR-11).
-- The original Orders.BookId column (NOT NULL) is kept: new orders store their first book there,
-- while OrderItems is the source of truth for what was ordered.
ALTER TABLE Orders ADD COLUMN UserId INTEGER REFERENCES Users(ID) ON DELETE SET NULL;
ALTER TABLE Orders ADD COLUMN Status TEXT NOT NULL DEFAULT 'pending'
    CHECK (Status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled'));
ALTER TABLE Orders ADD COLUMN PaymentMethod TEXT NOT NULL DEFAULT 'cod' CHECK (PaymentMethod IN ('cod', 'card'));
ALTER TABLE Orders ADD COLUMN TotalCents INTEGER NOT NULL DEFAULT 0 CHECK (TotalCents >= 0);
ALTER TABLE Orders ADD COLUMN CreatedAt TEXT;

CREATE TABLE OrderItems (
    ID             INTEGER PRIMARY KEY AUTOINCREMENT,
    OrderId        INTEGER NOT NULL REFERENCES Orders(ID) ON DELETE CASCADE,
    BookId         INTEGER NOT NULL REFERENCES Books(ID) ON DELETE RESTRICT,
    Quantity       INTEGER NOT NULL CHECK (Quantity > 0),
    UnitPriceCents INTEGER NOT NULL CHECK (UnitPriceCents >= 0),
    UNIQUE (OrderId, BookId)
);

CREATE INDEX idx_orderitems_book ON OrderItems(BookId);
CREATE INDEX idx_orders_userid ON Orders(UserId);
CREATE INDEX idx_orders_status ON Orders(Status);

-- Legacy guest orders: one copy of one book each, already delivered and paid in cash.
-- Their original price is unknown, so the current catalog price is used. CreatedAt stays NULL (unknown).
INSERT INTO OrderItems (OrderId, BookId, Quantity, UnitPriceCents)
SELECT o.ID, o.BookId, 1, b.PriceCents
FROM Orders o
JOIN Books b ON b.ID = o.BookId;

UPDATE Orders
SET Status = 'delivered',
    TotalCents = (SELECT COALESCE(SUM(oi.Quantity * oi.UnitPriceCents), 0) FROM OrderItems oi WHERE oi.OrderId = Orders.ID);
