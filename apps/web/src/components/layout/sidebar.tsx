'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  Ghost,
  LayoutDashboard,
  MessageSquare,
  Newspaper,
  Shield,
  Ticket,
  UserCircle,
  Users,
  Wrench,
} from 'lucide-react';
import { cn, APP_NAME } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { useSession } from '@/hooks/use-session';
import { useSocket } from '@/hooks/use-socket';
import { PERMISSIONS } from '@yurei/shared';

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const t = useT();
  const pathname = usePathname();
  const { can } = useSession();
  const { unreadNotifications } = useSocket();

  const items = [
    { href: '/dashboard', label: t.nav.dashboard, icon: LayoutDashboard },
    { href: '/profile', label: t.nav.profile, icon: UserCircle },
    { href: '/friends', label: t.nav.friends, icon: Users },
    { href: '/messages', label: t.nav.messages, icon: MessageSquare },
    { href: '/tickets', label: t.nav.tickets, icon: Ticket },
    ...(can(PERMISSIONS.TICKETS_VIEW_ALL)
      ? [{ href: '/staff/tickets', label: t.nav.staffTickets, icon: Wrench }]
      : []),
    { href: '/news', label: t.nav.news, icon: Newspaper },
    { href: '/notifications', label: t.nav.notifications, icon: Bell, badge: unreadNotifications },
    ...(can(PERMISSIONS.ADMIN_ACCESS) ? [{ href: '/admin', label: t.nav.admin, icon: Shield }] : []),
  ];

  return (
    <nav aria-label={t.nav.menu} className="flex flex-col gap-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200',
              active
                ? 'bg-gradient-to-r from-spirit-600/25 to-haze-500/10 text-white shadow-inner'
                : 'text-slate-400 hover:bg-night-700/60 hover:text-slate-100',
            )}
          >
            <Icon
              className={cn('h-[18px] w-[18px] transition-colors', active ? 'text-spirit-300' : 'text-slate-500 group-hover:text-spirit-400')}
              aria-hidden
            />
            <span className="flex-1">{item.label}</span>
            {'badge' in item && (item.badge ?? 0) > 0 && (
              <span className="rounded-full bg-bloom-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-spirit-400/10 bg-night-900/60 px-4 py-6 backdrop-blur-xl lg:flex">
      <Link href="/dashboard" className="mb-8 flex items-center gap-2.5 px-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-spirit-600 to-bloom-500 shadow-lg shadow-spirit-600/30">
          <Ghost className="h-5 w-5 text-white" aria-hidden />
        </span>
        <span className="text-lg font-bold tracking-tight text-white">{APP_NAME}</span>
      </Link>
      <SidebarNav />
    </aside>
  );
}
