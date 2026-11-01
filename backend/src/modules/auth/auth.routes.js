import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../../middleware/validate.js';
import { HttpError } from '../../utils/http-error.js';
import { loginBody, registerBody } from './auth.schemas.js';

/** Limits brute-force attempts: 20 requests per 15 minutes per IP address and route. */
function createLimiter(enabled) {
  if (!enabled) return (_req, _res, next) => next();
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new HttpError(429, 'TOO_MANY_REQUESTS', 'Too many attempts, please try again later')),
  });
}

export function createAuthRouter({ authService, auth, config }) {
  const router = Router();

  router.post(
    '/register',
    createLimiter(config.rateLimit),
    validate({ body: registerBody }),
    async (req, res) => {
      res.status(201).json(await authService.register(req.validated.body));
    },
  );

  router.post(
    '/login',
    createLimiter(config.rateLimit),
    validate({ body: loginBody }),
    async (req, res) => {
      res.json(await authService.login(req.validated.body));
    },
  );

  // JWTs are stateless: the client discards its token. The endpoint exists for a symmetric API.
  router.post('/logout', auth.requireAuth, (_req, res) => {
    res.status(204).end();
  });

  router.get('/me', auth.requireAuth, (req, res) => {
    res.json(req.user);
  });

  return router;
}
