-- Completes the 24 original books with prices (PLN, in grosze), stock and edition details.
-- ISBN, publisher, year and pages were checked against Open Library; unknown values stay NULL.
-- Statements join on existing rows, so they do nothing for books that are not present.
WITH Seed(ID, Isbn, Publisher, Year, Pages, Level, PriceCents, Stock) AS (VALUES
    (1,  '9780141439518', 'Penguin Classics',        2003, 435,  NULL,           3499,  18),
    (2,  '9780141439471', 'Penguin Classics',        2003, 273,  NULL,           3299,  12),
    (3,  '9780141439846', 'Penguin Classics',        2003, 466,  NULL,           3999,   9),
    (4,  '9780141439570', 'Penguin Classics',        2003, 252,  NULL,           2999,  14),
    (5,  '9780142437247', 'Penguin Classics',        2003, 654,  NULL,           4999,   6),
    (6,  '9780141439761', 'Penguin Classics',        1998, 357,  NULL,           2799,  20),
    (7,  '9780141034355', 'Penguin Books',           2008, 384,  NULL,           3699,  11),
    (8,  '9780141439563', 'Penguin Classics',        2003, 514,  NULL,           3999,   7),
    (9,  '9780141439556', 'Penguin Classics',        2003, 416,  NULL,           3499,  10),
    (10, '9780141439976', 'Penguin Classics',        2005, 144,  NULL,           2499,  15),
    (11, '9780141321004', 'Puffin Classics',         2008, 336,  NULL,           2999,  13),
    (12, '9780141441146', 'Penguin Classics',        2006, 578,  NULL,           3799,   8),
    (13, '9780140449136', 'Penguin Classics',        2003, 671,  NULL,           4499,   5),
    (14, '9780143039563', 'Penguin Classics',        2005, NULL, NULL,           2999,  12),
    (15, '9780141321028', 'Puffin Classics',         2008, 224,  NULL,           2799,  10),
    (16, '9781484200773', 'Apress',                  2014, 426,  'beginner',     14999,  7),
    (17, '9781718504103', 'No Starch Press',         2024, 456,  'beginner',     16999, 12),
    (18, '9798602477429', 'Independently published', 2020, 126,  'beginner',      5999,  9),
    (19, '9798621536459', 'Independently published', 2020, NULL, 'intermediate',  7999,  6),
    (20, NULL,            'Independently published', NULL, NULL, 'intermediate',  4999,  4),
    (21, '9781491912058', 'O''Reilly Media',         2016, 548,  'intermediate', 19999,  5),
    (22, NULL,            'O''Reilly Media',         2016, NULL, 'beginner',      3999, 14),
    (23, '9781430224150', 'Apress',                  2009, 360,  'intermediate', 12999,  0),
    (24, NULL,            'Independently published', NULL, NULL, 'intermediate',  6999,  3)
)
UPDATE Books
SET Isbn = Seed.Isbn,
    Publisher = Seed.Publisher,
    Year = Seed.Year,
    Pages = Seed.Pages,
    Level = Seed.Level,
    PriceCents = Seed.PriceCents,
    Stock = Seed.Stock
FROM Seed
WHERE Books.ID = Seed.ID;

INSERT INTO Categories (Name, Slug, Type) VALUES
    ('JavaScript',                'javascript',              'language'),
    ('Python',                    'python',                  'language'),
    ('Classic literature',        'classic-literature',      'topic'),
    ('Language fundamentals',     'language-fundamentals',   'topic'),
    ('Version control',           'version-control',         'topic'),
    ('Functional programming',    'functional-programming',  'topic'),
    ('Data science',              'data-science',            'topic'),
    ('Command line & networking', 'command-line-networking', 'topic');

WITH Links(BookId, Slug) AS (VALUES
    (1, 'classic-literature'), (2, 'classic-literature'), (3, 'classic-literature'),
    (4, 'classic-literature'), (5, 'classic-literature'), (6, 'classic-literature'),
    (7, 'classic-literature'), (8, 'classic-literature'), (9, 'classic-literature'),
    (10, 'classic-literature'), (11, 'classic-literature'), (12, 'classic-literature'),
    (13, 'classic-literature'), (14, 'classic-literature'), (15, 'classic-literature'),
    (16, 'version-control'),
    (17, 'javascript'), (17, 'language-fundamentals'),
    (18, 'javascript'), (18, 'language-fundamentals'),
    (19, 'javascript'), (19, 'language-fundamentals'),
    (20, 'javascript'), (20, 'functional-programming'),
    (21, 'python'), (21, 'data-science'),
    (22, 'python'), (22, 'language-fundamentals'),
    (23, 'python'), (23, 'language-fundamentals'),
    (24, 'command-line-networking')
)
INSERT INTO BookCategories (BookId, CategoryId)
SELECT b.ID, c.ID
FROM Links l
JOIN Books b ON b.ID = l.BookId
JOIN Categories c ON c.Slug = l.Slug;
