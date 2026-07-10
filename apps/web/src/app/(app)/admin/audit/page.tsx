'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { api } from '@/lib/api';
import { useT, useI18n } from '@/lib/i18n';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { ListSkeleton } from '@/components/ui/skeleton';
import type { AuditLogDTO, Paginated } from '@yurei/shared';

export default function AdminAuditPage() {
  const t = useT();
  const { locale } = useI18n();
  const [actionFilter, setActionFilter] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [pages, setPages] = useState<AuditLogDTO[][]>([]);

  const { data, isLoading } = useQuery<Paginated<AuditLogDTO>>({
    queryKey: ['admin', 'audit', actionFilter, cursor],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (actionFilter.trim()) params.set('action', actionFilter.trim());
      if (cursor) params.set('cursor', cursor);
      const page = await api<Paginated<AuditLogDTO>>(`/admin/audit?${params.toString()}`);
      setPages((prev) => (cursor ? [...prev, page.items] : [page.items]));
      return page;
    },
  });

  const logs = pages.flat();

  return (
    <div className="space-y-4">
      <Input
        value={actionFilter}
        onChange={(e) => {
          setActionFilter(e.target.value);
          setCursor(undefined);
          setPages([]);
        }}
        placeholder={`${t.admin.audit.action}…`}
        aria-label={t.admin.audit.action}
        className="max-w-sm"
      />

      {isLoading && logs.length === 0 ? (
        <ListSkeleton rows={8} />
      ) : logs.length === 0 ? (
        <EmptyState icon={ScrollText} title={t.common.empty} />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-spirit-400/10 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">{t.admin.audit.when}</th>
                  <th className="px-4 py-3">{t.admin.audit.actor}</th>
                  <th className="px-4 py-3">{t.admin.audit.action}</th>
                  <th className="px-4 py-3">{t.admin.audit.target}</th>
                  <th className="px-4 py-3">{t.common.reason}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-spirit-400/5 hover:bg-night-800/40">
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">
                      {formatDateTime(log.createdAt, locale)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-300">{log.actor?.displayName ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <code className="rounded bg-night-800 px-1.5 py-0.5 text-xs text-spirit-300">{log.action}</code>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">
                      {log.targetType ? `${log.targetType}:${log.targetId?.slice(0, 8) ?? ''}` : '—'}
                    </td>
                    <td className="max-w-56 truncate px-4 py-2.5 text-xs text-slate-400">{log.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {data?.nextCursor && (
        <div className="text-center">
          <Button variant="ghost" onClick={() => setCursor(data.nextCursor ?? undefined)}>
            {t.messages.loadMore}
          </Button>
        </div>
      )}
    </div>
  );
}
