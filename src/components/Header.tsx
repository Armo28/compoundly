'use client';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';

const tabs = [
  { href: '/', label: 'Dashboard' },
  { href: '/accounts', label: 'Accounts' },
  { href: '/room', label: 'Room' },
  { href: '/goals', label: 'Goals' },
];

export default function Header() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <header className="border-b bg-white">
      <div className="max-w-6xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-xl font-semibold">Compoundly</Link>

          <div className="hidden md:flex items-center gap-4">
            {tabs.map(t => (
              <Link
                key={t.href}
                href={t.href}
                className={`text-sm px-2 py-1 rounded-md ${
                  pathname === t.href ? 'bg-gray-100 font-medium' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3 text-sm">
            {user ? (
              <>
                <span className="text-gray-600 hidden sm:inline">Signed in as {user.email}</span>
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

        <div className="md:hidden mt-2 flex items-center gap-2 overflow-x-auto">
          {tabs.map(t => (
            <Link
              key={t.href}
              href={t.href}
              className={`shrink-0 text-xs px-2 py-1 rounded-md ${
                pathname === t.href ? 'bg-gray-100 font-medium' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}
