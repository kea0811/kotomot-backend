import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import connectDB from '../lib/db';
import { connectToDatabase } from '../lib/mongodb';
import Team, { ITeam, ITeamMember } from '../models/Team';
import ProjectTeam from '../models/ProjectTeam';
import Project from '../models/Project';

const router = Router();

/** Serialize a team into the shape the frontend expects. */
function serializeTeam(team: ITeam, userId?: string) {
  return {
    id: String(team._id),
    name: team.name,
    description: team.description || '',
    owner_id: team.owner,
    is_owner: team.owner === userId,
    member_count: team.members?.length || 1,
    created_at: team.createdAt,
    updated_at: team.updatedAt,
  };
}

/** Look up users by their Supabase ids and return an id→profile map. */
async function getUserProfiles(userIds: string[]) {
  const map = new Map<string, { email: string; name: string; avatar_url: string | null }>();
  if (userIds.length === 0) return map;
  try {
    const { db } = await connectToDatabase();
    const users = await db
      .collection('users')
      .find({ id: { $in: userIds } })
      .toArray();
    for (const u of users) {
      map.set(u.id, {
        email: u.email || '',
        name: u.name || u.email || 'User',
        avatar_url: u.avatar_url || null,
      });
    }
  } catch (error) {
    console.error('Error loading user profiles:', error);
  }
  return map;
}

// GET / — list teams the user owns or belongs to
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    await connectDB();
    const teams = await Team.find({
      $or: [{ owner: req.userId }, { 'members.user': req.userId }],
    }).sort({ updatedAt: -1 });
    res.json({ success: true, teams: teams.map((t) => serializeTeam(t, req.userId)) });
  } catch (error) {
    console.error('Error fetching teams:', error);
    res.json({ success: true, teams: [] });
  }
});

// GET /project-assignments — list this user's team→project assignments
router.get('/project-assignments', requireAuth, async (req: Request, res: Response) => {
  try {
    await connectDB();
    const teams = await Team.find({
      $or: [{ owner: req.userId }, { 'members.user': req.userId }],
    }).select('_id');
    const teamIds = teams.map((t) => t._id);
    const assignments = await ProjectTeam.find({ team: { $in: teamIds } });
    res.json({
      success: true,
      assignments: assignments.map((a) => ({
        project_id: String(a.project),
        team_id: String(a.team),
        permissions: a.permissions,
        assigned_at: a.createdAt,
      })),
    });
  } catch (error) {
    console.error('Error fetching project assignments:', error);
    res.json({ success: true, assignments: [] });
  }
});

// POST / — create a team
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    await connectDB();
    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Team name is required' });
    }
    const team = await Team.create({
      name: name.trim(),
      description: description || undefined,
      owner: req.userId,
      members: [{ user: req.userId, role: 'owner', addedAt: new Date() }],
    });
    res.status(201).json({ success: true, team: serializeTeam(team, req.userId) });
  } catch (error: any) {
    console.error('Error creating team:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to create team' });
  }
});

// PUT / — update a team (owner only)
router.put('/', requireAuth, async (req: Request, res: Response) => {
  try {
    await connectDB();
    const { teamId, name, description } = req.body;
    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ success: false, error: 'Team not found' });
    if (team.owner !== req.userId) {
      return res.status(403).json({ success: false, error: 'Only the owner can edit this team' });
    }
    if (name !== undefined) team.name = name.trim();
    if (description !== undefined) team.description = description;
    await team.save();
    res.json({ success: true, team: serializeTeam(team, req.userId) });
  } catch (error: any) {
    console.error('Error updating team:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to update team' });
  }
});

// DELETE /?id= — delete a team (owner only) + its assignments
router.delete('/', requireAuth, async (req: Request, res: Response) => {
  try {
    await connectDB();
    const teamId = req.query.id as string;
    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ success: false, error: 'Team not found' });
    if (team.owner !== req.userId) {
      return res.status(403).json({ success: false, error: 'Only the owner can delete this team' });
    }
    await ProjectTeam.deleteMany({ team: team._id });
    await team.deleteOne();
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting team:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to delete team' });
  }
});

