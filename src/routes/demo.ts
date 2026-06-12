import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { randomUUID } from 'crypto';
import connectDB from '../lib/db';

const router = Router();

const TEMPLATE_SLUG = '__demo-template';
const CHILD_COLLECTIONS = ['keys', 'namespaces', 'versions', 'versionconfigs', 'environments'];
const TTL_MS = 24 * 60 * 60 * 1000; // 24h — matches the demoExpiresAt TTL index

/**
 * POST /auth/demo
 * Spin up a throwaway, fully-editable demo session: clone the "Demo App"
 * template into fresh docs owned by `demo_<uuid>`, stamped with a TTL so they
 * auto-expire. Returns a demo token the SPA uses as its bearer auth.
 */
router.post('/demo', async (_req: Request, res: Response) => {
  try {
    await connectDB();
    const db = mongoose.connection.db;
    if (!db) {
      res.status(503).json({ error: 'Database not ready' });
      return;
    }

    const template = await db.collection('projects').findOne({ slug: TEMPLATE_SLUG });
    if (!template) {
      res.status(503).json({ error: 'Demo is temporarily unavailable' });
      return;
    }

    const sessionId = randomUUID();
    const token = `demo_${sessionId}`;
    const now = new Date();
    const demoExpiresAt = new Date(now.getTime() + TTL_MS);
    const newProjectId = new mongoose.Types.ObjectId();
    const slug = `demo-${sessionId.slice(0, 8)}`;
    const templateId = (template._id as mongoose.Types.ObjectId).toString();

    // Clone the project under the session owner.
    const projDoc: any = { ...template };
    delete projDoc._id;
    delete projDoc.createdAt;
    delete projDoc.updatedAt;
    await db.collection('projects').insertOne({
      ...projDoc,
      _id: newProjectId,
      owner: token,
      slug,
      name: 'Demo App',
      demoExpiresAt,
      createdAt: now,
      updatedAt: now,
    });

    // Clone every child doc, remapping projectId + stamping the TTL.
    for (const col of CHILD_COLLECTIONS) {
      const docs = await db.collection(col).find({ projectId: templateId }).toArray();
      if (!docs.length) continue;
      const cloned = docs.map((d: any) => {
        const r: any = { ...d };
        delete r._id;
        delete r.createdAt;
        delete r.updatedAt;
        r._id = new mongoose.Types.ObjectId();
        r.projectId = newProjectId.toString();
        r.demoExpiresAt = demoExpiresAt;
        r.createdAt = now;
        r.updatedAt = now;
        return r;
      });
      await db.collection(col).insertMany(cloned);
    }

    res.json({
      token,
      user: {
        id: token,
        email: 'demo@kotomot.app',
        user_metadata: { name: 'Demo User' },
        demo: true,
      },
      projectSlug: slug,
      expiresAt: demoExpiresAt.toISOString(),
    });
  } catch (error) {
    console.error('Demo session error:', error);
    res.status(500).json({ error: 'Could not start a demo session' });
  }
});

export default router;
