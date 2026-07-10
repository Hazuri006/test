'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { Ghost } from 'lucide-react';
import { Particles } from '@/components/effects/particles';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';
import { API_URL, APP_NAME } from '@/lib/utils';

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
      <path d="M20.317 4.37a19.8 19.8 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.3 18.3 0 0 0-5.487 0 12.6 12.6 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.7 19.7 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13 13 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.8 19.8 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419s.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419s.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function LoginContent() {
  const t = useT();
  const searchParams = useSearchParams();
  const [connecting, setConnecting] = useState(false);
  const reducedMotion = useReducedMotion();

  const errorKey = searchParams.get('error') as keyof typeof t.login.errors | null;
  const errorMessage = errorKey ? t.login.errors[errorKey] ?? t.common.error : null;

  return (
    <main className="ambient-bg relative flex min-h-dvh items-center justify-center overflow-hidden px-4">
      <Particles />

      {/* Formes abstraites flottantes */}
      {!reducedMotion && (
        <>
          <div className="animate-float absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-spirit-600/15 blur-3xl" aria-hidden />
          <div className="animate-float absolute -right-16 bottom-1/4 h-80 w-80 rounded-full bg-haze-500/10 blur-3xl [animation-delay:-6s]" aria-hidden />
          <div className="animate-float absolute left-1/2 top-3/4 h-56 w-56 rounded-full bg-bloom-500/10 blur-3xl [animation-delay:-3s]" aria-hidden />
        </>
      )}

      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="glass relative z-10 w-full max-w-md rounded-3xl p-8 text-center md:p-10"
      >
        <motion.div
          initial={reducedMotion ? false : { scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 200, damping: 14 }}
          className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-spirit-600 via-haze-500 to-bloom-500 shadow-2xl shadow-spirit-600/40"
        >
          <Ghost className="h-10 w-10 text-white" aria-hidden />
        </motion.div>

        <p className="text-sm uppercase tracking-[0.25em] text-slate-400">{t.login.title}</p>
        <h1 className="glow-text mt-1 text-4xl font-extrabold tracking-tight">{APP_NAME}</h1>
        <p className="mt-4 text-sm leading-relaxed text-slate-400">{t.login.subtitle}</p>

        {errorMessage && (
          <div role="alert" className="mt-5 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {errorMessage}
          </div>
        )}

        <Button
          size="lg"
          loading={connecting}
          className="mt-7 w-full bg-[#5865F2] from-[#5865F2] to-[#5865F2] hover:brightness-110"
          onClick={() => {
            setConnecting(true);
            window.location.href = `${API_URL}/api/auth/discord`;
          }}
        >
          {!connecting && <DiscordIcon />}
          {connecting ? t.login.connecting : t.login.cta}
        </Button>

        <div className="mt-8 flex items-center justify-center gap-4 text-xs text-slate-500">
          <Link href="/legal/terms" className="transition-colors hover:text-slate-300">
            {t.login.terms}
          </Link>
          <span aria-hidden>·</span>
          <Link href="/legal/privacy" className="transition-colors hover:text-slate-300">
            {t.login.privacy}
          </Link>
        </div>
      </motion.div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
