import jwt from 'jsonwebtoken';
import { forbidden, unauthorized } from '../utils/http-error.js';

export function createAuthMiddleware({ usersService, config }) {
  /** Requires `Authorization: Bearer <JWT>` and sets `req.user`. */
  function requireAuth(req, _res, next) {
    const match = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') ?? '');
    if (!match) return next(unauthorized());

    let payload;
    try {
      payload = jwt.verify(match[1], config.jwt.secret, { algorithms: ['HS256'] });
    } catch {
      return next(unauthorized('Invalid or expired token'));
    }

    // The user is reloaded on every request, so deleted accounts and role changes apply immediately
    const user = usersService.findById(Number(payload.sub));
    if (!user) return next(unauthorized('Invalid or expired token'));
    req.user = user;
    next();
  }

  /** Must run after requireAuth. */
  function requireAdmin(req, _res, next) {
    if (req.user?.role !== 'admin') return next(forbidden('Administrator access required'));
    next();
  }

  return { requireAuth, requireAdmin };
}
