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

/**
 * POST /api/integrations/request
 * Request a new integration. Acknowledged (no processing pipeline yet).
 */
router.post('/request', requireAuth, async (_req: Request, res: Response) => {
  res.json({ success: true, message: 'Your integration request has been received.' });
});

/**
 * PUT/DELETE /api/integrations/slack
 * Slack integration is not wired up yet.
 */
router.put('/slack', requireAuth, (_req: Request, res: Response) => {
  res.status(501).json({ success: false, error: 'Slack integration is not available yet.' });
});
router.delete('/slack', requireAuth, (_req: Request, res: Response) => {
  res.status(501).json({ success: false, error: 'Slack integration is not available yet.' });
});

/**
 * GET /api/integrations/slack/connect
 * OAuth start — this is a full-page browser navigation (no Bearer token), so it
 * has no auth guard. Slack isn't configured, so redirect back to the app with a
 * notice instead of returning JSON.
 */
router.get('/slack/connect', (_req: Request, res: Response) => {
  const base = (process.env.FRONTEND_URL || 'https://kotomot.app').split(',')[0].trim();
  res.redirect(`${base}/integrations?slack=unavailable`);
});

export default router;
