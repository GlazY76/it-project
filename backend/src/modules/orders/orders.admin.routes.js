import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { idParams } from '../../utils/schemas.js';
import { adminOrdersQuery, statusBody } from './orders.schemas.js';

/** Mounted at /api/admin/orders behind requireAuth + requireAdmin. */
export function createOrdersAdminRouter({ ordersService }) {
  const router = Router();

  router.get('/', validate({ query: adminOrdersQuery }), (req, res) => {
    res.json(ordersService.list(req.validated.query));
  });

  router.get('/:id', validate({ params: idParams }), (req, res) => {
    res.json(ordersService.getById(req.validated.params.id));
  });

  router.patch('/:id/status', validate({ params: idParams, body: statusBody }), (req, res) => {
    res.json(ordersService.changeStatus(req.validated.params.id, req.validated.body.status));
  });

  return router;
}
