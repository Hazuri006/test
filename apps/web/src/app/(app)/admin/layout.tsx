'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useSession } from '@/hooks/use-session';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { PERMISSIONS } from '@yurei/shared';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const { user, can, isLoading } = useSession();

  // La vraie protection est côté API ; ici on évite juste d'afficher la page.
  useEffect(() => {
    if (!isLoading && user && !can(PERMISSIONS.ADMIN_ACCESS)) router.replace('/dashboard');
  }, [isLoading, user, can, router]);

  if (!can(PERMISSIONS.ADMIN_ACCESS)) return null;

  const sections = [
    { href: '/admin', label: t.admin.sections.overview, exact: true },
    { href: '/admin/users', label: t.admin.sections.users },
    { href: '/admin/roles', label: t.admin.sections.roles },
    { href: '/admin/reports', label: t.admin.sections.reports },
    { href: '/admin/audit', label: t.admin.sections.audit },
    ...(can(PERMISSIONS.SETTINGS_MANAGE) ? [{ href: '/admin/settings', label: t.admin.sections.settings }] : []),
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">{t.admin.title}</h1>
      <nav aria-label={t.admin.title} className="flex flex-wrap gap-1 rounded-xl border border-spirit-400/10 bg-night-800/60 p-1">
        {sections.map((section) => {
          const active = section.exact ? pathname === section.href : pathname.startsWith(section.href);
          return (
            <Link
              key={section.href}
              href={section.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-lg px-3.5 py-1.5 text-sm transition-colors',
                active ? 'bg-spirit-600/25 text-white' : 'text-slate-400 hover:text-slate-200',
              )}
            >
              {section.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
