import { createClient } from '@supabase/supabase-js';

// A missing variable is `undefined` locally but an empty string in a CI build,
// so normalise both to "not set" before deciding anything.
const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

export const isConfigured = Boolean(url && anonKey);

if (!isConfigured) {
  console.warn(
    '[ChipTable] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — see the README.',
  );
}

// createClient throws on an empty URL, which would blank the whole app before
// the setup screen gets a chance to say what's missing. Placeholders keep the
// module importable; isConfigured is what decides whether anything talks to it.
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key',
  {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 20 } },
  },
);

export const FUNCTION_URL = `${url}/functions/v1/game`;
export const ANON_KEY = anonKey;
