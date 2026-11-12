import { Router } from 'express';
import paymentsRouter from './payments';
import categoriesRouter from './categories';

const router = Router();

router.use('/api/payments', paymentsRouter);
router.use('/api/categories', categoriesRouter);

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

export default router;