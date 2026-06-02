import Team from '../models/Team';
import ProjectTeam from '../models/ProjectTeam';

/**
 * Project ids a user can reach via team assignments:
 * teams they own or belong to, joined to ProjectTeam where can_read is true.
 */
export async function teamAccessibleProjectIds(userId?: string) {
  if (!userId) return [];
  const teams = await Team.find({
    $or: [{ owner: userId }, { 'members.user': userId }],
  }).select('_id');
  const teamIds = teams.map((t) => t._id);
  if (teamIds.length === 0) return [];
  const assignments = await ProjectTeam.find({
    team: { $in: teamIds },
    'permissions.can_read': true,
  }).select('project');
  return assignments.map((a) => a.project);
}

/**
 * Mongo `$or` clauses matching every project a user can access:
 * ones they own, are a direct member of, or reach through a team.
 * Spread into a Project query: `Project.findOne({ slug, $or: await accessibleProjectOr(userId) })`.
 */
export async function accessibleProjectOr(userId?: string) {
  const ids = await teamAccessibleProjectIds(userId);
  return [
    { owner: userId },
    { 'members.user': userId },
    { _id: { $in: ids } },
  ];
}
