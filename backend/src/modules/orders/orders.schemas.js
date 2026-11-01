import { z } from 'zod';
import { paginationShape, searchSchema } from '../../utils/schemas.js';

export const ORDER_STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];
export const PAYMENT_METHODS = ['cod', 'card'];

export const checkoutBody = z.object({
  name: z.string().trim().min(2).max(100).optional(), // recipient; defaults to the user's name
  address: z.string().trim().min(5).max(300),
  paymentMethod: z.enum(PAYMENT_METHODS).default('cod'),
});

export const adminOrdersQuery = z.object({
  ...paginationShape,
  status: z.enum(ORDER_STATUSES).optional(),
  q: searchSchema.optional(),
});

export const statusBody = z.object({ status: z.enum(ORDER_STATUSES) });
