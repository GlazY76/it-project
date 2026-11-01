-- Customer and administrator accounts (FR-05; the admin role protects FR-10/FR-11).
CREATE TABLE Users (
    ID           INTEGER PRIMARY KEY AUTOINCREMENT,
    Name         TEXT NOT NULL,
    Email        TEXT NOT NULL UNIQUE COLLATE NOCASE,
    PasswordHash TEXT NOT NULL,
    Role         TEXT NOT NULL DEFAULT 'customer' CHECK (Role IN ('customer', 'admin')),
    CreatedAt    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
