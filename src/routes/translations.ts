import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import connectDB from '../lib/db';
import { Key } from '../models/Key';
import Language from '../models/Language';
import { getProjectActiveLanguages } from '../lib/projectLanguages';
import Project from '../models/Project';
import { accessibleProjectOr } from '../lib/projectAccess';

const router = Router();

// POST /ai-suggest — AI translation suggestions. No AI provider is configured,
// so this returns a clear "not configured" error; the UI catches it and shows a
// "configure an AI provider in Settings" hint rather than breaking.
router.post('/ai-suggest', requireAuth, (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'AI translation is not configured. Configure an AI provider in Settings.',
  });
});

// GET /keys — list translation keys
router.get('/keys', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await connectDB();
    const projectId = req.query.projectId as string | undefined;

    // Fetch projects for the user (owned, member, or via team) FIRST so we can
    // scope keys to only the projects this user may access.
    const projects = await Project.find({
      $or: await accessibleProjectOr(req.userId),
    }).lean();
    const projectList = projects.map(p => ({
      id: (p._id as any).toString(),
      name: p.name,
      slug: p.slug,
    }));
    const accessibleIds = projectList.map(p => p.id);

    // Filters + pagination are all opt-in. Without `limit` the endpoint returns
    // the full (filtered) set, so callers that want everything — e.g. the
    // Translations workspace — keep working unchanged.
    const search = ((req.query.search as string) || '').trim();
    const namespace = ((req.query.namespace as string) || '').trim();
    const status = ((req.query.status as string) || '').trim();
    const paginate = req.query.limit !== undefined;
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '50'), 10) || 50, 1), 500);
    const offset = Math.max(parseInt(String(req.query.offset ?? '0'), 10) || 0, 0);

    // Enabled languages (needed to derive completion + status).
    // Active languages for THIS project (its own list, or the global set as fallback).
    const langProjectId = projectId && accessibleIds.includes(projectId) ? projectId : undefined;
    const languages = await getProjectActiveLanguages(langProjectId);
    const enabledLanguages = languages.map((l: any) => ({ code: l.code, name: l.name, flag: l.flag }));
    const enabledCodes = enabledLanguages.map((l) => l.code);
    const enabledCount = enabledCodes.length;

    // Base match: always scoped to accessible projects (+ optional project/namespace/search).
    const match: Record<string, any> =
      projectId && accessibleIds.includes(projectId)
        ? { projectId }
        : { projectId: { $in: accessibleIds } };
    if (namespace && namespace !== 'all') match.namespaceId = namespace;
    if (search) {
      match.$or = [
        { keyPath: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const pipeline: any[] = [
      { $match: match },
      {
        // Count filled translations among ENABLED languages.
        $addFields: {
          _filled: {
            $size: {
              $filter: {
                input: { $objectToArray: { $ifNull: ['$translations', {}] } },
                as: 't',
                cond: {
                  $and: [
                    { $in: ['$$t.k', enabledCodes] },
                    { $ne: ['$$t.v', ''] },
                    { $ne: ['$$t.v', null] },
                  ],
                },
              },
            },
          },
        },
      },
    ];

    // Status filter (derived from completion).
    if (status && status !== 'all') {
      let cond: Record<string, any> | null = null;
      if (status === 'draft') cond = { _filled: 0 }; // Empty
      else if (status === 'approved') cond = enabledCount > 0 ? { _filled: { $gte: enabledCount } } : { _id: null }; // Complete
      else if (status === 'review') cond = enabledCount > 0 ? { _filled: { $gt: 0, $lt: enabledCount } } : { _id: null }; // In progress
      if (cond) pipeline.push({ $match: cond });
    }

    pipeline.push({ $sort: { keyPath: 1 } });
    pipeline.push({
      $facet: {
        // An empty sub-pipeline passes all docs through (used when not paginating).
        data: paginate ? [{ $skip: offset }, { $limit: limit }] : [],
        total: [{ $count: 'n' }],
      },
    });

    const agg = await Key.aggregate(pipeline);
    const docs: any[] = agg[0]?.data || [];
    const total: number = agg[0]?.total?.[0]?.n || 0;

    const formattedKeys = docs.map((k) => {
      const completion = enabledCount > 0 ? Math.round((k._filled / enabledCount) * 100) : 0;
      return {
        id: k._id.toString(),
        key: k.keyPath,
        namespace: k.namespaceId || (k.keyPath || '').split('.')[0],
        description: k.description || '',
        translations: k.translations || {},
        completion,
        updated_at: k.updatedAt,
        project: projectList.find((p) => p.id === k.projectId),
      };
    });

    res.json({
      success: true,
      keys: formattedKeys,
      enabledLanguages,
      projects: projectList,
      total,
      limit: paginate ? limit : total,
      offset: paginate ? offset : 0,
    });
  } catch (error) {
    console.error('Error fetching translation keys:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch keys' });
  }
});

// POST /keys — create translation key
router.post('/keys', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await connectDB();
    const { key, namespace, description, projectId, translations } = req.body;

    const newKey = await Key.create({
      projectId,
      namespaceId: namespace || 'common',
      keyPath: key,
      description: description || '',
      tags: [],
      screenshots: [],
      variables: [],
      pluralization: false,
      translations: translations || {},
      createdBy: req.userId,
    });

    res.status(201).json({ success: true, key: newKey });
  } catch (error: any) {
    console.error('Error creating translation key:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /keys — update translation key
router.put('/keys', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await connectDB();
    const { keyId, languageCode, translation } = req.body;

    const key = await Key.findById(keyId);
    if (!key) {
      res.status(404).json({ success: false, error: 'Key not found' });
      return;
    }

    // Update the translation for the specific language
    const translations = (key as any).translations || {};
    translations[languageCode] = translation;
    (key as any).translations = translations;
    key.markModified('translations');
    await key.save();

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating translation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /keys — delete translation key
router.delete('/keys', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await connectDB();
    const id = req.query.id as string | undefined;

    if (!id) {
      res.status(400).json({ success: false, error: 'ID required' });
      return;
    }

    await Key.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting key:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /stats — get translation stats
router.get('/stats', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await connectDB();

    const totalKeys = await Key.countDocuments();
    const enabledLanguages = await Language.find({ enabled: true }).lean();
    const langCount = enabledLanguages.length;

    // Calculate completion stats
    const keys = await Key.find().lean();
    let complete = 0;
    let inProgress = 0;
    let missing = 0;

    keys.forEach(k => {
      const translations = (k as any).translations || {};
      const filled = enabledLanguages.filter(l => translations[l.code] && translations[l.code].trim() !== '').length;
      if (filled === langCount) complete++;
      else if (filled > 0) inProgress++;
      else missing++;
    });

    const avgProgress = totalKeys > 0 ? Math.round((complete / totalKeys) * 100) : 0;

    res.json({
      success: true,
      totalKeys,
      complete,
      inProgress,
      missing,
      avgProgress,
    });
  } catch (error) {
    console.error('Error fetching translation stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

export default router;
