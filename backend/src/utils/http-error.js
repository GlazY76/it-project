/** An error that is sent to the client as `{ error: { code, message, details? } }` with `status`. */
export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (code, message, details) => new HttpError(400, code, message, details);

export const unauthorized = (message = 'Authentication required') =>
  new HttpError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'You do not have access to this resource') =>
  new HttpError(403, 'FORBIDDEN', message);

export const notFound = (message = 'Resource not found', code = 'NOT_FOUND') =>
  new HttpError(404, code, message);

export const conflict = (code, message, details) => new HttpError(409, code, message, details);
