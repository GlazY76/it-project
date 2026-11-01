import { z } from 'zod';
import { emailSchema, nameSchema, passwordSchema } from '../../utils/schemas.js';

export const updateProfileBody = z
  .object({ name: nameSchema.optional(), email: emailSchema.optional() })
  .refine((body) => body.name !== undefined || body.email !== undefined, {
    message: 'Provide a name or an e-mail to update',
  });

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});
