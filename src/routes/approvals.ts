import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';

const router = Router();

// GET / — list approvals (stub: no approvals yet)
router.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  // No approvals yet
  res.json({ approvals: [] });
});

export default router;
