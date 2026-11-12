import { Router } from 'express';
import { paymentController } from '../controllers/paymentController';

const router = Router();

router.get('/', paymentController.getAll);
router.get('/stats', paymentController.getStats);
router.post('/', paymentController.create);
router.put('/:id', paymentController.update);
router.delete('/:id', paymentController.delete);

export default router;