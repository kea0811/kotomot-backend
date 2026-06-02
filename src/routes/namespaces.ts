import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import connectDB from '../lib/db';
import Project from '../models/Project';
import { Namespace } from '../models/Namespace';
import { Key } from '../models/Key';
import { accessibleProjectOr } from '../lib/projectAccess';

const router = Router();

// GET /:slug/namespaces — list namespaces with key counts
router.get('/:slug/namespaces', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await connectDB();
    const { slug } = req.params;

    const project: any = await Project.findOne({
      slug,
      $or: await accessibleProjectOr(req.userId),
    }).select('_id').lean();

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const projectId = project._id.toString();

    // Explicit namespace records. May be empty even when keys exist — e.g.
    // imported keys carry a `namespaceId` (which IS the namespace name) without
    // a corresponding Namespace document.
    const namespaceDocs = await Namespace.find({ projectId }).sort({ name: 1 }).lean();

    // Key counts grouped by namespaceId (== the namespace name).
    const keyCounts = await Key.aggregate([
      { $match: { projectId } },
      { $group: { _id: '$namespaceId', count: { $sum: 1 } } },
    ]);
    const countByName = new Map<string, number>(
      keyCounts.map((kc: { _id: string; count: number }) => [String(kc._id), kc.count])
    );

    // Build the list keyed by name: explicit docs first (keep their real id +
    // description), then any namespace that exists only implicitly via keys.
    const byName = new Map<string, { id: string; name: string; description: string; keys: number }>();
    for (const ns of namespaceDocs as any[]) {
      byName.set(ns.name, {
        id: ns._id.toString(),
        name: ns.name,
        description: ns.description || '',
        keys: countByName.get(ns.name) || 0,
      });
    }
    for (const [name, count] of countByName) {
      if (!name || byName.has(name)) continue;
      byName.set(name, { id: name, name, description: '', keys: count });
    }

    const namespacesWithCounts = Array.from(byName.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    res.json({ namespaces: namespacesWithCounts });
  } catch (error) {
    console.error('Error fetching namespaces:', error);
    res.status(500).json({ error: 'Failed to fetch namespaces' });
  }
});

// POST /:slug/namespaces — create namespace
router.post('/:slug/namespaces', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await connectDB();
    const { slug } = req.params;
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({ error: 'Namespace name is required' });
      return;
    }

    const project: any = await Project.findOne({
      slug,
      $or: await accessibleProjectOr(req.userId),
    }).select('_id').lean();

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const namespace = await Namespace.create({
      projectId: project._id.toString(),
      name: name.trim(),
      description: description?.trim() || undefined,
    });

    res.status(201).json({ namespace });
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(409).json({ error: 'A namespace with this name already exists in this project' });
      return;
    }
    console.error('Error creating namespace:', error);
    res.status(500).json({ error: 'Failed to create namespace' });
  }
});

export default router;
