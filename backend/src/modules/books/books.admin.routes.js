import { Router } from 'express';
import { uploadCover } from '../../middleware/upload.js';
import { validate } from '../../middleware/validate.js';
import { idParams } from '../../utils/schemas.js';
import { createBookBody, updateBookBody } from './books.schemas.js';

/** Mounted at /api/admin/books behind requireAuth + requireAdmin. */
export function createBooksAdminRouter({ booksService, coversService }) {
  const router = Router();

  router.post('/', validate({ body: createBookBody }), (req, res) => {
    res.status(201).json(booksService.create(req.validated.body));
  });

  // Also used for stock management (FR-11): PATCH { "stock": 25 }
  router.patch('/:id', validate({ params: idParams, body: updateBookBody }), (req, res) => {
    res.json(booksService.update(req.validated.params.id, req.validated.body));
  });

  router.delete('/:id', validate({ params: idParams }), async (req, res) => {
    const coverPath = booksService.remove(req.validated.params.id);
    await coversService.removeIfUnused(coverPath);
    res.status(204).end();
  });

  // multipart/form-data with the image in the "cover" field
  router.post('/:id/cover', validate({ params: idParams }), uploadCover, async (req, res) => {
    res.json(await coversService.replaceCover(req.validated.params.id, req.file));
  });

  return router;
}
