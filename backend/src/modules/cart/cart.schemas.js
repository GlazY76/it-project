import { z } from 'zod';
import { idSchema } from '../../utils/schemas.js';
import { MAX_ITEM_QUANTITY } from './cart.service.js';

const quantitySchema = z.number().int().min(1).max(MAX_ITEM_QUANTITY);

export const bookIdParams = z.object({ bookId: idSchema });

export const addItemBody = z.object({
  bookId: z.number().int().positive(),
  quantity: quantitySchema.default(1),
});

export const setQuantityBody = z.object({ quantity: quantitySchema });
