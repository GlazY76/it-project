-- Categories by programming language or topic (FR-02), many-to-many with books.
CREATE TABLE Categories (
    ID   INTEGER PRIMARY KEY AUTOINCREMENT,
    Name TEXT NOT NULL,
    Slug TEXT NOT NULL UNIQUE,
    Type TEXT NOT NULL CHECK (Type IN ('language', 'topic'))
);

CREATE TABLE BookCategories (
    BookId     INTEGER NOT NULL REFERENCES Books(ID) ON DELETE CASCADE,
    CategoryId INTEGER NOT NULL REFERENCES Categories(ID) ON DELETE CASCADE,
    PRIMARY KEY (BookId, CategoryId)
);

CREATE INDEX idx_bookcategories_category ON BookCategories(CategoryId);
