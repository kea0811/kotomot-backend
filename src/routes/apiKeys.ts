import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { connectToDatabase } from '../lib/mongodb';
import { generateApiKey, hashApiKey } from '../utils/api-key';
import { ObjectId } from 'mongodb';

const router = Router();

// GET / — list API keys
router.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { db } = await connectToDatabase();
    const projectId = req.query.projectId as string | undefined;

    const query: any = { userId: req.userId };
    if (projectId) {
      query.projectId = projectId;
    }

    const keys = await db.collection('api_keys')
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    const apiKeys = keys.map((key) => ({
      id: key._id.toString(),
      name: key.name,
      permissions: key.permissions,
      projectId: key.projectId,
      metadata: key.metadata,
      isActive: key.isActive,
      lastUsedAt: key.lastUsedAt,
      usageCount: key.usageCount || 0,
      expiresAt: key.expiresAt,
      createdAt: key.createdAt,
    }));

    res.json({ success: true, apiKeys });
  } catch (error) {
    console.error('Error fetching API keys:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch API keys' });
  }
});

// POST / — create API key
router.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { db } = await connectToDatabase();
    const { name, permissions, projectId, expiresAt, metadata, rateLimit } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({ success: false, error: 'Name is required' });
      return;
    }

    if (!permissions || !Array.isArray(permissions) || permissions.length === 0) {
      res.status(400).json({ success: false, error: 'At least one permission is required' });
      return;
    }

    const isProduction = metadata?.environment !== 'development';
    const plainKey = generateApiKey(isProduction);
    const keyHash = hashApiKey(plainKey);

    const now = new Date();
    const doc = {
      keyHash,
      userId: req.userId,
      name: name.trim(),
      permissions,
      projectId: projectId || undefined,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      metadata: metadata || undefined,
      rateLimit: rateLimit || undefined,
      isActive: true,
      lastUsedAt: null,
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection('api_keys').insertOne(doc);

    res.status(201).json({
      success: true,
      apiKey: {
        id: result.insertedId.toString(),
        key: plainKey,
        name: doc.name,
        permissions: doc.permissions,
        projectId: doc.projectId,
        metadata: doc.metadata,
        isActive: true,
        lastUsedAt: null,
        usageCount: 0,
        expiresAt: doc.expiresAt,
        createdAt: doc.createdAt,
      },
    });
  } catch (error) {
    console.error('Error creating API key:', error);
    res.status(500).json({ success: false, error: 'Failed to create API key' });
  }
});

// PATCH /:keyId — update API key
router.patch('/:keyId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { db } = await connectToDatabase();
    const { keyId } = req.params;

    const allowedFields = ['name', 'permissions', 'metadata', 'isActive', 'rateLimit'];
    const updates: any = { updatedAt: new Date() };

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    const result = await db.collection('api_keys').findOneAndUpdate(
      { _id: new ObjectId(keyId as string), userId: req.userId },
      { $set: updates },
      { returnDocument: 'after' }
    );

    if (!result) {
      res.status(404).json({ success: false, error: 'API key not found' });
      return;
    }

    res.json({
      success: true,
      apiKey: {
        id: result._id.toString(),
        name: result.name,
        permissions: result.permissions,
        projectId: result.projectId,
        metadata: result.metadata,
        isActive: result.isActive,
        lastUsedAt: result.lastUsedAt,
        usageCount: result.usageCount || 0,
        expiresAt: result.expiresAt,
        createdAt: result.createdAt,
      },
    });
  } catch (error) {
    console.error('Error updating API key:', error);
    res.status(500).json({ success: false, error: 'Failed to update API key' });
  }
});

// DELETE /:keyId — revoke API key (soft delete)
router.delete('/:keyId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { db } = await connectToDatabase();
    const { keyId } = req.params;

    const result = await db.collection('api_keys').findOneAndUpdate(
      { _id: new ObjectId(keyId as string), userId: req.userId },
      { $set: { isActive: false, updatedAt: new Date() } }
    );

    if (!result) {
      res.status(404).json({ success: false, error: 'API key not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error revoking API key:', error);
    res.status(500).json({ success: false, error: 'Failed to revoke API key' });
  }
});

export default router;
