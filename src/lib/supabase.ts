/// <reference types="vite/client" />
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let clientPromise: Promise<SupabaseClient<Database> | null> | null = null;

/**
 * Lazily loads @supabase/supabase-js so the static landing page (/) never pays
 * for the Supabase SDK unless Supabase is configured and actually needed.
 */
export function getSupabase(): Promise<SupabaseClient<Database> | null> {
  if (!isSupabaseConfigured) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: 'asha-sakhi-supabase-auth',
        },
      }),
    );
  }
  return clientPromise;
}

/**
 * Returns the active Supabase access token for authenticating /api/gnani/* requests.
 * Automatically refreshes expired tokens when possible.
 */
export async function getActiveAccessToken(): Promise<string | null> {
  const client = await getSupabase();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  const session = data.session;
  if (!session) return null;
  const expiresAtMs = (session.expires_at ?? 0) * 1000;
  if (expiresAtMs && expiresAtMs - Date.now() < 30_000) {
    const refreshed = await client.auth.refreshSession();
    return refreshed.data.session?.access_token ?? session.access_token;
  }
  return session.access_token;
}

export const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim();
