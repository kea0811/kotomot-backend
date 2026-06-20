import { supabase } from './supabase';

/**
 * Keyring (self-hosted Better Auth) bearer-token verification.
 *
 * The frontend authenticates against Keyring and sends a Keyring session token
 * as the Bearer. We verify it by asking the Keyring instance to resolve the
 * session, then normalize the result to the Supabase user shape the rest of the
 * backend (and `syncUserToMongoDB`) already expects.
 *
 * KEYRING_URL / KEYRING_PROJECT are env-overridable; they default to this
 * deployment's Keyring so it works without extra configuration.
 */
const KEYRING_URL = (process.env.KEYRING_URL || 'https://keyring-app-production.up.railway.app').replace(/\/+$/, '');
const KEYRING_PROJECT = process.env.KEYRING_PROJECT || 'kotomot';

export interface NormalizedUser {
  id: string;
  email: string;
  created_at?: string;
  user_metadata: { full_name?: string; name?: string; avatar_url?: string };
  [key: string]: unknown;
}

/**
 * Cheap discriminator: a Supabase access token is a JWT ("eyJ…", three
 * dot-separated segments); a Keyring session token is "<token>.<signature>"
 * (two segments, not starting with "eyJ"). Lets us route to the right verifier
 * instead of always probing Supabase first.
 */
export function looksLikeKeyringToken(token: string): boolean {
  return !token.startsWith('eyJ') && token.split('.').length === 2;
}

/** Resolve a Keyring session token to a normalized user, or null if invalid. */
export async function verifyKeyringToken(token: string): Promise<NormalizedUser | null> {
  if (!KEYRING_URL) return null;
  try {
    const res = await fetch(`${KEYRING_URL}/api/auth/get-session`, {
      headers: { authorization: `Bearer ${token}`, 'x-keyring-project': KEYRING_PROJECT },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      user?: { id?: string; email?: string; name?: string; image?: string; createdAt?: string };
    };
    const u = data?.user;
    if (!u?.id || !u?.email) return null;
    return {
      id: u.id,
      email: u.email,
      created_at: u.createdAt,
      user_metadata: { full_name: u.name, name: u.name, avatar_url: u.image ?? undefined },
    };
  } catch {
    return null;
  }
}

/**
 * Verify a Bearer token from either auth provider and return a user (Supabase
 * shape) or null. Keyring tokens go to Keyring; everything else falls through to
 * Supabase, so existing/legacy sessions keep working during the migration.
 */
export async function verifyBearerUser(token: string): Promise<any | null> {
  if (looksLikeKeyringToken(token)) {
    return verifyKeyringToken(token);
  }
  const { data: { user }, error } = await supabase.auth.getUser(token);
  return error ? null : user;
}
