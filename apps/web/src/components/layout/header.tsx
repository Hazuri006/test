'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, Check, Ghost, LogOut, Menu, Search, UserCircle, Users, X } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useSession } from '@/hooks/use-session';
import { useSocket } from '@/hooks/use-socket';
import { useT, useI18n } from '@/lib/i18n';
import { timeAgo } from '@/lib/format';
import { APP_NAME, cn } from '@/lib/utils';
import { UserAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarNav } from './sidebar';
import { OnlineList } from './online-panel';
import type { NotificationDTO, UserSummary } from '@yurei/shared';

function GlobalSearch() {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSummary[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Raccourci clavier Ctrl+K / ⌘K
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const search = useCallback((q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (q.trim().length < 2) {
        setResults([]);
        return;
      }
      void api<UserSummary[]>(`/users/search?q=${encodeURIComponent(q)}`)
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden h-10 w-64 items-center gap-2 rounded-xl border border-spirit-400/15 bg-night-800/60 px-3.5 text-sm text-slate-500 transition-colors hover:border-spirit-400/40 md:flex"
      >
        <Search className="h-4 w-4" aria-hidden />
        {t.nav.searchPlaceholder}
      </button>
      <Button variant="ghost" size="icon" className="md:hidden" aria-label={t.common.search} onClick={() => setOpen(true)}>
        <Search className="h-5 w-5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t.common.search} className="max-w-md">
          <Input
            autoFocus
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder={t.friends.searchPlaceholder}
            aria-label={t.common.search}
          />
          <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
            {results.map((user) => (
              <button
                key={user.id}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-night-700/60"
                onClick={() => {
                  setOpen(false);
                  setQuery('');
                  setResults([]);
                  router.push(`/users/${user.id}`);
                }}
              >
                <UserAvatar src={user.avatarUrl} name={user.displayName} size={34} />
                <span>
                  <span className="block text-sm font-medium text-slate-200">{user.displayName}</span>
                  <span className="block text-xs text-slate-500">@{user.username}</span>
                </span>
              </button>
            ))}
            {query.trim().length >= 2 && results.length === 0 && (
              <p className="px-2 py-3 text-sm text-slate-500">{t.common.empty}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NotificationsMenu() {
  const t = useT();
  const { locale } = useI18n();
  const { unreadNotifications } = useSocket();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: notifications } = useQuery<NotificationDTO[]>({
    queryKey: ['notifications', 'menu'],
    queryFn: () => api('/notifications?unread=true'),
    enabled: open,
  });

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t.notifications.title} className="relative">
          <Bell className="h-5 w-5" />
          {unreadNotifications > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-bloom-500 px-1 text-[10px] font-bold text-white">
              {unreadNotifications > 99 ? '99+' : unreadNotifications}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-semibold text-slate-200">{t.notifications.title}</span>
          <button
            className="text-xs text-spirit-400 hover:underline"
            onClick={() => {
              void api('/notifications/read-all', { method: 'POST' }).then(() =>
                queryClient.invalidateQueries({ queryKey: ['notifications'] }),
              );
            }}
          >
            {t.notifications.markAllRead}
          </button>
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-80 overflow-y-auto">
          {(notifications ?? []).slice(0, 8).map((n) => (
            <DropdownMenuItem key={n.id} asChild>
              <Link href={n.link ?? '/notifications'} className="flex flex-col items-start gap-0.5">
                <span className="text-sm font-medium text-slate-100">{n.title}</span>
                {n.body && <span className="line-clamp-2 text-xs text-slate-400">{n.body}</span>}
                <span className="text-[11px] text-slate-500">{timeAgo(n.createdAt, locale)}</span>
              </Link>
            </DropdownMenuItem>
          ))}
          {(notifications ?? []).length === 0 && (
            <p className="px-3 py-4 text-center text-sm text-slate-500">{t.notifications.empty}</p>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/notifications" className="justify-center text-spirit-400">
            {t.common.seeAll}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Header() {
  const t = useT();
  const { locale, setLocale } = useI18n();
  const { user, logout } = useSession();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [onlineOpen, setOnlineOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-spirit-400/10 bg-night-900/70 px-4 backdrop-blur-xl md:px-6">
      {/* Menu mobile */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        aria-label={t.nav.menu}
        onClick={() => setMobileNavOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>
      <Link href="/dashboard" className="flex items-center gap-2 lg:hidden">
        <Ghost className="h-5 w-5 text-spirit-400" aria-hidden />
        <span className="font-bold text-white">{APP_NAME}</span>
      </Link>

      <div className="flex-1" />
      <GlobalSearch />

      {/* Liste en ligne (mobile/tablette) */}
      <Button
        variant="ghost"
        size="icon"
        className="xl:hidden"
        aria-label={t.presence.title}
        onClick={() => setOnlineOpen(true)}
      >
        <Users className="h-5 w-5" />
      </Button>

      <NotificationsMenu />

      {user && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-xl p-1 transition-colors hover:bg-night-700/60" aria-label={user.displayName}>
              <UserAvatar src={user.avatarUrl} name={user.displayName} size={34} />
              <span className="hidden text-sm font-medium text-slate-200 sm:block">{user.displayName}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href="/profile">
                <UserCircle className="h-4 w-4" /> {t.nav.profile}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setLocale(locale === 'fr' ? 'en' : 'fr')}>
              <Check className="h-4 w-4" /> {locale === 'fr' ? 'English' : 'Français'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-danger" onSelect={() => void logout()}>
              <LogOut className="h-4 w-4" /> {t.nav.logout}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Tiroir navigation mobile */}
      <div
        className={cn(
          'fixed inset-0 z-50 transition-opacity lg:hidden',
          mobileNavOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
        aria-hidden={!mobileNavOpen}
      >
        <div className="absolute inset-0 bg-night-950/80 backdrop-blur-sm" onClick={() => setMobileNavOpen(false)} />
        <div
          className={cn(
            'absolute left-0 top-0 h-full w-72 border-r border-spirit-400/10 bg-night-900 p-4 transition-transform duration-300',
            mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="mb-6 flex items-center justify-between">
            <span className="flex items-center gap-2 font-bold text-white">
              <Ghost className="h-5 w-5 text-spirit-400" /> {APP_NAME}
            </span>
            <Button variant="ghost" size="icon" aria-label={t.common.close} onClick={() => setMobileNavOpen(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>
          <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
        </div>
      </div>

      {/* Panneau coulissant « En ligne » (mobile) */}
      <div
        className={cn(
          'fixed inset-0 z-50 transition-opacity xl:hidden',
          onlineOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
        aria-hidden={!onlineOpen}
      >
        <div className="absolute inset-0 bg-night-950/80 backdrop-blur-sm" onClick={() => setOnlineOpen(false)} />
        <div
          className={cn(
            'absolute right-0 top-0 h-full w-80 overflow-y-auto border-l border-spirit-400/10 bg-night-900 p-4 transition-transform duration-300',
            onlineOpen ? 'translate-x-0' : 'translate-x-full',
          )}
        >
          <div className="mb-4 flex justify-end">
            <Button variant="ghost" size="icon" aria-label={t.common.close} onClick={() => setOnlineOpen(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>
          <OnlineList />
        </div>
      </div>
    </header>
  );
}
