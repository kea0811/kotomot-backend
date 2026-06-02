import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { Key } from '../models/Key';
import Project from '../models/Project';
import { Environment } from '../models/Environment';
import { Version, VersionConfig } from '../models/Version';
import { validateApiKey } from '../utils/api-key';

const router = Router();

/**
 * GET /v1/translations
 * Public SDK endpoint for fetching translations by locale and project.
 * Auth: API key via x-api-key header
 * Query params:
 *   - projectId (required): The project slug or ObjectId
 *   - locale (required): The locale code (e.g. 'en', 'zh-Hant')
 *   - namespace (optional): Filter by namespace name
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    if (!apiKey) {
      return res.status(401).json({ error: 'Missing x-api-key header' });
    }

    // Validate the API key
    const keyData = await validateApiKey(apiKey);
    if (!keyData || !keyData.isValid) {
      return res.status(401).json({ error: keyData?.error || 'Invalid API key' });
    }

    // Check permissions
    const hasPermission = keyData.permissions?.some(
      (p: string) => p === 'read:translations' || p === 'admin:all'
    );
    if (!hasPermission) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { projectId: projectIdParam, locale, namespace } = req.query;

    if (!projectIdParam || !locale) {
      return res.status(400).json({
        error: 'Missing required query parameters: projectId and locale'
      });
    }

    // Resolve projectId - support both ObjectId and slug
    let resolvedProjectId = projectIdParam as string;

    if (!mongoose.Types.ObjectId.isValid(resolvedProjectId)) {
      // Treat as slug, look up the project
      const project = await Project.findOne({ slug: resolvedProjectId });
      if (!project) {
        return res.json({});
      }
      resolvedProjectId = project._id.toString();
    }

    // If API key is project-scoped, enforce it
    if (keyData.projectId && keyData.projectId !== resolvedProjectId) {
      return res.status(403).json({ error: 'API key not authorized for this project' });
    }

    // Gate: the project must have been "published" — satisfied by EITHER an
    // active environment OR at least one version (the "Create Version" action).
    const published =
      (await Environment.exists({ projectId: resolvedProjectId, isActive: true })) ||
      (await Version.exists({ projectId: resolvedProjectId }));
    if (!published) {
      return res.status(403).json({
        error: 'This project has no published version yet. Create a version (or an active environment) before accessing translations.'
      });
    }

    // Build query
    const query: any = { projectId: resolvedProjectId };

    // Keys store the namespace by NAME in `namespaceId`, so filter by name directly.
    if (namespace) {
      query.namespaceId = namespace as string;
    }

    // Fetch all keys for this project
    const keys = await Key.find(query).lean();

    // Build flat translation map: { keyPath: translated text }
    const translations: Record<string, string> = {};

    for (const key of keys) {
      const localeStr = (locale as string).toLowerCase();
      const translation = (key as any).translations?.[localeStr];
      if (translation !== undefined && translation !== null && translation !== '') {
        translations[(key as any).keyPath] = translation;
      }
    }

    // Get current version for this project
    const versionConfig = await VersionConfig.findOne({ projectId: resolvedProjectId });

    res.json({
      translations,
      version: versionConfig?.current_version || null,
    });
  } catch (error) {
    console.error('Error fetching translations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /v1/translations/version
 * Lightweight endpoint that returns only the current version for a project.
 * SDK uses this to check if cached translations are stale.
 * Auth: API key via x-api-key header
 * Query params:
 *   - projectId (required): The project slug or ObjectId
 */
router.get('/version', async (req: Request, res: Response) => {
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

    const { projectId: projectIdParam } = req.query;

    if (!projectIdParam) {
      return res.status(400).json({ error: 'Missing required query parameter: projectId' });
    }

    // Resolve projectId
    let resolvedProjectId = projectIdParam as string;

    if (!mongoose.Types.ObjectId.isValid(resolvedProjectId)) {
      const project = await Project.findOne({ slug: resolvedProjectId });
      if (!project) {
        return res.json({ version: null });
      }
      resolvedProjectId = project._id.toString();
    }

    // If API key is project-scoped, enforce it
    if (keyData.projectId && keyData.projectId !== resolvedProjectId) {
      return res.status(403).json({ error: 'API key not authorized for this project' });
    }

    const versionConfig = await VersionConfig.findOne({ projectId: resolvedProjectId });

    res.json({ version: versionConfig?.current_version || null });
  } catch (error) {
    console.error('Error fetching version:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
