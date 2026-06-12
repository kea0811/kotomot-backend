import { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase';
import { syncUserToMongoDB } from './sync-user';
import { isDemoToken, applyDemoUser } from '../lib/demoAuth';

// Extend Express Request to include auth properties
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      user?: any;
    }
  }
}

/**
 * Express middleware that requires Bearer token authentication.
 * Extracts the token from the Authorization header, verifies it with Supabase,
 * and attaches userId and user to the request object.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'Please provide a Bearer token in the Authorization header'
      });
      return;
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'Bearer token is empty'
      });
      return;
    }

    // Demo session: a `demo_<uuid>` token maps to an isolated demo identity.
    if (isDemoToken(token)) {
      applyDemoUser(req, token);
      next();
      return;
    }

    // Verify the token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({
        success: false,
        error: 'Session invalid',
        message: 'Your session has expired or the token is invalid. Please sign in again.'
      });
      return;
    }

    // Sync user to MongoDB to ensure they exist in our database
    await syncUserToMongoDB(user);

    // Attach user info to request
    req.userId = user.id;
    req.user = user;

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed',
      message: 'An error occurred while verifying your authentication'
    });
  }
}

/**
 * Express middleware for optional Bearer token authentication.
 * If a valid token is provided, sets req.userId and req.user.
 * If no token is provided or the token is invalid, continues without error
 * (req.userId will be undefined).
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      // No token provided - continue without auth
      req.userId = undefined;
      req.user = undefined;
      next();
      return;
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      req.userId = undefined;
      req.user = undefined;
      next();
      return;
    }

    // Demo session token.
    if (isDemoToken(token)) {
      applyDemoUser(req, token);
      next();
      return;
    }

    // Try to verify the token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      // Token is invalid but auth is optional - continue without auth
      req.userId = undefined;
      req.user = undefined;
      next();
      return;
    }

    // Sync user to MongoDB
    await syncUserToMongoDB(user);

    // Attach user info to request
    req.userId = user.id;
    req.user = user;

    next();
  } catch (error) {
    // Auth is optional, so just continue without auth on error
    console.error('Optional auth middleware error:', error);
    req.userId = undefined;
    req.user = undefined;
    next();
  }
}
