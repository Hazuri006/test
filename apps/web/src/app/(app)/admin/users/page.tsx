'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Gavel, RefreshCw, ShieldCheck } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useT, useI18n } from '@/lib/i18n';
import { formatDate, formatDateTime } from '@/lib/format';
import { useSession } from '@/hooks/use-session';
import { UserAvatar } from '@/components/ui/avatar';
import { Badge, roleBadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PERMISSIONS, ROLE_NAMES } from '@yurei/shared';
import type { ModerationActionDTO, Paginated, RoleName, UserSummary } from '@yurei/shared';

interface AdminUserRow extends UserSummary {
  discordId: string;
  createdAt: string;
  lastLoginAt: string | null;
  suspendedUntil: string | null;
  bannedAt: string | null;
  banReason: string | null;
}

type SanctionType = 'WARN' | 'SUSPEND' | 'TEMP_BAN' | 'BAN' | 'NOTE';

export default function AdminUsersPage() {
  const t = useT();
  const { locale } = useI18n();
  const { can } = useSession();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<AdminUserRow | null>(null);
  const [mode, setMode] = useState<'menu' | 'role' | 'sanction' | 'history'>('menu');
  const [roleChoice, setRoleChoice] = useState<RoleName>('MEMBER');
  const [sanctionType, setSanctionType] = useState<SanctionType>('WARN');
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('24');
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery<Paginated<AdminUserRow>>({
    queryKey: ['admin', 'users', search],
    queryFn: () => api(`/admin/users?q=${encodeURIComponent(search)}`),
  });

  const { data: history } = useQuery<{ user: AdminUserRow; moderation: ModerationActionDTO[] }>({
    queryKey: ['admin', 'users', 'detail', target?.id],
    queryFn: () => api(`/admin/users/${target!.id}`),
    enabled: !!target && mode === 'history',
  });

  const closeDialog = (): void => {
    setTarget(null);
    setMode('menu');
    setReason('');
  };

  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    try {
      await fn();
      toast.success(t.admin.users.actionDone);
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
      closeDialog();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t.common.error);
    } finally {
      setBusy(false);
    }
  };

  const needsDuration = sanctionType === 'SUSPEND' || sanctionType === 'TEMP_BAN';

  return (
    <div className="space-y-4">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t.admin.users.search}
        aria-label={t.admin.users.search}
        className="max-w-md"
      />

      {isLoading ? (
        <ListSkeleton rows={8} />
      ) : (
        <div className="space-y-2">
          {(data?.items ?? []).map((row) => (
            <Card key={row.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <UserAvatar src={row.avatarUrl} name={row.displayName} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <Link href={`/users/${row.id}`} className="truncate font-medium text-slate-100 hover:text-white">
                      {row.displayName}
                    </Link>
                    <Badge variant={roleBadgeVariant[row.role]}>{t.roles[row.role]}</Badge>
                    {row.bannedAt && <Badge variant="red">{t.admin.users.banned}</Badge>}
                    {row.suspendedUntil && new Date(row.suspendedUntil) > new Date() && (
                      <Badge variant="yellow">{t.admin.users.suspended}</Badge>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    @{row.username} · Discord {row.discordId} · {formatDate(row.createdAt, locale)}
                  </p>
                </div>
                {can(PERMISSIONS.ROLES_MANAGE) && (
                  <Button size="sm" variant="ghost" onClick={() => { setTarget(row); setMode('role'); setRoleChoice(row.role); }}>
                    <ShieldCheck className="h-4 w-4" /> {t.admin.users.changeRole}
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="text-warning" onClick={() => { setTarget(row); setMode('sanction'); }}>
                  <Gavel className="h-4 w-4" /> {t.admin.users.moderate}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setTarget(row); setMode('history'); }}>
                  {t.admin.users.history}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialogue rôle */}
      <Dialog open={!!target && mode === 'role'} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent title={`${t.admin.users.changeRole} — ${target?.displayName ?? ''}`}>
          <div className="space-y-4">
            <Select value={roleChoice} onValueChange={(v) => setRoleChoice(v as RoleName)}>
              <SelectTrigger aria-label={t.admin.users.role}><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLE_NAMES.map((role) => (
                  <SelectItem key={role} value={role}>{t.roles[role]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={`${t.common.reason} (${t.common.required})`}
              aria-label={t.common.reason}
            />
            <div className="flex justify-end gap-2">
              {can(PERMISSIONS.ROLES_MANAGE) && target && (
                <Button
                  variant="ghost"
                  onClick={() => void run(() => api(`/admin/users/${target.id}/discord-sync`, { method: 'POST' }))}
                >
                  <RefreshCw className="h-4 w-4" /> {t.admin.users.syncDiscord}
                </Button>
              )}
              <Button
                loading={busy}
                disabled={reason.trim().length < 3}
                onClick={() =>
                  void run(() =>
                    api(`/admin/users/${target!.id}/role`, {
                      method: 'POST',
                      body: { roleName: roleChoice, reason: reason.trim() },
                    }),
                  )
                }
              >
                {t.common.confirm}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialogue sanction */}
      <Dialog open={!!target && mode === 'sanction'} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent title={`${t.admin.users.moderate} — ${target?.displayName ?? ''}`} description={t.admin.users.confirmAction}>
          <div className="space-y-4">
            <Select value={sanctionType} onValueChange={(v) => setSanctionType(v as SanctionType)}>
              <SelectTrigger aria-label={t.admin.users.moderate}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="WARN">{t.admin.users.warn}</SelectItem>
                <SelectItem value="SUSPEND">{t.admin.users.suspend}</SelectItem>
                <SelectItem value="TEMP_BAN">{t.admin.users.tempBan}</SelectItem>
                <SelectItem value="BAN">{t.admin.users.ban}</SelectItem>
                <SelectItem value="NOTE">{t.admin.users.note}</SelectItem>
              </SelectContent>
            </Select>
            {needsDuration && (
              <div>
                <Label htmlFor="sanction-duration">{t.admin.users.durationHours}</Label>
                <Input
                  id="sanction-duration"
                  type="number"
                  min={1}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
              </div>
            )}
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={`${t.common.reason} (${t.common.required})`}
              aria-label={t.common.reason}
            />
            <div className="flex justify-end">
              <Button
                variant="danger"
                loading={busy}
                disabled={reason.trim().length < 3 || (needsDuration && Number(duration) < 1)}
                onClick={() =>
                  void run(() =>
                    api(`/admin/users/${target!.id}/moderation`, {
                      method: 'POST',
                      body: {
                        type: sanctionType,
                        reason: reason.trim(),
                        ...(needsDuration ? { durationHours: Number(duration) } : {}),
                      },
                    }),
                  )
                }
              >
                {t.common.confirm}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Historique de modération */}
      <Dialog open={!!target && mode === 'history'} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent title={`${t.admin.users.history} — ${target?.displayName ?? ''}`} className="max-w-xl">
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {(history?.moderation ?? []).length === 0 && (
              <p className="py-4 text-center text-sm text-slate-500">{t.common.empty}</p>
            )}
            {(history?.moderation ?? []).map((action) => (
              <div key={action.id} className="rounded-lg border border-spirit-400/10 bg-night-800/60 p-3 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <Badge variant={action.revokedAt ? 'gray' : action.type === 'NOTE' ? 'blue' : 'red'}>
                    {action.type}
                  </Badge>
                  <span className="text-xs text-slate-500">
                    {formatDateTime(action.createdAt, locale)} · {action.moderator.displayName}
                  </span>
                </p>
                <p className="mt-1 text-slate-300">{action.reason}</p>
                {action.expiresAt && !action.revokedAt && (
                  <p className="text-xs text-slate-500">→ {formatDateTime(action.expiresAt, locale)}</p>
                )}
                {!action.revokedAt && action.type !== 'NOTE' && action.type !== 'UNBAN' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => {
                      const revokeReason = window.prompt(t.common.reason);
                      if (revokeReason && revokeReason.trim().length >= 3) {
                        void run(() =>
                          api(`/admin/users/${target!.id}/moderation/revoke`, {
                            method: 'POST',
                            body: { actionId: action.id, reason: revokeReason.trim() },
                          }),
                        );
                      }
                    }}
                  >
                    {t.admin.users.revoke}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
