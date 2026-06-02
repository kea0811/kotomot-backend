import crypto from 'crypto';
import { ApiKey, ApiKeyPermission, ApiKeyValidationResult } from '../types/api-key';
import { connectToDatabase } from '../lib/mongodb';

// API key format: hms_live_[random-32-chars] or hms_test_[random-32-chars]
const API_KEY_PREFIX_LIVE = 'hms_live_';
const API_KEY_PREFIX_TEST = 'hms_test_';
const API_KEY_LENGTH = 32;

/**
 * Generate a secure API key
 * @param isProduction - Whether this is a production key
 * @returns A secure random API key
 */
export function generateApiKey(isProduction: boolean = true): string {
  const prefix = isProduction ? API_KEY_PREFIX_LIVE : API_KEY_PREFIX_TEST;
  const randomBytes = crypto.randomBytes(API_KEY_LENGTH);
  const randomString = randomBytes.toString('base64')
    .replace(/\+/g, '')
    .replace(/\//g, '')
    .replace(/=/g, '')
    .substring(0, API_KEY_LENGTH);

  return `${prefix}${randomString}`;
}

/**
 * Hash an API key for secure storage
 * @param apiKey - The plain text API key
 * @returns The hashed API key
 */
export function hashApiKey(apiKey: string): string {
  return crypto
    .createHash('sha256')
    .update(apiKey)
    .digest('hex');
}

/**
 * Validate an API key and return user permissions
 * @param apiKey - The API key to validate
 * @returns Validation result with user info and permissions
 */
export async function validateApiKey(apiKey: string): Promise<ApiKeyValidationResult> {
  try {
    if (!apiKey) {
      return { isValid: false, error: 'API key is required' };
    }

    // Check API key format
    if (!apiKey.startsWith(API_KEY_PREFIX_LIVE) && !apiKey.startsWith(API_KEY_PREFIX_TEST)) {
      return { isValid: false, error: 'Invalid API key format' };
    }

    // Hash the provided API key
    const hashedKey = hashApiKey(apiKey);

    // Connect to database
    const { db } = await connectToDatabase();

    // Find the API key in the database
    const apiKeyDoc = await db.collection<ApiKey>('api_keys').findOne({
      keyHash: hashedKey,
      isActive: true
    });

    if (!apiKeyDoc) {
      return { isValid: false, error: 'Invalid or inactive API key' };
    }

    // Check if the key has expired
    if (apiKeyDoc.expiresAt && new Date(apiKeyDoc.expiresAt) < new Date()) {
      // Mark the key as inactive
      await db.collection('api_keys').updateOne(
        { _id: apiKeyDoc._id } as any,
        { $set: { isActive: false } }
      );
      return { isValid: false, error: 'API key has expired' };
    }

    // Update last used timestamp and usage count
    await db.collection('api_keys').updateOne(
      { _id: apiKeyDoc._id } as any,
      {
        $set: { lastUsedAt: new Date() },
        $inc: { usageCount: 1 }
      }
    );

    return {
      isValid: true,
      userId: apiKeyDoc.userId,
      permissions: apiKeyDoc.permissions,
      projectId: apiKeyDoc.projectId
    };
  } catch (error) {
    console.error('Error validating API key:', error);
    return { isValid: false, error: 'Failed to validate API key' };
  }
}

/**
 * Check if a user has specific permission through their API key
 * @param permissions - User's permissions
 * @param requiredPermission - The permission to check
 * @returns Whether the user has the permission
 */
export function hasPermission(
  permissions: ApiKeyPermission[],
  requiredPermission: ApiKeyPermission
): boolean {
  // Admin has all permissions
  if (permissions.includes('admin:all')) {
    return true;
  }

  // Check for specific permission
  return permissions.includes(requiredPermission);
}

/**
 * Check rate limiting for an API key
 * @param apiKeyId - The API key ID
 * @returns Whether the request is within rate limits
 */
export async function checkRateLimit(apiKeyId: string): Promise<{ allowed: boolean; resetAt?: Date }> {
  try {
    const { db } = await connectToDatabase();

    // Get the API key with rate limit settings
    const apiKey = await db.collection<ApiKey>('api_keys').findOne({ _id: apiKeyId } as any);

    if (!apiKey || !apiKey.rateLimit) {
      return { allowed: true }; // No rate limit configured
    }

    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60000);
    const oneHourAgo = new Date(now.getTime() - 3600000);
    const oneDayAgo = new Date(now.getTime() - 86400000);

    // Check rate limit usage in the last minute/hour/day
    const [minuteCount, hourCount, dayCount] = await Promise.all([
      db.collection('api_requests').countDocuments({
        apiKeyId,
        timestamp: { $gte: oneMinuteAgo }
      }),
      db.collection('api_requests').countDocuments({
        apiKeyId,
        timestamp: { $gte: oneHourAgo }
      }),
      db.collection('api_requests').countDocuments({
        apiKeyId,
        timestamp: { $gte: oneDayAgo }
      })
    ]);

    // Check limits
    if (minuteCount >= apiKey.rateLimit.requestsPerMinute) {
      return { allowed: false, resetAt: new Date(now.getTime() + 60000) };
    }
    if (hourCount >= apiKey.rateLimit.requestsPerHour) {
      return { allowed: false, resetAt: new Date(now.getTime() + 3600000) };
    }
    if (dayCount >= apiKey.rateLimit.requestsPerDay) {
      return { allowed: false, resetAt: new Date(now.getTime() + 86400000) };
    }

    // Log the request
    await db.collection('api_requests').insertOne({
      apiKeyId,
      timestamp: now
    });

    // Clean up old request logs (older than 24 hours)
    await db.collection('api_requests').deleteMany({
      timestamp: { $lt: oneDayAgo }
    });

    return { allowed: true };
  } catch (error) {
    console.error('Error checking rate limit:', error);
    // Allow request on error to not block legitimate requests
    return { allowed: true };
  }
}

/**
 * Mask an API key for display (show only first 8 and last 4 characters)
 * @param apiKey - The API key to mask
 * @returns The masked API key
 */
export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 20) {
    return '***************';
  }
  const prefix = apiKey.substring(0, 12);
  const suffix = apiKey.substring(apiKey.length - 4);
  return `${prefix}...${suffix}`;
}
