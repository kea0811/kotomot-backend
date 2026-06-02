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

    const namespaces = await Namespace.find({ projectId }).sort({ name: 1 }).lean();

    const keyCounts = await Key.aggregate([
      { $match: { projectId } },
      { $group: { _id: '$namespaceId', count: { $sum: 1 } } },
    ]);

    const keyCountMap = new Map(
      keyCounts.map((kc: { _id: string; count: number }) => [kc._id, kc.count])
    );

    const namespacesWithCounts = namespaces.map((ns: any) => ({
      id: ns._id.toString(),
      name: ns.name,
      description: ns.description || '',
      keys: keyCountMap.get(ns._id.toString()) || 0,
    }));

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
