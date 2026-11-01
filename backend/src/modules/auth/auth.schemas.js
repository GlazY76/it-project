import { z } from 'zod';
import { emailSchema, nameSchema, passwordSchema } from '../../utils/schemas.js';

export const registerBody = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const loginBody = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});
