import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { env } from './env';

const supabaseUrl = env.SUPABASE_URL;
const supabaseAnonKey = env.SUPABASE_ANON_KEY;

const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

let _authReady: Promise<void> | null = null;

export function ensureAuth(): Promise<void> {
  if (!supabaseUrl || !supabaseAnonKey) return Promise.resolve();
  if (_authReady) return _authReady;

  _authReady = (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) return;

    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.error('[supabase] anonymous sign-in failed:', error.message);
      _authReady = null;
    }
  })();

  return _authReady;
}

export async function getAuthUid(): Promise<string | null> {
  await ensureAuth();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}
