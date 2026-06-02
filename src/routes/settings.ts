import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';

const router = Router();

// GET /settings/check-ai-access — does the user have AI translation access?
// No AI provider is wired up in this deployment yet, so access is false and the
// UI hides its AI features.
router.get('/check-ai-access', requireAuth, (_req: Request, res: Response) => {
  res.json({ success: true, hasAccess: false });
});

// GET /settings/ai-provider — the user's saved AI provider config.
// Not implemented yet → no settings (the form stays at defaults).
router.get('/ai-provider', requireAuth, (_req: Request, res: Response) => {
  res.json({ success: true, settings: null });
});

// POST /settings/ai-provider — save AI provider config. Not available yet.
router.post('/ai-provider', requireAuth, (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'AI provider configuration is not available in this deployment yet.',
  });
});

export default router;
