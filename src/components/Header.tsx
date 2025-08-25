'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function Header() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  return (
    <header className="sticky top-0 z-20 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className="max-w-6xl mx-auto px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between">
        <Link href="/" className="text-lg sm:text-xl font-semibold">Compoundly</Link>
        <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm">
          {user ? (
            <>
              <span className="hidden sm:inline text-gray-600">Signed in as {user.email}</span>
              <button
                onClick={async () => { await signOut(); router.replace('/login'); }}
                className="rounded-lg bg-gray-900 text-white px-3 py-1.5"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link href="/login" className="rounded-lg bg-blue-600 text-white px-3 py-1.5">Sign in</Link>
          )}
        </div>
      </div>
    </header>
  );
}
