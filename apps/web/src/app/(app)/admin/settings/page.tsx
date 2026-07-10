'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CardSkeleton } from '@/components/ui/skeleton';

interface AppSettings {
  appName: string;
  maintenanceMode: boolean;
  roleSyncEnabled: boolean;
}

export default function AdminSettingsPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: settings } = useQuery<AppSettings>({
    queryKey: ['admin', 'settings'],
    queryFn: () => api('/admin/settings'),
  });

  useEffect(() => {
    if (settings && !form) setForm(settings);
  }, [settings, form]);

  if (!form) return <CardSkeleton />;

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      await api('/admin/settings', { method: 'PATCH', body: form });
      toast.success(t.common.saved);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t.common.error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>{t.admin.sections.settings}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <Label htmlFor="app-name">{t.admin.settings.appName}</Label>
          <Input
            id="app-name"
            value={form.appName}
            maxLength={60}
            onChange={(e) => setForm({ ...form, appName: e.target.value })}
          />
        </div>
        <label className="flex items-center justify-between gap-4">
          <span className="text-sm text-slate-300">{t.admin.settings.maintenanceMode}</span>
          <Switch checked={form.maintenanceMode} onCheckedChange={(v) => setForm({ ...form, maintenanceMode: v })} />
        </label>
        <label className="flex items-center justify-between gap-4">
          <span className="text-sm text-slate-300">{t.admin.settings.roleSyncEnabled}</span>
          <Switch checked={form.roleSyncEnabled} onCheckedChange={(v) => setForm({ ...form, roleSyncEnabled: v })} />
        </label>
        <div className="flex justify-end">
          <Button loading={saving} disabled={form.appName.trim().length < 2} onClick={() => void save()}>
            {t.common.save}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
