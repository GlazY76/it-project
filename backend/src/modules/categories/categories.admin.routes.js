import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { idParams } from '../../utils/schemas.js';
import { createCategoryBody, updateCategoryBody } from './categories.schemas.js';

/** Mounted at /api/admin/categories behind requireAuth + requireAdmin. */
export function createCategoriesAdminRouter({ categoriesService }) {
  const router = Router();

  router.post('/', validate({ body: createCategoryBody }), (req, res) => {
    res.status(201).json(categoriesService.create(req.validated.body));
  });

  router.patch('/:id', validate({ params: idParams, body: updateCategoryBody }), (req, res) => {
    res.json(categoriesService.update(req.validated.params.id, req.validated.body));
  });

  router.delete('/:id', validate({ params: idParams }), (req, res) => {
    categoriesService.remove(req.validated.params.id);
    res.status(204).end();
  });

  return router;
}
