/**
 * T-10 — Single-family auth with student and parent-viewer roles.
 *
 * Design constraints from PRD §2.5 and §2.7:
 *  - Sign in with Apple, or a passwordless email link. No third-party social
 *    login: this is a minor's account and every extra identity provider is
 *    another party receiving data about them for no benefit here.
 *  - The role gate is enforced in Postgres RLS, not in this file. What lives
 *    here is convenience for the UI; what protects the data is the database.
 *
 * A student can use the app entirely signed-out. Auth exists to enable backup
 * and the parent viewer on a second device, not to unlock the product.
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';
import type { AccountRole } from '../domain/types';
import { assertClean } from '../privacy/policy';
import { isSupabaseConfigured, requireSupabase, supabase } from '../supabase/client';

export interface Profile {
  userId: string;
  role: AccountRole;
  studentId: string;
  displayName: string;
}

export interface AuthState {
  /** False when Supabase is unconfigured — the local-only mode. */
  available: boolean;
  signedIn: boolean;
  profile: Profile | null;
}

export async function getAuthState(): Promise<AuthState> {
  if (!isSupabaseConfigured || !supabase) {
    return { available: false, signedIn: false, profile: null };
  }

  const { data } = await supabase.auth.getSession();
  if (!data.session) return { available: true, signedIn: false, profile: null };

  const profile = await fetchProfile(data.session.user.id);
  return { available: true, signedIn: true, profile };
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('profiles')
    .select('user_id, role, student_id, display_name')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return {
    userId: data.user_id as string,
    role: data.role as AccountRole,
    studentId: data.student_id as string,
    displayName: data.display_name as string,
  };
}

export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  return AppleAuthentication.isAvailableAsync();
}

/**
 * Sign in with Apple.
 *
 * Scopes are deliberately empty. Apple offers name and email, and PRD §2.7
 * says to collect neither beyond what the login strictly needs — the identity
 * token alone establishes the account, so asking for more would be collecting
 * data we have committed not to hold.
 */
export async function signInWithApple(): Promise<Profile | null> {
  const client = requireSupabase();

  const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
  if (!credential.identityToken) {
    throw new Error('Apple did not return an identity token.');
  }

  const { data, error } = await client.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw new Error(error.message);
  if (!data.user) return null;

  return fetchProfile(data.user.id);
}

/**
 * Passwordless email sign-in, for the parent's device and for Android.
 *
 * The email is the one identifier PRD §2.7 permits, and only for login — hence
 * the explicit `allowAuthIdentifier` on the privacy screen. It is never copied
 * into any learning-data table.
 */
export async function signInWithEmail(email: string): Promise<void> {
  const client = requireSupabase();
  assertClean({ email }, { allowAuthIdentifier: true });

  const { error } = await client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw new Error(error.message);
}

export async function verifyEmailCode(email: string, token: string): Promise<Profile | null> {
  const client = requireSupabase();
  const { data, error } = await client.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw new Error(error.message);
  if (!data.user) return null;
  return fetchProfile(data.user.id);
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

/**
 * Whether this account may open the student experience.
 *
 * Local-only mode (no Supabase) is treated as the student: a family that never
 * configures a backend still gets the whole product, which is the point.
 */
export function canRunSessions(state: AuthState): boolean {
  if (!state.available) return true;
  if (!state.signedIn) return true;
  return state.profile?.role !== 'parent';
}

export function isParentViewer(state: AuthState): boolean {
  return state.available && state.signedIn && state.profile?.role === 'parent';
}
