import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { Version, VersionConfig } from '../models/Version';
import { Key } from '../models/Key';
import { Environment } from '../models/Environment';
import Project from '../models/Project';

const router = Router();

/**
 * Helper to increment a semver string
 */
function incrementVersion(version: string, type: 'major' | 'minor' | 'patch'): string {
  const parts = version.split('.').map(Number);
  if (parts.length !== 3) return '0.0.2';

  switch (type) {
    case 'major':
      return `${parts[0] + 1}.0.0`;
    case 'minor':
      return `${parts[0]}.${parts[1] + 1}.0`;
    case 'patch':
    default:
      return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  }
}

/**
 * GET /api/versions
 * List versions for a project with pagination
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId, page = '1', limit = '10' } = req.query;

    if (!projectId) {
      return res.status(400).json({ error: 'Missing required query parameter: projectId' });
    }

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Get or create version config for this project
    let config = await VersionConfig.findOne({ projectId: projectId as string });
    if (!config) {
      config = await VersionConfig.create({
        projectId: projectId as string,
        current_version: '0.0.1',
      });
    }

    // Fetch versions
    const versions = await Version.find({ projectId: projectId as string })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Map to expected frontend format
    const mapped = versions.map((v: any) => ({
      id: v._id.toString(),
      version_number: v.version_number,
      version_type: v.version_type,
      is_current: v.is_current,
      created_by: v.created_by,
      created_at: v.createdAt,
      changelog_count: v.changelog_count || v.changelog?.length || 0,
      changelog: v.changelog || [],
      total_keys: v.total_keys,
      languages: v.languages || [],
      reverted_from: v.reverted_from,
      reverted_to: v.reverted_to,
    }));

    res.json({
      versions: mapped,
      config: {
        current_version: config.current_version,
        auto_version_on_approval: config.auto_version_on_approval,
        version_strategy: config.version_strategy,
        slack_notifications_enabled: config.slack_notifications_enabled,
      },
    });
  } catch (error) {
    console.error('Error fetching versions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/versions
 * Create a new version or revert to a previous version
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId, targetVersion, versionType = 'patch', environmentId } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: 'Missing required field: projectId' });
    }

    // Get or create config
    let config = await VersionConfig.findOne({ projectId });
    if (!config) {
      config = await VersionConfig.create({ projectId, current_version: '0.0.0' });
    }

    // Handle revert
    if (targetVersion) {
      const targetVer = await Version.findOne({ projectId, version_number: targetVersion });
      if (!targetVer) {
        return res.status(404).json({ error: 'Target version not found' });
      }

      const newVersionNumber = incrementVersion(config.current_version, 'patch');

      // Unmark current
      await Version.updateMany({ projectId, is_current: true }, { is_current: false });

      // Create revert version
      const revertVersion = await Version.create({
        projectId,
        version_number: newVersionNumber,
        version_type: 'patch',
        is_current: true,
        created_by: {
          user_id: req.userId || '',
          user_name: req.user?.email || '',
          team_id: '',
          team_name: '',
        },
        changelog: [{
          action: 'revert',
          entity_type: 'project',
          old_value: config.current_version,
          new_value: targetVersion,
          changed_by: {
            user_id: req.userId || '',
            user_name: req.user?.email || '',
          },
          timestamp: new Date(),
        }],
        changelog_count: 1,
        total_keys: targetVer.total_keys,
        languages: targetVer.languages,
        reverted_from: config.current_version,
        reverted_to: targetVersion,
      });

      config.current_version = newVersionNumber;
      await config.save();

      return res.json({ success: true, message: `Reverted to v${targetVersion}`, version: revertVersion });
    }

    // Create new version
    const newVersionNumber = incrementVersion(config.current_version, versionType);

    // Count current keys and languages for this project
    const totalKeys = await Key.countDocuments({ projectId });
    const project = await Project.findById(projectId);
    const enabledLanguages = project?.languages
      ?.filter((l: any) => l.enabled)
      .map((l: any) => l.language?.toString()) || [];

    // Unmark current
    await Version.updateMany({ projectId, is_current: true }, { is_current: false });

    const version = await Version.create({
      projectId,
      version_number: newVersionNumber,
      version_type: versionType,
      is_current: true,
      created_by: {
        user_id: req.userId || '',
        user_name: req.user?.email || '',
        team_id: '',
        team_name: '',
      },
      changelog: [],
      changelog_count: 0,
      total_keys: totalKeys,
      languages: enabledLanguages,
    });

    config.current_version = newVersionNumber;
    await config.save();

    // Deploy to environment if specified
    if (environmentId) {
      const env = await Environment.findById(environmentId);
      if (env) {
        env.previousVersion = env.version;
        env.version = newVersionNumber;
        env.deployedAt = new Date();
        env.deployedBy = req.userId;
        await env.save();
      }
    }

    res.status(201).json({
      success: true,
      message: `Version v${newVersionNumber} created${environmentId ? ' and deployed' : ''}`,
      version,
    });
  } catch (error) {
    console.error('Error creating version:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/versions
 * Update version config for a project
 */
router.put('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId, auto_version_on_approval, version_strategy, slack_notifications_enabled } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: 'Missing required field: projectId' });
    }

    const updates: any = {};
    if (auto_version_on_approval !== undefined) updates.auto_version_on_approval = auto_version_on_approval;
    if (version_strategy !== undefined) updates.version_strategy = version_strategy;
    if (slack_notifications_enabled !== undefined) updates.slack_notifications_enabled = slack_notifications_enabled;

    const config = await VersionConfig.findOneAndUpdate(
      { projectId },
      updates,
      { new: true, upsert: true }
    );

    res.json({ success: true, config });
  } catch (error) {
    console.error('Error updating version config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
