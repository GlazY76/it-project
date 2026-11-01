import { badRequest } from '../utils/http-error.js';

const PARTS = ['params', 'query', 'body'];

/**
 * Validates request parts with zod schemas, e.g. `validate({ params: idParams, body: bookBody })`.
 * Parsed values are stored in `req.validated` because Express 5 makes `req.query` read-only.
 */
export function validate(schemas) {
  return (req, _res, next) => {
    const validated = {};
    const details = [];

    for (const part of PARTS) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part] ?? {});
      if (result.success) {
        validated[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          details.push({ field: [part, ...issue.path].join('.'), message: issue.message });
        }
      }
    }

    if (details.length > 0) {
      return next(badRequest('VALIDATION_ERROR', 'The request contains invalid data', details));
    }
    req.validated = validated;
    next();
  };
}