// POST /assign-project — assign a project to a team (upsert)
router.post('/assign-project', requireAuth, async (req: Request, res: Response) => {
  try {
    await connectDB();
    const { team_id, project_id, permissions } = req.body;
    const team = await Team.findById(team_id);
    if (!team) return res.status(404).json({ success: false, error: 'Team not found' });
    if (team.owner !== req.userId) {
      return res.status(403).json({ success: false, error: 'Only the owner can assign projects' });
    }
    const assignment = await ProjectTeam.findOneAndUpdate(
      { team: team_id, project: project_id },
      {
        team: team_id,
        project: project_id,
        permissions: permissions || {
          can_read: true,
          can_write: true,
          can_delete: false,
          requires_approval: false,
        },
        assignedBy: req.userId,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({
      success: true,
      assignment: {
        project_id: String(assignment.project),
        team_id: String(assignment.team),
        permissions: assignment.permissions,
        assigned_at: assignment.createdAt,
      },
    });
  } catch (error: any) {
    console.error('Error assigning project:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to assign project' });
  }
});

// DELETE /assign-project?team_id=&project_id= — unassign a project
router.delete('/assign-project', requireAuth, async (req: Request, res: Response) => {
  try {
    await connectDB();
    const { team_id, project_id } = req.query as { team_id: string; project_id: string };
    const team = await Team.findById(team_id);
    if (!team) return res.status(404).json({ success: false, error: 'Team not found' });
    if (team.owner !== req.userId) {
      return res.status(403).json({ success: false, error: 'Only the owner can unassign projects' });
    }
    await ProjectTeam.deleteOne({ team: team_id, project: project_id });
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error unassigning project:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to unassign project' });
  }
});

// NOTE: `/:id` routes are declared AFTER the literal-path routes above
// (e.g. /project-assignments, /assign-project) so they don't shadow them.

// GET /:id — full team detail with enriched members + assigned projects
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    await connectDB();
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ success: false, error: 'Team not found' });

    const isMember =
      team.owner === req.userId ||
      team.members?.some((m: ITeamMember) => m.user === req.userId);
    if (!isMember) {
      return res.status(403).json({ success: false, error: 'You do not have access to this team' });
    }

    const profiles = await getUserProfiles(team.members.map((m: ITeamMember) => m.user));
    const members = team.members.map((m: ITeamMember) => {
      const p = profiles.get(m.user);
      return {
        user_id: m.user,
        email: p?.email || '',
        name: p?.name || p?.email || 'Unknown user',
        avatar_url: p?.avatar_url || null,
        role: m.role,
        added_at: m.addedAt,
        is_owner: m.user === team.owner,
      };
    });

    const assignments = await ProjectTeam.find({ team: team._id });
    const projectIds = assignments.map((a) => a.project);
    const projects = await Project.find({ _id: { $in: projectIds } }).select('name slug');
    const projectMap = new Map(projects.map((p) => [String(p._id), p]));
    const assignedProjects = assignments.map((a) => {
      const proj = projectMap.get(String(a.project));
      return {
        project_id: String(a.project),
        name: proj?.name || 'Unknown project',
        slug: proj?.slug || '',
        permissions: a.permissions,
        assigned_at: a.createdAt,
      };
    });

    res.json({
      success: true,
      team: {
        ...serializeTeam(team, req.userId),
        members,
        projects: assignedProjects,
      },
    });
  } catch (error: any) {
    console.error('Error fetching team:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch team' });
  }
});

// POST /:id/members — add a member by email (owner only)
router.post('/:id/members', requireAuth, async (req: Request, res: Response) => {
  try {
    await connectDB();
    const { email, role } = req.body as { email?: string; role?: string };
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ success: false, error: 'Team not found' });
    if (team.owner !== req.userId) {
      return res.status(403).json({ success: false, error: 'Only the owner can add members' });
    }

    // Resolve the email to a synced user.
    const { db } = await connectToDatabase();
    const user = await db.collection('users').findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'No account found for that email. They need to sign in to Koto at least once first.',
      });
    }

    if (team.members.some((m: ITeamMember) => m.user === user.id)) {
      return res.status(409).json({ success: false, error: 'That user is already a member' });
    }

    const memberRole = role === 'admin' || role === 'member' ? role : 'member';
    team.members.push({ user: user.id, role: memberRole, addedAt: new Date() } as any);
    await team.save();

    res.status(201).json({
      success: true,
      member: {
        user_id: user.id,
        email: user.email || '',
        name: user.name || user.email || 'User',
        avatar_url: user.avatar_url || null,
        role: memberRole,
        added_at: new Date(),
        is_owner: false,
      },
    });
  } catch (error: any) {
    console.error('Error adding member:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to add member' });
  }
});

// PATCH /:id/members/:userId — change a member's role (owner only)
router.patch('/:id/members/:userId', requireAuth, async (req: Request, res: Response) => {
  try {
    await connectDB();
    const { role } = req.body as { role?: string };
    if (role !== 'admin' && role !== 'member') {
      return res.status(400).json({ success: false, error: 'Invalid role' });
    }

    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ success: false, error: 'Team not found' });
    if (team.owner !== req.userId) {
      return res.status(403).json({ success: false, error: 'Only the owner can change roles' });
    }
    if (req.params.userId === team.owner) {
      return res.status(400).json({ success: false, error: "The owner's role cannot be changed" });
    }

    const member = team.members.find((m: ITeamMember) => m.user === req.params.userId);
    if (!member) return res.status(404).json({ success: false, error: 'Member not found' });
    member.role = role;
    await team.save();

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating member role:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to update role' });
  }
});

// DELETE /:id/members/:userId — remove a member (owner only; cannot remove owner)
router.delete('/:id/members/:userId', requireAuth, async (req: Request, res: Response) => {
  try {
    await connectDB();
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ success: false, error: 'Team not found' });
    if (team.owner !== req.userId) {
      return res.status(403).json({ success: false, error: 'Only the owner can remove members' });
    }
    if (req.params.userId === team.owner) {
      return res.status(400).json({ success: false, error: 'The owner cannot be removed' });
    }

    team.members = team.members.filter(
      (m: ITeamMember) => m.user !== req.params.userId
    ) as any;
    await team.save();

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error removing member:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to remove member' });
  }
});

export default router;
