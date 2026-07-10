'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useSession } from '@/hooks/use-session';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { OnlinePanel } from './online-panel';
import { Skeleton } from '@/components/ui/skeleton';

/** Layout principal : sidebar / header / contenu / colonne « En ligne ». */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, isLoading } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return (
      <div className="ambient-bg flex min-h-dvh items-center justify-center">
        <div className="w-full max-w-md space-y-4 p-8">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="ambient-bg flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <AnimatePresence mode="wait">
          <motion.main
            key={pathname}
            initial={reducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8"
          >
            {children}
          </motion.main>
        </AnimatePresence>
      </div>
      <OnlinePanel />
    </div>
  );
}
