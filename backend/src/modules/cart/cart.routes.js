import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { addItemBody, bookIdParams, setQuantityBody } from './cart.schemas.js';

/** Cart of the logged-in user; mounted behind requireAuth. Changes respond with the whole cart. */
export function createCartRouter({ cartService }) {
  const router = Router();

  router.get('/', (req, res) => {
    res.json(cartService.get(req.user.id));
  });

  router.post('/items', validate({ body: addItemBody }), (req, res) => {
    res.json(cartService.addItem(req.user.id, req.validated.body));
  });

  router.patch(
    '/items/:bookId',
    validate({ params: bookIdParams, body: setQuantityBody }),
    (req, res) => {
      const { bookId } = req.validated.params;
      res.json(cartService.setQuantity(req.user.id, bookId, req.validated.body.quantity));
    },
  );

  router.delete('/items/:bookId', validate({ params: bookIdParams }), (req, res) => {
    res.json(cartService.removeItem(req.user.id, req.validated.params.bookId));
  });

  router.delete('/', (req, res) => {
    cartService.clear(req.user.id);
    res.status(204).end();
  });

  return router;
}
