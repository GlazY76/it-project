import { z } from 'zod';
import { slugSchema } from '../../utils/schemas.js';

export const CATEGORY_TYPES = ['language', 'topic'];

export const listCategoriesQuery = z.object({
  type: z.enum(CATEGORY_TYPES).optional(),
});

const categoryFields = {
  name: z.string().trim().min(1).max(60),
  slug: slugSchema,
  type: z.enum(CATEGORY_TYPES),
};

export const createCategoryBody = z.object({
  ...categoryFields,
  slug: categoryFields.slug.optional(), // generated from the name when omitted
});

export const updateCategoryBody = z
  .object(categoryFields)
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Provide at least one field to update',
  });
