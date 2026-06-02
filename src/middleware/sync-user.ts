import { connectToDatabase } from '../lib/mongodb';

/**
 * User object shape from Supabase auth.getUser()
 */
interface SupabaseUser {
  id: string;
  email?: string;
  created_at?: string;
  user_metadata?: {
    full_name?: string;
    name?: string;
    avatar_url?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Syncs a Supabase user to MongoDB users collection.
 * This ensures we have a record of all users for team features.
 *
 * In the Express backend, we receive the user object directly from
 * supabase.auth.getUser(token) rather than needing to call it again.
 *
 * @param user - The Supabase user object from auth.getUser()
 */
export async function syncUserToMongoDB(user: any) {
  try {
    console.log('Syncing user to MongoDB:', user.id);

    const { db } = await connectToDatabase();

    // Check if user already exists in MongoDB
    const existingUser = await db.collection('users').findOne({ id: user.id });

    if (!existingUser) {
      // Create user in MongoDB
      const newUser = {
        id: user.id,
        email: user.email?.toLowerCase() || '',
        name: user.user_metadata?.full_name ||
              user.user_metadata?.name ||
              user.email?.split('@')[0] || 'User',
        avatar_url: user.user_metadata?.avatar_url || null,
        created_at: new Date(user.created_at || Date.now()),
        updated_at: new Date(),
        metadata: user.user_metadata || {}
      };

      await db.collection('users').insertOne(newUser);
      console.log('Created new user in MongoDB:', newUser.email);
      return newUser;
    } else {
      // Update existing user
      await db.collection('users').updateOne(
        { id: user.id },
        {
          $set: {
            email: user.email?.toLowerCase() || existingUser.email,
            name: user.user_metadata?.full_name ||
                  user.user_metadata?.name ||
                  existingUser.name,
            avatar_url: user.user_metadata?.avatar_url || existingUser.avatar_url,
            updated_at: new Date()
          }
        }
      );
      return existingUser;
    }
  } catch (error) {
    console.error('Error syncing user to MongoDB:', error);
    return null;
  }
}

/**
 * Ensures a user exists in MongoDB by email.
 * Used when we need to look up users who might not have been synced yet.
 */
export async function ensureUserInMongoDB(email: string) {
  try {
    const { db } = await connectToDatabase();

    // Check if user already exists
    const existingUser = await db.collection('users').findOne({
      email: email.toLowerCase()
    });

    if (existingUser) {
      return existingUser;
    }

    // If user doesn't exist in MongoDB, they need to log in first
    // to sync their account
    return null;
  } catch (error) {
    console.error('Error ensuring user in MongoDB:', error);
    return null;
  }
}
