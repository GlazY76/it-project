import { unaccent } from '../db/connection.js';

/** "Alice’s Adventures in Wonderland" -> "alices-adventures-in-wonderland" */
export function slugify(text) {
  const slug = unaccent(text)
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
  return slug || 'item';
}
