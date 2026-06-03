import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import Project from '../models/Project';
import { validateApiKey } from '../utils/api-key';
import { getProjectActiveLanguages } from '../lib/projectLanguages';

const router = Router();

/**
 * GET /v1/locales
 * Public SDK endpoint: the locales a project supports, so an app can render its
 * language picker DYNAMICALLY — a newly-added language goes live the moment it's
 * published, with no app redeploy.
 * Auth: API key via x-api-key header (read:translations or admin:all).
 * Query params:
 *   - projectId (required): the project slug or ObjectId
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    if (!apiKey) {
      return res.status(401).json({ error: 'Missing x-api-key header' });
    }

    const keyData = await validateApiKey(apiKey);
    if (!keyData || !keyData.isValid) {
      return res.status(401).json({ error: keyData?.error || 'Invalid API key' });
    }

    const hasPermission = keyData.permissions?.some(
      (p: string) => p === 'read:translations' || p === 'admin:all'
    );
    if (!hasPermission) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const projectIdParam = req.query.projectId as string;
    if (!projectIdParam) {
      return res.status(400).json({ error: 'Missing required query parameter: projectId' });
    }

    // Resolve projectId — support both ObjectId and slug.
    let resolvedProjectId = projectIdParam;
    if (!mongoose.Types.ObjectId.isValid(resolvedProjectId)) {
      const project = await Project.findOne({ slug: resolvedProjectId });
      if (!project) {
        return res.json({ projectId: projectIdParam, defaultLocale: null, locales: [] });
      }
      resolvedProjectId = project._id.toString();
    }

    // If the API key is project-scoped, enforce it.
    if (keyData.projectId && keyData.projectId !== resolvedProjectId) {
      return res.status(403).json({ error: 'API key not authorized for this project' });
    }

    // The project's active languages (its own list, or the global set as a
    // fallback), already sorted default-first then by name.
    const langs = await getProjectActiveLanguages(resolvedProjectId);
    const locales = langs.map((l: any) => ({
      code: l.code,
      name: l.name,
      nativeName: l.nativeName,
      flag: l.flag,
      direction: l.direction || 'ltr',
      isDefault: !!l.isDefault,
    }));
    const def = locales.find((l) => l.isDefault) || locales[0] || null;

    res.json({
      projectId: projectIdParam,
      defaultLocale: def ? def.code : null,
      locales,
    });
  } catch (error) {
    console.error('Error fetching locales:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
