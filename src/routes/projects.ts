import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireAuthOrApiKey } from '../middleware/api-key-auth';
import connectDB from '../lib/db';
import Project from '../models/Project';
import { Key } from '../models/Key';
import { Namespace } from '../models/Namespace';
import { Environment } from '../models/Environment';
import { Version, VersionConfig } from '../models/Version';
import ProjectTeam from '../models/ProjectTeam';
import { teamAccessibleProjectIds } from '../lib/projectAccess';

const router = Router();

type ProjectStat = { keys: number; locales: number; completion: number };

/**
 * Compute real per-project stats from the keys collection (the Project.stats
 * field is not kept in sync by imports/edits). Returns a map keyed by projectId.
 * - keys: number of translation keys
 * - locales: distinct languages that have at least one non-empty value
 * - completion: filled values / (keys × locales), as a percentage
 */
async function computeProjectStats(projectIds: string[]): Promise<Map<string, ProjectStat>> {
  const map = new Map<string, ProjectStat>();
  if (projectIds.length === 0) return map;

  try {
  const agg = await Key.aggregate([
    { $match: { projectId: { $in: projectIds } } },
    { $project: { projectId: 1, kv: { $objectToArray: { $ifNull: ['$translations', {}] } } } },
    {
      $project: {
        projectId: 1,
        langs: {
          $map: {
            input: {
              $filter: {
                input: '$kv',
                as: 't',
                cond: { $and: [{ $ne: ['$$t.v', ''] }, { $ne: ['$$t.v', null] }] },
              },
            },
            as: 'x',
            in: '$$x.k',
          },
        },
      },
    },
    {
      $group: {
        _id: '$projectId',
        keys: { $sum: 1 },
        filled: { $sum: { $size: '$langs' } },
        localeSets: { $addToSet: '$langs' },
      },
    },
  ]);

  for (const a of agg as any[]) {
    const locales = new Set<string>();
    (a.localeSets || []).forEach((arr: string[]) => (arr || []).forEach((l) => locales.add(l)));
    const localeCount = locales.size;
    const completion =
      a.keys > 0 && localeCount > 0 ? Math.round((a.filled / (a.keys * localeCount)) * 100) : 0;
    map.set(a._id, { keys: a.keys, locales: localeCount, completion });
  }
  } catch (err) {
    console.error('computeProjectStats failed:', err);
  }
  return map;
}

// GET / — list projects for authenticated user (supports session auth or API key)
router.get('/', requireAuthOrApiKey('read:projects'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await connectDB();
    const teamProjectIds = await teamAccessibleProjectIds(req.userId);
    const projects = await Project.find({
      $or: [
        { owner: req.userId },
        { 'members.user': req.userId },
        { _id: { $in: teamProjectIds } },
      ]
    }).sort({ updatedAt: -1 }).lean();

    const statsMap = await computeProjectStats(projects.map((p: any) => p._id.toString()));
    const withStats = projects.map((p: any) => ({
      ...p,
      _id: p._id.toString(),
      stats: statsMap.get(p._id.toString()) || { keys: 0, locales: 0, completion: 0 },
    }));
    res.json({ success: true, projects: withStats });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.json({ success: true, projects: [] });
  }
});

// POST / — create project
router.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await connectDB();
    const { name, slug: bodySlug, description } = req.body;

    const slug = bodySlug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const project = await Project.create({
      name,
      slug,
      description: description || undefined,
      owner: req.userId,
      members: [{
        user: req.userId,
        role: 'owner',
        addedAt: new Date(),
      }],
    });

    res.status(201).json({ project });
  } catch (error: any) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: error.message || 'Failed to create project' });
  }
});

// GET /:slug — get single project with computed stats
router.get('/:slug', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await connectDB();
    const { slug } = req.params;

    const teamProjectIds = await teamAccessibleProjectIds(req.userId);
    const project: any = await Project.findOne({
      slug,
      $or: [
        { owner: req.userId },
        { 'members.user': req.userId },
        { _id: { $in: teamProjectIds } },
      ],
    }).lean();

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const projectId = project._id.toString();

    const [statsMap, totalNamespaces] = await Promise.all([
      computeProjectStats([projectId]),
      Namespace.countDocuments({ projectId }),
    ]);
    const s = statsMap.get(projectId) || { keys: 0, locales: 0, completion: 0 };

    res.json({
      project: {
        ...project,
        _id: projectId,
        is_owner: project.owner === req.userId,
        computedStats: {
          totalKeys: s.keys,
          totalNamespaces,
          completionRate: s.completion,
          locales: s.locales,
          memberCount: project.members?.length || 0,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// PUT /:slug — update project name/description (owner only)
router.put('/:slug', requireAuth, async (req: Request, res: Response) => {
  try {
    await connectDB();
    const { slug } = req.params;
    const { name, description } = req.body;

    const project = await Project.findOne({ slug });
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    if (project.owner !== req.userId) {
      res.status(403).json({ error: 'Only the project owner can edit settings' });
      return;
    }

    if (name !== undefined && name.trim()) project.name = name.trim();
    if (description !== undefined) project.description = description || undefined;
    await project.save();

    res.json({ success: true, project });
  } catch (error: any) {
    console.error('Error updating project:', error);
    res.status(500).json({ error: error.message || 'Failed to update project' });
  }
});

// DELETE /:slug — delete project + all related data (owner only)
router.delete('/:slug', requireAuth, async (req: Request, res: Response) => {
  try {
    await connectDB();
    const { slug } = req.params;

    const project = await Project.findOne({ slug });
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    if (project.owner !== req.userId) {
      res.status(403).json({ error: 'Only the project owner can delete this project' });
      return;
    }

    const projectId = project._id.toString();

    // Cascade: remove everything scoped to this project.
    await Promise.all([
      Key.deleteMany({ projectId }),
      Namespace.deleteMany({ projectId }),
      Environment.deleteMany({ projectId }),
      Version.deleteMany({ projectId }),
      VersionConfig.deleteMany({ projectId }),
      ProjectTeam.deleteMany({ project: project._id }),
    ]);
    await project.deleteOne();

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: error.message || 'Failed to delete project' });
  }
});

export default router;
