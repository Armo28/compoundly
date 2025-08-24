import './globals.css';
import type { Metadata } from 'next';
import Providers from './providers';
import Header from '@/components/Header';
import { Analytics } from '@vercel/analytics/react';

export const metadata: Metadata = { title: 'Compoundly', description: 'Plan and track your investments' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        <Providers>
          <Header />
          {children}
          <Analytics />
        </Providers>
      </body>
    </html>
  );
}
