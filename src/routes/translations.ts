import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import connectDB from '../lib/db';
import { Key } from '../models/Key';
import Language from '../models/Language';
import Project from '../models/Project';
import { accessibleProjectOr } from '../lib/projectAccess';

const router = Router();

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

    // Build a query scoped to accessible projects (never return all keys globally).
    let query: Record<string, unknown>;
    if (projectId && accessibleIds.includes(projectId)) {
      query = { projectId };
    } else {
      query = { projectId: { $in: accessibleIds } };
    }

    // Fetch keys
    const keys = await Key.find(query).sort({ keyPath: 1 }).lean();

    // Fetch enabled languages
    const languages = await Language.find({ enabled: true }).sort({ isDefault: -1, name: 1 }).lean();
    const enabledLanguages = languages.map(l => ({
      code: l.code,
      name: l.name,
      flag: l.flag,
    }));

    // Format keys for the frontend
    const formattedKeys = keys.map(k => {
      const translations = (k as any).translations || {};
      const totalLangs = enabledLanguages.length;
      const filledLangs = enabledLanguages.filter(l => translations[l.code] && translations[l.code].trim() !== '').length;
      const completion = totalLangs > 0 ? Math.round((filledLangs / totalLangs) * 100) : 0;

      return {
        id: (k._id as any).toString(),
        key: k.keyPath,
        namespace: (k as any).namespaceId || k.keyPath.split('.')[0],
        description: k.description || '',
        translations,
        completion,
        updated_at: (k as any).updatedAt,
        project: projectList.find(p => p.id === k.projectId),
      };
    });

    res.json({
      success: true,
      keys: formattedKeys,
      enabledLanguages,
      projects: projectList,
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
