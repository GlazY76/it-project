export function toLimitOffset({ page, limit }) {
  return { limit, offset: (page - 1) * limit };
}

/** The common list response: `{ items, page, limit, total, totalPages }`. */
export function pageResult(items, { page, limit, total }) {
  return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
}
