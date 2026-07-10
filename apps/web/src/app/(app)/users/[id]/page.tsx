'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ban, MessageSquare, ShieldOff, UserMinus, UserPlus } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useT, useI18n } from '@/lib/i18n';
import { formatDate, timeAgo } from '@/lib/format';
import { useUserActions } from '@/components/layout/user-actions';
import { UserAvatar } from '@/components/ui/avatar';
import { Badge, roleBadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import type { PublicProfile } from '@yurei/shared';

export default function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useT();
  const { locale } = useI18n();
  const actions = useUserActions();
  const queryClient = useQueryClient();
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const { data: profile, isLoading, error } = useQuery<PublicProfile>({
    queryKey: ['profile', id],
    queryFn: () => api(`/users/${id}`),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full rounded-xl2" />
        <Skeleton className="h-24 w-full rounded-xl2" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-slate-400">
          {error instanceof ApiError ? error.message : t.common.error}
        </CardContent>
      </Card>
    );
  }

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['profile', id] });
  };

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div
          className="h-32 bg-gradient-to-r from-spirit-600/40 via-haze-500/30 to-bloom-500/40 bg-cover bg-center md:h-44"
          style={profile.bannerUrl ? { backgroundImage: `url(${profile.bannerUrl})` } : undefined}
        />
        <CardContent className="-mt-10 flex flex-wrap items-end gap-4">
          <UserAvatar
            src={profile.avatarUrl}
            name={profile.displayName}
            size={88}
            status={profile.presence}
            className="rounded-full ring-4 ring-night-900"
          />
          <div className="flex-1 pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-white">{profile.displayName}</h1>
              <Badge variant={roleBadgeVariant[profile.role]}>{t.roles[profile.role]}</Badge>
              {profile.badges.map((b) => (
                <Badge key={b} variant="pink">{b}</Badge>
              ))}
            </div>
            <p className="text-sm text-slate-500">@{profile.username}</p>
            {profile.customStatus && <p className="mt-1 text-sm text-spirit-300">{profile.customStatus}</p>}
          </div>

          {profile.friendshipStatus !== 'SELF' && (
            <div className="flex flex-wrap gap-2 pb-1">
              {profile.friendshipStatus === 'NONE' && (
                <Button size="sm" onClick={() => actions.addFriend(profile.id).then(refresh)}>
                  <UserPlus className="h-4 w-4" /> {t.friends.addFriend}
                </Button>
              )}
              {profile.friendshipStatus === 'PENDING_SENT' && (
                <Badge variant="yellow">{t.friends.outgoing}</Badge>
              )}
              {profile.friendshipStatus === 'PENDING_RECEIVED' && (
                <Link href="/friends?tab=requests">
                  <Button size="sm" variant="secondary">{t.friends.incoming}</Button>
                </Link>
              )}
              {profile.friendshipStatus === 'FRIENDS' && (
                <Button size="sm" variant="outline" onClick={() => setConfirmRemove(true)}>
                  <UserMinus className="h-4 w-4" /> {t.friends.remove}
                </Button>
              )}
              {profile.friendshipStatus !== 'BLOCKED' ? (
                <>
                  <Button size="sm" variant="secondary" onClick={() => void actions.openConversation(profile.id)}>
                    <MessageSquare className="h-4 w-4" /> {t.presence.sendMessage}
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setConfirmBlock(true)}>
                    <Ban className="h-4 w-4" /> {t.friends.block}
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={() => actions.unblock(profile.id).then(refresh)}>
                  <ShieldOff className="h-4 w-4" /> {t.friends.unblock}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t.profile.bio}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
              {profile.bio || '—'}
            </p>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t.profile.stats}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="flex justify-between"><span className="text-slate-500">{t.profile.memberSince}</span><span className="text-slate-200">{formatDate(profile.createdAt, locale)}</span></p>
              <p className="flex justify-between"><span className="text-slate-500">{t.profile.lastSeen}</span><span className="text-slate-200">{profile.lastSeenAt ? timeAgo(profile.lastSeenAt, locale) : '—'}</span></p>
              <p className="flex justify-between"><span className="text-slate-500">{t.dashboard.friends}</span><span className="text-slate-200">{profile.friendCount}</span></p>
              <p className="flex justify-between"><span className="text-slate-500">{t.profile.ticketsCreated}</span><span className="text-slate-200">{profile.stats.tickets}</span></p>
              <p className="flex justify-between"><span className="text-slate-500">{t.profile.messagesSent}</span><span className="text-slate-200">{profile.stats.messages}</span></p>
            </CardContent>
          </Card>

          {profile.mutualFriends.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t.profile.mutualFriends}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {profile.mutualFriends.map((friend) => (
                  <Link key={friend.id} href={`/users/${friend.id}`} className="flex items-center gap-2.5 rounded-lg p-1.5 transition-colors hover:bg-night-700/50">
                    <UserAvatar src={friend.avatarUrl} name={friend.displayName} size={30} />
                    <span className="text-sm text-slate-300">{friend.displayName}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmBlock}
        onOpenChange={setConfirmBlock}
        title={t.friends.block}
        description={t.friends.blockConfirm}
        destructive
        onConfirm={async () => {
          await actions.block(profile.id);
          setConfirmBlock(false);
          refresh();
        }}
      />
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={t.friends.remove}
        description={t.friends.removeConfirm}
        destructive
        onConfirm={async () => {
          try {
            await api(`/friends/${profile.id}`, { method: 'DELETE' });
            toast.success(t.common.saved);
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t.common.error);
          }
          setConfirmRemove(false);
          refresh();
        }}
      />
    </div>
  );
}
