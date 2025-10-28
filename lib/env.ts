export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export function assertEnv() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn(
        'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Create a .env file from .env.example.',
      );
    }
  }
}
