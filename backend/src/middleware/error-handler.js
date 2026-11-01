import multer from 'multer';
import { HttpError } from '../utils/http-error.js';
import { isConstraintError } from '../utils/sql.js';

export function notFoundHandler(req, _res, next) {
  const path = req.originalUrl.split('?')[0];
  next(new HttpError(404, 'NOT_FOUND', `Route ${req.method} ${path} not found`));
}

/** Sends every error as `{ error: { code, message, details? } }`; unexpected errors are logged. */
export function createErrorHandler({ logger = console } = {}) {
  return (err, req, res, next) => {
    const { status, code, message, details } = describeError(err);
    if (status >= 500) logger.error(err);
    if (res.headersSent) return next(err);
    res
      .status(status)
      .json({ error: details === undefined ? { code, message } : { code, message, details } });
  };
}

function describeError(err) {
  if (err instanceof HttpError) return err;

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return {
        status: 413,
        code: 'FILE_TOO_LARGE',
        message: 'The file must not be larger than 5 MB',
      };
    }
    return { status: 400, code: 'UPLOAD_ERROR', message: err.message };
  }

  // Errors raised by express.json()
  if (err.type === 'entity.parse.failed') {
    return { status: 400, code: 'INVALID_JSON', message: 'The request body is not valid JSON' };
  }
  if (err.type === 'entity.too.large') {
    return { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'The request body is too large' };
  }
  if (err.expose && err.status >= 400 && err.status < 500) {
    return { status: err.status, code: 'BAD_REQUEST', message: err.message };
  }

  // Safety net: services validate first, but the database constraints have the final word
  if (isConstraintError(err)) {
    if (err.message.includes('FOREIGN KEY')) {
      return {
        status: 409,
        code: 'REFERENCE_CONFLICT',
        message: 'The resource is referenced by other records',
      };
    }
    if (err.message.includes('UNIQUE')) {
      return {
        status: 409,
        code: 'DUPLICATE',
        message: 'A record with the same value already exists',
      };
    }
    return {
      status: 400,
      code: 'CONSTRAINT_VIOLATION',
      message: 'The data violates a database rule',
    };
  }

  return { status: 500, code: 'INTERNAL_ERROR', message: 'Something went wrong' };
}
