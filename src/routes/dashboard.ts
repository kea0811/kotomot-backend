import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import connectDB from '../lib/db';
import Project from '../models/Project';
import { Key } from '../models/Key';
import Team from '../models/Team';
import { accessibleProjectOr } from '../lib/projectAccess';

const router = Router();

// GET /dashboard — summary stats + recent projects for the current user.
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    await connectDB();

    const projects: any[] = await Project.find({ $or: await accessibleProjectOr(req.userId) })
      .select('_id name slug updatedAt members')
      .sort({ updatedAt: -1 })
      .lean();

    const projectIds = projects.map((p) => p._id.toString());

    const activeTranslations = projectIds.length
      ? await Key.countDocuments({ projectId: { $in: projectIds } })
      : 0;

    // Distinct people the user collaborates with: team owners/members across
    // their teams, plus members of projects they can see, plus themselves.
    const teams: any[] = await Team.find({
      $or: [{ owner: req.userId }, { 'members.user': req.userId }],
    })
      .select('owner members')
      .lean();

    const people = new Set<string>();
    if (req.userId) people.add(String(req.userId));
    teams.forEach((t) => {
      if (t.owner) people.add(String(t.owner));
      (t.members || []).forEach((m: any) => m?.user && people.add(String(m.user)));
    });
    projects.forEach((p) =>
      (p.members || []).forEach((m: any) => m?.user && people.add(String(m.user)))
    );

    const recentProjects = projects.slice(0, 5).map((p) => ({
      id: p._id,
      name: p.name,
      slug: p.slug,
      updated_at: p.updatedAt,
    }));

    res.json({
      success: true,
      stats: {
        totalProjects: projects.length,
        activeTranslations,
        pendingReviews: 0, // review workflow not yet implemented
        teamMembers: people.size,
      },
      recentProjects,
      recentActivities: [],
    });
  } catch (error: any) {
    console.error('Error building dashboard:', error);
    res.status(500).json({ error: error.message || 'Failed to load dashboard' });
  }
});

export default router;
