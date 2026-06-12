import { Request } from 'express';

const DEMO_PREFIX = 'demo_';

/**
 * Demo sessions authenticate with a bearer token of the form `demo_<uuid>`.
 * The token doubles as the owner id, so a session's cloned data is naturally
 * isolated by the existing owner-scoping (no Supabase user involved).
 */
export function isDemoToken(token?: string | null): boolean {
  return !!token && token.startsWith(DEMO_PREFIX) && token.length > DEMO_PREFIX.length;
}

/** Attach a demo identity to the request (owner = the token itself). */
export function applyDemoUser(req: Request, token: string): void {
  req.userId = token;
  req.user = {
    id: token,
    email: 'demo@kotomot.app',
    user_metadata: { name: 'Demo User' },
    demo: true,
  };
}
