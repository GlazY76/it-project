import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { changePasswordBody, updateProfileBody } from './users.schemas.js';

/** Profile of the logged-in user; mounted behind requireAuth. */
export function createUsersRouter({ usersService, authService }) {
  const router = Router();

  router.get('/me', (req, res) => {
    res.json(req.user);
  });

  router.patch('/me', validate({ body: updateProfileBody }), (req, res) => {
    res.json(usersService.updateProfile(req.user.id, req.validated.body));
  });

  router.put('/me/password', validate({ body: changePasswordBody }), async (req, res) => {
    await authService.changePassword(req.user.id, req.validated.body);
    res.status(204).end();
  });

  return router;
}
