import { Request, Response, NextFunction } from 'express';

// Simple in-memory rate limiter for development
// In production, use Redis or Upstash for distributed rate limiting

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number = 10, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    // Clean up old entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.limits.entries()) {
      if (entry.resetTime < now) {
        this.limits.delete(key);
      }
    }
  }

  private getKey(identifier: string, endpoint: string): string {
    return `${identifier}:${endpoint}`;
  }

  public isAllowed(identifier: string, endpoint: string): boolean {
    const key = this.getKey(identifier, endpoint);
    const now = Date.now();
    const entry = this.limits.get(key);

    if (!entry || entry.resetTime < now) {
      // Create new entry
      this.limits.set(key, {
        count: 1,
        resetTime: now + this.windowMs,
      });
      return true;
    }

    if (entry.count >= this.maxRequests) {
      return false;
    }

    // Increment count
    entry.count++;
    return true;
  }

  public getRemainingRequests(identifier: string, endpoint: string): number {
    const key = this.getKey(identifier, endpoint);
    const entry = this.limits.get(key);

    if (!entry || entry.resetTime < Date.now()) {
      return this.maxRequests;
    }

    return Math.max(0, this.maxRequests - entry.count);
  }

  public getResetTime(identifier: string, endpoint: string): number {
    const key = this.getKey(identifier, endpoint);
    const entry = this.limits.get(key);

    if (!entry || entry.resetTime < Date.now()) {
      return Date.now() + this.windowMs;
    }

    return entry.resetTime;
  }

  public getMaxRequests(): number {
    return this.maxRequests;
  }
}

// Rate limiter instances for different endpoint types
const authLimiter = new RateLimiter(5, 60000);       // 5 requests per minute for auth
const apiLimiter = new RateLimiter(100, 60000);       // 100 requests per minute for API
const uploadLimiter = new RateLimiter(10, 300000);    // 10 uploads per 5 minutes

/**
 * Express middleware factory for rate limiting.
 *
 * @param options - Configuration for rate limiting type
 * @returns Express middleware function
 *
 * Usage:
 *   router.post('/login', rateLimit({ type: 'auth' }), loginHandler);
 *   router.get('/data', rateLimit({ type: 'api' }), dataHandler);
 *   router.post('/upload', rateLimit({ type: 'upload' }), uploadHandler);
 */
export function rateLimit(
  options: {
    type?: 'auth' | 'api' | 'upload';
  } = {}
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const type = options.type || 'api';

    // Get client identifier (IP address or user ID)
    const forwardedFor = req.headers['x-forwarded-for'] as string | undefined;
    const realIp = req.headers['x-real-ip'] as string | undefined;
    const identifier = (forwardedFor ? forwardedFor.split(',')[0] : undefined) || realIp || req.ip || 'unknown';

    // Get the appropriate limiter
    let limiter: RateLimiter;
    switch (type) {
      case 'auth':
        limiter = authLimiter;
        break;
      case 'upload':
        limiter = uploadLimiter;
        break;
      default:
        limiter = apiLimiter;
    }

    // Check rate limit
    const endpoint = req.path;
    const allowed = limiter.isAllowed(identifier, endpoint);

    if (!allowed) {
      const resetTime = limiter.getResetTime(identifier, endpoint);
      const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);

      res.set({
        'X-RateLimit-Limit': limiter.getMaxRequests().toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': new Date(resetTime).toISOString(),
        'Retry-After': retryAfter.toString(),
      });

      res.status(429).json({
        success: false,
        error: 'Too many requests. Please try again later.',
        retryAfter,
      });
      return;
    }

    // Add rate limit headers to successful responses
    const remaining = limiter.getRemainingRequests(identifier, endpoint);
    const resetTime = limiter.getResetTime(identifier, endpoint);

    res.set({
      'X-RateLimit-Limit': limiter.getMaxRequests().toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': new Date(resetTime).toISOString(),
    });

    next();
  };
}
