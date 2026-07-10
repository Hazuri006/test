'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MoreHorizontal, UserPlus, MessageSquare, Ban, Eye } from 'lucide-react';
import { UserAvatar } from '@/components/ui/avatar';
import { Badge, roleBadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useSocket } from '@/hooks/use-socket';
import { useSession } from '@/hooks/use-session';
import { useUserActions } from './user-actions';
import { useT, useI18n } from '@/lib/i18n';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { PresenceEntry } from '@yurei/shared';

function statusDot(status: PresenceEntry['status']): string {
  if (status === 'ONLINE') return 'bg-success';
  if (status === 'AWAY') return 'bg-warning';
  return 'bg-slate-500';
}

export function OnlineList() {
  const t = useT();
  const { locale } = useI18n();
  const { onlineUsers } = useSocket();
  const { user: me } = useSession();
  const actions = useUserActions();
  const [selected, setSelected] = useState<PresenceEntry | null>(null);
  const [blockTarget, setBlockTarget] = useState<PresenceEntry | null>(null);

  return (
    <div className="flex flex-col gap-1.5">
      <h2 className="mb-2 flex items-center gap-2 px-1 text-sm font-semibold uppercase tracking-wider text-slate-400">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
        </span>
        {t.presence.title} — {onlineUsers.length}
      </h2>

      {onlineUsers.length === 0 && (
        <p className="px-1 text-sm text-slate-500">{t.presence.nobody}</p>
      )}

      {onlineUsers.map((entry) => (
        <button
          key={entry.user.id}
          onClick={() => setSelected(entry)}
          className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-night-700/50"
        >
          <UserAvatar src={entry.user.avatarUrl} name={entry.user.displayName} size={36} status={entry.status} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-200">{entry.user.displayName}</span>
            <span className="block truncate text-xs text-slate-500">
              {entry.activity || t.roles[entry.user.role]}
            </span>
          </span>
          <span className={cn('h-2 w-2 shrink-0 rounded-full', statusDot(entry.status))} aria-hidden />
        </button>
      ))}

      {/* Carte utilisateur au clic */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        {selected && (
          <DialogContent title={selected.user.displayName} className="max-w-sm">
            <div className="flex flex-col items-center gap-3 text-center">
              <UserAvatar
                src={selected.user.avatarUrl}
                name={selected.user.displayName}
                size={88}
                status={selected.status}
              />
              <div>
                <p className="text-lg font-semibold text-white">{selected.user.displayName}</p>
                <p className="text-sm text-slate-500">@{selected.user.username}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={roleBadgeVariant[selected.user.role]}>{t.roles[selected.user.role]}</Badge>
                <span className="text-xs text-slate-500">
                  {t.presence.lastActive} {timeAgo(selected.lastActiveAt, locale)}
                </span>
              </div>
              {selected.user.id !== me?.id && (
                <div className="mt-2 flex w-full flex-col gap-2">
                  <Link href={`/users/${selected.user.id}`} onClick={() => setSelected(null)}>
                    <Button variant="secondary" className="w-full">
                      <Eye className="h-4 w-4" /> {t.common.viewProfile}
                    </Button>
                  </Link>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void actions.addFriend(selected.user.id)}
                    >
                      <UserPlus className="h-4 w-4" /> {t.presence.addFriend}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelected(null);
                        void actions.openConversation(selected.user.id);
                      }}
                    >
                      <MessageSquare className="h-4 w-4" /> {t.presence.sendMessage}
                    </Button>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" aria-label="Plus d'actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        className="text-danger"
                        onSelect={() => {
                          setBlockTarget(selected);
                          setSelected(null);
                        }}
                      >
                        <Ban className="h-4 w-4" /> {t.presence.block}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>

      <ConfirmDialog
        open={!!blockTarget}
        onOpenChange={(open) => !open && setBlockTarget(null)}
        title={t.friends.block}
        description={t.friends.blockConfirm}
        destructive
        onConfirm={async () => {
          if (blockTarget) await actions.block(blockTarget.user.id);
          setBlockTarget(null);
        }}
      />
    </div>
  );
}

export function OnlinePanel() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 overflow-y-auto border-l border-spirit-400/10 bg-night-900/60 px-4 py-6 backdrop-blur-xl xl:block">
      <OnlineList />
    </aside>
  );
}
