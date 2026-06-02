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

    const localeStr = (locale as string).toLowerCase();
    const translations: Record<string, string> = {};
    let servedVersion: string | null = null;

    // If an environment is specified, serve the version that environment is
    // pinned to (its frozen snapshot) — so e.g. production can stay on an older
    // release than staging. Falls back to the latest published set if the env
    // (or its version's snapshot) isn't found.
    const environment = req.query.environment as string | undefined;
    let snapshot: any[] | null = null;
    if (environment) {
      const env = await Environment.findOne({
        projectId: resolvedProjectId,
        slug: (environment as string).toLowerCase(),
        isActive: true,
      });
      if (env) {
        const ver = await Version.findOne({ projectId: resolvedProjectId, version_number: env.version });
        if (ver && Array.isArray((ver as any).snapshot) && (ver as any).snapshot.length) {
          snapshot = (ver as any).snapshot;
          servedVersion = env.version;
        }
      }
    }

    if (snapshot) {
      // Serve the pinned version's frozen content.
      for (const k of snapshot) {
        if (namespace && k.namespaceId !== namespace) continue;
        const v = k.translations?.[localeStr];
        if (v !== undefined && v !== null && v !== '') translations[k.keyPath] = v;
      }
    } else {
      // Default: the latest PUBLISHED set (not the editable draft).
      const query: any = { projectId: resolvedProjectId };
      if (namespace) query.namespaceId = namespace as string; // keys store namespace by name
      const keys = await Key.find(query).lean();
      for (const key of keys) {
        const translation = (key as any).publishedTranslations?.[localeStr];
        if (translation !== undefined && translation !== null && translation !== '') {
          translations[(key as any).keyPath] = translation;
        }
      }
      const versionConfig = await VersionConfig.findOne({ projectId: resolvedProjectId });
      servedVersion = versionConfig?.current_version || null;
    }

    res.json({
      translations,
      version: servedVersion,
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
