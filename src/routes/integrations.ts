import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';

const router = Router();

/**
 * GET /api/integrations
 * List integrations for a project (stub - returns empty for now)
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  res.json({ integrations: [] });
});

export default router;
