'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Badge, roleBadgeVariant } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CardSkeleton } from '@/components/ui/skeleton';
import { PERMISSION_DESCRIPTIONS } from '@yurei/shared';
import type { PermissionKey, RoleName } from '@yurei/shared';

interface RoleRow {
  name: RoleName;
  priority: number;
  permissions: string[];
  userCount: number;
}

export default function AdminRolesPage() {
  const t = useT();
  const { data: roles, isLoading } = useQuery<RoleRow[]>({
    queryKey: ['admin', 'roles'],
    queryFn: () => api('/admin/roles'),
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {(roles ?? []).map((role) => (
        <Card key={role.name}>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Badge variant={roleBadgeVariant[role.name]}>{t.roles[role.name]}</Badge>
              <span className="text-xs font-normal text-slate-500">priorité {role.priority}</span>
            </CardTitle>
            <span className="text-xs text-slate-500">
              {role.userCount} {t.admin.overview.totalUsers.toLowerCase()}
            </span>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {role.permissions.map((permission) => (
                <li key={permission} className="flex items-baseline justify-between gap-3 text-sm">
                  <code className="shrink-0 rounded bg-night-800 px-1.5 py-0.5 text-xs text-spirit-300">
                    {permission}
                  </code>
                  <span className="text-right text-xs text-slate-500">
                    {PERMISSION_DESCRIPTIONS[permission as PermissionKey] ?? ''}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
