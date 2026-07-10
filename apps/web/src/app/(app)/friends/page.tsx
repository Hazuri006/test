'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MessageSquare, Search, ShieldOff, UserMinus, UserPlus, Users } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useT, useI18n } from '@/lib/i18n';
import { formatDate } from '@/lib/format';
import { useUserActions } from '@/components/layout/user-actions';
import { UserAvatar } from '@/components/ui/avatar';
import { Badge, roleBadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { FriendEntry, FriendRequestEntry, UserSummary } from '@yurei/shared';

function FriendsContent() {
  const t = useT();
  const { locale } = useI18n();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const actions = useUserActions();
  const [searchQuery, setSearchQuery] = useState('');
  const [removeTarget, setRemoveTarget] = useState<FriendEntry | null>(null);

  const defaultTab = searchParams.get('tab') === 'requests' ? 'requests' : 'friends';

  const { data: friends, isLoading: loadingFriends } = useQuery<FriendEntry[]>({
    queryKey: ['friends', 'list'],
    queryFn: () => api('/friends'),
  });
  const { data: requests, isLoading: loadingRequests } = useQuery<FriendRequestEntry[]>({
    queryKey: ['friends', 'requests'],
    queryFn: () => api('/friends/requests'),
  });
  const { data: blocked } = useQuery<UserSummary[]>({
    queryKey: ['friends', 'blocked'],
    queryFn: () => api('/friends/blocked'),
  });
  const { data: searchResults } = useQuery<UserSummary[]>({
    queryKey: ['friends', 'search', searchQuery],
    queryFn: () => api(`/users/search?q=${encodeURIComponent(searchQuery)}`),
    enabled: searchQuery.trim().length >= 2,
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['friends'] });
  };

  const requestAction = async (id: string, action: 'accept' | 'decline' | 'cancel'): Promise<void> => {
    try {
      await api(`/friends/requests/${id}/${action}`, { method: 'POST' });
      if (action === 'accept') toast.success(t.friends.requestAccepted);
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t.common.error);
    }
  };

  const incoming = (requests ?? []).filter((r) => r.direction === 'INCOMING');
  const outgoing = (requests ?? []).filter((r) => r.direction === 'OUTGOING');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">{t.friends.title}</h1>

      {/* Recherche de membres */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-4 w-4 text-spirit-400" aria-hidden /> {t.friends.searchTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.friends.searchPlaceholder}
            aria-label={t.friends.searchTitle}
          />
          {(searchResults ?? []).length > 0 && (
            <div className="mt-3 space-y-1">
              {(searchResults ?? []).map((user) => (
                <div key={user.id} className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-night-700/40">
                  <UserAvatar src={user.avatarUrl} name={user.displayName} size={36} />
                  <Link href={`/users/${user.id}`} className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-200">{user.displayName}</span>
                    <span className="block text-xs text-slate-500">@{user.username}</span>
                  </Link>
                  <Button size="sm" variant="outline" onClick={() => void actions.addFriend(user.id)}>
                    <UserPlus className="h-4 w-4" /> {t.friends.addFriend}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="friends">
            {t.friends.tabs.friends} ({friends?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="requests">
            {t.friends.tabs.requests} ({requests?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="blocked">
            {t.friends.tabs.blocked} ({blocked?.length ?? 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="friends">
          {loadingFriends ? (
            <ListSkeleton />
          ) : (friends ?? []).length === 0 ? (
            <EmptyState icon={Users} title={t.friends.noFriends} />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {(friends ?? []).map((friend) => (
                <Card key={friend.user.id} className="glass-hover">
                  <CardContent className="flex items-center gap-3 p-4">
                    <UserAvatar src={friend.user.avatarUrl} name={friend.user.displayName} size={44} status={friend.presence} />
                    <Link href={`/users/${friend.user.id}`} className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium text-slate-100">{friend.user.displayName}</span>
                        <Badge variant={roleBadgeVariant[friend.user.role]}>{t.roles[friend.user.role]}</Badge>
                      </span>
                      <span className="block text-xs text-slate-500">
                        {t.friends.since} {formatDate(friend.since, locale)}
                      </span>
                    </Link>
                    <Button size="icon" variant="ghost" aria-label={t.presence.sendMessage} onClick={() => void actions.openConversation(friend.user.id)}>
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label={t.friends.remove} className="text-danger" onClick={() => setRemoveTarget(friend)}>
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="requests">
          {loadingRequests ? (
            <ListSkeleton />
          ) : (requests ?? []).length === 0 ? (
            <EmptyState icon={UserPlus} title={t.friends.noRequests} />
          ) : (
            <div className="space-y-6">
              {incoming.length > 0 && (
                <section>
                  <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-400">{t.friends.incoming}</h2>
                  <div className="space-y-2">
                    {incoming.map((request) => (
                      <Card key={request.id}>
                        <CardContent className="flex items-center gap-3 p-4">
                          <UserAvatar src={request.user.avatarUrl} name={request.user.displayName} size={40} />
                          <Link href={`/users/${request.user.id}`} className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-slate-100">{request.user.displayName}</span>
                            <span className="block text-xs text-slate-500">{formatDate(request.createdAt, locale)}</span>
                          </Link>
                          <Button size="sm" onClick={() => void requestAction(request.id, 'accept')}>
                            {t.friends.accept}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => void requestAction(request.id, 'decline')}>
                            {t.friends.decline}
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </section>
              )}
              {outgoing.length > 0 && (
                <section>
                  <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-400">{t.friends.outgoing}</h2>
                  <div className="space-y-2">
                    {outgoing.map((request) => (
                      <Card key={request.id}>
                        <CardContent className="flex items-center gap-3 p-4">
                          <UserAvatar src={request.user.avatarUrl} name={request.user.displayName} size={40} />
                          <Link href={`/users/${request.user.id}`} className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-slate-100">{request.user.displayName}</span>
                            <span className="block text-xs text-slate-500">{formatDate(request.createdAt, locale)}</span>
                          </Link>
                          <Button size="sm" variant="ghost" onClick={() => void requestAction(request.id, 'cancel')}>
                            {t.friends.cancel}
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="blocked">
          {(blocked ?? []).length === 0 ? (
            <EmptyState icon={ShieldOff} title={t.friends.noBlocked} />
          ) : (
            <div className="space-y-2">
              {(blocked ?? []).map((user) => (
                <Card key={user.id}>
                  <CardContent className="flex items-center gap-3 p-4">
                    <UserAvatar src={user.avatarUrl} name={user.displayName} size={40} />
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-300">{user.displayName}</span>
                    <Button size="sm" variant="outline" onClick={() => actions.unblock(user.id)}>
                      <ShieldOff className="h-4 w-4" /> {t.friends.unblock}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title={t.friends.remove}
        description={t.friends.removeConfirm}
        destructive
        onConfirm={async () => {
          if (!removeTarget) return;
          try {
            await api(`/friends/${removeTarget.user.id}`, { method: 'DELETE' });
            invalidate();
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t.common.error);
          }
          setRemoveTarget(null);
        }}
      />
    </div>
  );
}

export default function FriendsPage() {
  return (
    <Suspense>
      <FriendsContent />
    </Suspense>
  );
}
