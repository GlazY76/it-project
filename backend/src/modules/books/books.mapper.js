import { fromCents } from '../../utils/money.js';
import { toIsoTimestamp } from '../../utils/sql.js';

/** CoverPath is relative to the data folder ("pictures/dracula.jpg"), served at /pictures/... */
export function toCoverUrl(coverPath) {
  if (!coverPath) return null;
  return /^https?:\/\//.test(coverPath) ? coverPath : `/${coverPath}`;
}

/** Maps a Books row (PascalCase columns) to the API representation. */
export function toBookDto(row, { categories = [], currency }) {
  return {
    id: row.ID,
    title: row.Name,
    author: row.Author,
    description: row.Description,
    isbn: row.Isbn,
    publisher: row.Publisher,
    year: row.Year,
    pages: row.Pages,
    level: row.Level,
    price: fromCents(row.PriceCents),
    currency,
    stock: row.Stock,
    inStock: row.Stock > 0,
    coverUrl: toCoverUrl(row.CoverPath),
    categories,
    createdAt: toIsoTimestamp(row.CreatedAt),
  };
}

/** The short form used inside carts. */
export function toBookSummaryDto(row, currency) {
  return {
    id: row.ID,
    title: row.Name,
    author: row.Author,
    price: fromCents(row.PriceCents),
    currency,
    stock: row.Stock,
    inStock: row.Stock > 0,
    coverUrl: toCoverUrl(row.CoverPath),
  };
}
