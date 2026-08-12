/**
 * Supabase client.
 *
 * Sync is *optional*. If the environment variables are absent the app runs
 * entirely local-first and every sync call becomes a no-op — which is the
 * correct default given PRD §2.5 makes offline a hard requirement and §2.7
 * makes data minimisation a goal. The student can use the app for months
 * before a backend exists.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Storage from 'expo-sqlite/kv-store';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

/**
 * Session tokens live in the kv-store rather than plain AsyncStorage, and the
 * client refreshes them itself. `detectSessionInUrl` is off because there is no
 * browser redirect flow on a native client.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        storage: Storage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and ' +
        'EXPO_PUBLIC_SUPABASE_ANON_KEY to enable sync and the parent viewer.'
    );
  }
  return supabase;
}
