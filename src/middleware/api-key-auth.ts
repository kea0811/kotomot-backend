import { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase';
import { validateApiKey, hasPermission } from '../utils/api-key';
import { ApiKeyPermission } from '../types/api-key';
import { isDemoToken, applyDemoUser } from '../lib/demoAuth';

/**
 * Express middleware that supports both session auth and API key auth.
 * Prefers session auth if available, falls back to API key.
 * Sets req.userId and req.user on the request object.
 */
export function requireAuthOrApiKey(requiredPermission?: ApiKeyPermission) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // First try Bearer token (session auth)
      const authHeader = req.headers.authorization;

      if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
        const token = authHeader.split(' ')[1];

        if (token) {
          if (isDemoToken(token)) {
            applyDemoUser(req, token);
            next();
            return;
          }
          const { data: { user }, error } = await supabase.auth.getUser(token);

          if (!error && user) {
            req.userId = user.id;
            req.user = user;
            next();
            return;
          }
        }
      }

      // Fall back to API key authentication
      const apiKey = extractApiKey(req);

      if (!apiKey) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          message: 'Please provide a Bearer token or API key',
        });
        return;
      }

      const validation = await validateApiKey(apiKey);

      if (!validation.isValid) {
        res.status(401).json({
          success: false,
          error: validation.error || 'Invalid API key',
          message: 'The provided API key is invalid or has been revoked',
        });
        return;
      }

      // Check required permission
      if (requiredPermission && validation.permissions) {
        if (!hasPermission(validation.permissions, requiredPermission)) {
          res.status(403).json({
            success: false,
            error: 'Insufficient permissions',
            message: `This operation requires the ${requiredPermission} permission`,
          });
          return;
        }
      }

      req.userId = validation.userId;
      req.user = { id: validation.userId };

      next();
    } catch (error) {
      console.error('Auth or API key middleware error:', error);
      res.status(500).json({
        success: false,
        error: 'Authentication failed',
        message: 'An error occurred while verifying your authentication',
      });
    }
  };
}

/**
 * Extract API key from request headers.
 * Supports both X-API-Key header and Bearer token format.
 */
function extractApiKey(req: Request): string | null {
  // Check X-API-Key header
  const apiKeyHeader = req.headers['x-api-key'] as string | undefined;
  if (apiKeyHeader) {
    return apiKeyHeader;
  }

  // Check query parameter as fallback
  const queryApiKey = req.query.api_key as string | undefined;
  if (queryApiKey) {
    return queryApiKey;
  }

  return null;
}
