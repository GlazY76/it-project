import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { idParams, paginationQuery } from '../../utils/schemas.js';
import { checkoutBody } from './orders.schemas.js';

/** Orders of the logged-in customer; mounted behind requireAuth. */
export function createOrdersRouter({ ordersService }, config) {
  const router = Router();

  router.post('/', validate({ body: checkoutBody }), (req, res) => {
    const { name, address, paymentMethod } = req.validated.body;
    const order = ordersService.checkout(req.user.id, {
      name: name ?? req.user.name,
      address,
      paymentMethod,
    });
    res.status(201).json(order);
  });

  router.get('/', validate({ query: paginationQuery }), (req, res) => {
    res.json(ordersService.listForUser(req.user.id, req.validated.query));
  });

  router.get('/:id', validate({ params: idParams }), (req, res) => {
    res.json(ordersService.getForUser(req.user.id, req.validated.params.id));
  });

  router.post('/:id/cancel', validate({ params: idParams }), (req, res) => {
    res.json(ordersService.cancelForUser(req.user.id, req.validated.params.id));
  });

  if (config.mockPayments) {
    router.post('/:id/pay', validate({ params: idParams }), (req, res) => {
      res.json(ordersService.payForUser(req.user.id, req.validated.params.id));
    });
  }

  return router;
}
