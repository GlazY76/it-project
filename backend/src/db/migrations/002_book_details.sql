-- Catalog fields needed by FR-02..FR-04 and FR-11.
-- Money is stored in integer grosze; CHECK (Stock >= 0) makes overselling impossible at the database level.
-- SQLite cannot add a column with DEFAULT CURRENT_TIMESTAMP, so CreatedAt is backfilled here and set by the app.
ALTER TABLE Books ADD COLUMN Isbn TEXT;                 -- 10 or 13 characters, no hyphens
ALTER TABLE Books ADD COLUMN Publisher TEXT;
ALTER TABLE Books ADD COLUMN Year INTEGER;              -- publication year of the edition sold
ALTER TABLE Books ADD COLUMN Pages INTEGER CHECK (Pages > 0);
ALTER TABLE Books ADD COLUMN Level TEXT CHECK (Level IN ('beginner', 'intermediate', 'advanced'));
ALTER TABLE Books ADD COLUMN PriceCents INTEGER NOT NULL DEFAULT 0 CHECK (PriceCents >= 0);
ALTER TABLE Books ADD COLUMN Stock INTEGER NOT NULL DEFAULT 0 CHECK (Stock >= 0);
ALTER TABLE Books ADD COLUMN CreatedAt TEXT;

UPDATE Books SET CreatedAt = CURRENT_TIMESTAMP WHERE CreatedAt IS NULL;

CREATE UNIQUE INDEX idx_books_isbn ON Books(Isbn) WHERE Isbn IS NOT NULL;
CREATE INDEX idx_books_author ON Books(Author);
CREATE INDEX idx_books_price ON Books(PriceCents);
