'use client';

import Link from 'next/link';
import { Ghost } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';

export default function NotFound() {
  const t = useT();
  return (
    <main className="ambient-bg flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Ghost className="h-16 w-16 text-spirit-400/60" aria-hidden />
      <div>
        <p className="glow-text text-7xl font-extrabold">404</p>
        <h1 className="mt-2 text-xl font-semibold text-slate-200">{t.errors.notFoundTitle}</h1>
        <p className="mt-1 text-sm text-slate-500">{t.errors.notFoundText}</p>
      </div>
      <Link href="/dashboard">
        <Button>{t.errors.backHome}</Button>
      </Link>
    </main>
  );
}
