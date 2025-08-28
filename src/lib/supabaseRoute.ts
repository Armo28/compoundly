import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export function routeClient() {
  const cookieStore = cookies();

  // These envs already exist in your project
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // Use Next’s cookie adapter so Supabase Auth sees the user session cookie
  return createServerClient(url, anon, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set() { /* Next automatically sets cookies via responses if needed */ },
      remove() { /* noop */ },
    },
  });
}
