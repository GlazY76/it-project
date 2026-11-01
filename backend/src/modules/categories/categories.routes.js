import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { listCategoriesQuery } from './categories.schemas.js';

export function createCategoriesRouter({ categoriesService }) {
  const router = Router();

  router.get('/', validate({ query: listCategoriesQuery }), (req, res) => {
    res.json(categoriesService.list(req.validated.query));
  });

  return router;
}
