import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';

const router = Router();

// GET /count — get review count (stub: no reviews yet)
router.get('/count', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  // No reviews yet
  res.json({ count: 0 });
});

export default router;
