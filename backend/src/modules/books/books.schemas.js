import { z } from 'zod';
import { paginationShape, searchSchema, slugSchema } from '../../utils/schemas.js';

export const LEVELS = ['beginner', 'intermediate', 'advanced'];
export const SORTS = ['title', 'price', 'year', 'newest'];

export const listBooksQuery = z.object({
  ...paginationShape,
  q: searchSchema.optional(),
  language: slugSchema.optional(),
  topic: slugSchema.optional(),
  level: z.enum(LEVELS).optional(),
  inStock: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  sort: z.enum(SORTS).default('title'),
  order: z.enum(['asc', 'desc']).optional(),
});

// Empty strings become NULL so that a cleared form field clears the column
const nullableText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable();

const isbnSchema = z
  .string()
  .transform((value) => value.replace(/[\s-]/g, '').toUpperCase() || null)
  .pipe(
    z
      .string()
      .regex(/^(\d{9}[\dX]|\d{13})$/, 'ISBN must have 10 or 13 digits')
      .nullable(),
  );

const bookFields = {
  title: z.string().trim().min(1).max(200),
  author: z.string().trim().min(1).max(200),
  description: nullableText(5000),
  isbn: isbnSchema.nullable(),
  publisher: nullableText(200),
  year: z.number().int().min(1000).max(9999).nullable(),
  pages: z.number().int().min(1).max(100000).nullable(),
  level: z.enum(LEVELS).nullable(),
  price: z.number().min(0).max(100000),
  stock: z.number().int().min(0).max(1000000),
  categoryIds: z.array(z.number().int().positive()).max(20),
};

export const createBookBody = z.object({
  title: bookFields.title,
  author: bookFields.author,
  price: bookFields.price,
  description: bookFields.description.optional(),
  isbn: bookFields.isbn.optional(),
  publisher: bookFields.publisher.optional(),
  year: bookFields.year.optional(),
  pages: bookFields.pages.optional(),
  level: bookFields.level.optional(),
  stock: bookFields.stock.default(0),
  categoryIds: bookFields.categoryIds.default([]),
});

export const updateBookBody = z
  .object(bookFields)
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Provide at least one field to update',
  });
