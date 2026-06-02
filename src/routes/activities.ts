import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';

const router = Router();

// GET /activities — activity feed. No activity log is recorded yet, so this
// returns an empty, well-formed page rather than 404ing the Activity view.
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const limit = parseInt(String(req.query.limit ?? '50'), 10) || 50;
  const offset = parseInt(String(req.query.offset ?? '0'), 10) || 0;
  res.json({
    success: true,
    activities: [],
    pagination: { limit, offset, total: 0, hasMore: false },
  });
});

export default router;
