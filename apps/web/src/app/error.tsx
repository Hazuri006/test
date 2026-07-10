'use client';

import { Ghost } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const t = useT();
  return (
    <main className="ambient-bg flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Ghost className="h-16 w-16 text-danger/60" aria-hidden />
      <div>
        <p className="glow-text text-7xl font-extrabold">500</p>
        <h1 className="mt-2 text-xl font-semibold text-slate-200">{t.errors.serverErrorTitle}</h1>
        <p className="mt-1 text-sm text-slate-500">{t.errors.serverErrorText}</p>
      </div>
      <Button onClick={reset}>{t.errors.retry}</Button>
    </main>
  );
}
