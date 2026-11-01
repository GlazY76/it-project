import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { idParams } from '../../utils/schemas.js';
import { listBooksQuery } from './books.schemas.js';

export function createBooksRouter({ booksService }) {
  const router = Router();

  router.get('/', validate({ query: listBooksQuery }), (req, res) => {
    res.json(booksService.list(req.validated.query));
  });

  router.get('/:id', validate({ params: idParams }), (req, res) => {
    res.json(booksService.getById(req.validated.params.id));
  });

  return router;
}
