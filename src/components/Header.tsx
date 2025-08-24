'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function Header() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  return (
    <header className="border-b bg-white">
      <div className="max-w-6xl mx-auto p-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-semibold">Compoundly</Link>
        <div className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              <span className="text-gray-600">Signed in as {user.email}</span>
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
