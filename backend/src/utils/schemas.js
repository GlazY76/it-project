import { z } from 'zod';

// Zod building blocks shared by several modules.

export const idSchema = z.coerce.number().int().positive();

export const idParams = z.object({ id: idSchema });

export const paginationShape = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
};

export const paginationQuery = z.object(paginationShape);

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, digits and hyphens');

export const searchSchema = z.string().trim().max(100);

export const nameSchema = z.string().trim().min(2).max(100);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email('Invalid e-mail address'));

// bcrypt only uses the first 72 bytes of a password
export const passwordSchema = z
  .string()
  .min(8, 'Password must have at least 8 characters')
  .max(72, 'Password must have at most 72 characters');
