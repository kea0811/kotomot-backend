import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { Environment } from '../models/Environment';
import { Version, VersionConfig } from '../models/Version';
import { Key } from '../models/Key';
import Project from '../models/Project';

const router = Router();

/**
 * GET /api/environments
 * List environments for a project
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;

    if (!projectId) {
      return res.status(400).json({ error: 'Missing required query parameter: projectId' });
    }

    const environments = await Environment.find({ projectId: projectId as string })
      .sort({ order: 1, createdAt: 1 })
      .lean();

    res.json(environments);
  } catch (error) {
    console.error('Error fetching environments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/environments
 * Create a new environment
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId, name, type, description, color } = req.body;

    if (!projectId || !name) {
      return res.status(400).json({ error: 'Missing required fields: projectId, name' });
    }

    // Verify project exists
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    // Check for duplicate slug within project
    const existing = await Environment.findOne({ projectId, slug });
    if (existing) {
      return res.status(409).json({ error: 'An environment with this name already exists in this project' });
    }

    const environment = await Environment.create({
      projectId,
      name,
      type: type || 'custom',
      slug,
      description,
      color: color || '#3b82f6',
      version: '0.0.1',
      isActive: true,
      createdBy: req.userId,
    });

    // Auto-create a version for this project if it's the first environment
    const versionExists = await Version.findOne({ projectId });
    if (!versionExists) {
      const totalKeys = await Key.countDocuments({ projectId });
      const enabledLanguages = project?.languages
        ?.filter((l: any) => l.enabled)
        .map((l: any) => l.language?.toString()) || [];

      await Version.create({
        projectId,
        version_number: '0.0.1',
        version_type: 'patch',
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

      // Create or update version config
      await VersionConfig.findOneAndUpdate(
        { projectId },
        { current_version: '0.0.1' },
        { upsert: true, new: true }
      );
    }

    res.status(201).json(environment);
  } catch (error) {
    console.error('Error creating environment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/environments/:id
 * Update an environment
 */
router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, color, isActive } = req.body;

    const environment = await Environment.findByIdAndUpdate(
      id,
      { name, description, color, isActive },
      { new: true }
    );

    if (!environment) {
      return res.status(404).json({ error: 'Environment not found' });
    }

    res.json(environment);
  } catch (error) {
    console.error('Error updating environment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/environments/:id
 * Delete an environment
 */
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const environment = await Environment.findByIdAndDelete(id);
    if (!environment) {
      return res.status(404).json({ error: 'Environment not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting environment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/environments/:id/versions
 * Get version history for an environment
 */
router.get('/:id/versions', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const environment = await Environment.findById(id);
    if (!environment) {
      return res.status(404).json({ error: 'Environment not found' });
    }

    // Return current version as history entry for now
    const versions = [{
      _id: environment._id,
      version: environment.version,
      previousVersion: environment.previousVersion,
      createdAt: environment.createdAt,
    }];

    res.json(versions);
  } catch (error) {
    console.error('Error fetching version history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/environments/promote
 * Promote a version from one environment to another
 */
router.post('/promote', requireAuth, async (req: Request, res: Response) => {
  try {
    const { fromEnvironmentId, toEnvironmentId, changelog } = req.body;

    if (!fromEnvironmentId || !toEnvironmentId) {
      return res.status(400).json({ error: 'Missing required fields: fromEnvironmentId, toEnvironmentId' });
    }

    const fromEnv = await Environment.findById(fromEnvironmentId);
    const toEnv = await Environment.findById(toEnvironmentId);

    if (!fromEnv || !toEnv) {
      return res.status(404).json({ error: 'Environment not found' });
    }

    // Update target environment with source version
    toEnv.previousVersion = toEnv.version;
    toEnv.version = fromEnv.version;
    toEnv.deployedAt = new Date();
    toEnv.deployedBy = req.userId;
    await toEnv.save();

    res.json({ success: true, environment: toEnv });
  } catch (error) {
    console.error('Error promoting version:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
