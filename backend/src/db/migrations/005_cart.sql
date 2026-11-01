-- Server-side shopping cart of a logged-in customer (FR-06).
CREATE TABLE CartItems (
    UserId   INTEGER NOT NULL REFERENCES Users(ID) ON DELETE CASCADE,
    BookId   INTEGER NOT NULL REFERENCES Books(ID) ON DELETE CASCADE,
    Quantity INTEGER NOT NULL CHECK (Quantity > 0),
    AddedAt  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (UserId, BookId)
);

CREATE INDEX idx_cartitems_book ON CartItems(BookId);
