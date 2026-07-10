'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Languages } from 'lucide-react';
import { updateProfileSchema } from '@yurei/shared';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/hooks/use-session';
import { useT, useI18n } from '@/lib/i18n';
import { formatDate } from '@/lib/format';
import { UserAvatar } from '@/components/ui/avatar';
import { Badge, roleBadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { z } from 'zod';
import type { UserPreferencesDTO } from '@yurei/shared';

type ProfileForm = z.infer<typeof updateProfileSchema>;

function PreferenceRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm text-slate-300">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

export default function ProfilePage() {
  const t = useT();
  const { locale, setLocale } = useI18n();
  const { user, refresh } = useSession();
  const queryClient = useQueryClient();
  const [prefs, setPrefs] = useState<UserPreferencesDTO | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const form = useForm<ProfileForm>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { bio: '', customStatus: '' },
  });

  useEffect(() => {
    if (user) {
      form.reset({ bio: user.bio ?? '', customStatus: user.customStatus ?? '' });
      setPrefs(user.preferences);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (!user || !prefs) return null;

  const saveProfile = form.handleSubmit(async (values) => {
    try {
      await api('/users/me/profile', { method: 'PATCH', body: values });
      toast.success(t.common.saved);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t.common.error);
    }
  });

  const updatePref = async (patch: Partial<UserPreferencesDTO>): Promise<void> => {
    const previous = prefs;
    setPrefs({ ...prefs, ...patch });
    setSavingPrefs(true);
    try {
      await api('/users/me/preferences', { method: 'PATCH', body: patch });
      void queryClient.invalidateQueries({ queryKey: ['session'] });
    } catch (err) {
      setPrefs(previous); // restauration en cas d'erreur
      toast.error(err instanceof ApiError ? err.message : t.common.error);
    } finally {
      setSavingPrefs(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Bannière + identité */}
      <Card className="overflow-hidden">
        <div
          className="h-32 bg-gradient-to-r from-spirit-600/40 via-haze-500/30 to-bloom-500/40 bg-cover bg-center md:h-40"
          style={user.bannerUrl ? { backgroundImage: `url(${user.bannerUrl})` } : undefined}
        />
        <CardContent className="-mt-10 flex flex-wrap items-end gap-4">
          <UserAvatar src={user.avatarUrl} name={user.displayName} size={88} status="ONLINE" className="ring-4 ring-night-900 rounded-full" />
          <div className="flex-1 pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-white">{user.displayName}</h1>
              <Badge variant={roleBadgeVariant[user.role]}>{t.roles[user.role]}</Badge>
            </div>
            <p className="text-sm text-slate-500">@{user.username}</p>
          </div>
          <p className="pb-1 text-xs text-slate-500">
            {t.profile.memberSince} {formatDate(user.createdAt, locale)}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Édition du profil */}
        <Card>
          <CardHeader>
            <CardTitle>{t.profile.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveProfile} className="space-y-4">
              <div>
                <Label htmlFor="customStatus">{t.profile.customStatus}</Label>
                <Input
                  id="customStatus"
                  placeholder={t.profile.statusPlaceholder}
                  maxLength={100}
                  {...form.register('customStatus')}
                />
              </div>
              <div>
                <Label htmlFor="bio">{t.profile.bio}</Label>
                <Textarea
                  id="bio"
                  placeholder={t.profile.bioPlaceholder}
                  maxLength={500}
                  rows={4}
                  {...form.register('bio')}
                />
                {form.formState.errors.bio && (
                  <p className="mt-1 text-xs text-danger">{form.formState.errors.bio.message}</p>
                )}
              </div>
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-xs text-slate-500">
                  <BadgeCheck className="h-3.5 w-3.5 text-spirit-400" aria-hidden />
                  {t.profile.discordSynced}
                </p>
                <Button type="submit" loading={form.formState.isSubmitting}>
                  {t.common.save}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Préférences */}
        <Card>
          <CardHeader>
            <CardTitle>{t.profile.preferences}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <Label className="flex items-center gap-1.5">
                <Languages className="h-4 w-4 text-spirit-400" aria-hidden /> {t.profile.language}
              </Label>
              <Select
                value={prefs.locale}
                onValueChange={(value) => {
                  setLocale(value as 'fr' | 'en');
                  void updatePref({ locale: value });
                }}
              >
                <SelectTrigger aria-label={t.profile.language}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <p className="mb-1 text-sm font-semibold text-slate-200">{t.profile.privacy}</p>
              <PreferenceRow label={t.profile.showActivity} checked={prefs.showActivity} onChange={(v) => void updatePref({ showActivity: v })} />
              <PreferenceRow label={t.profile.showLastSeen} checked={prefs.showLastSeen} onChange={(v) => void updatePref({ showLastSeen: v })} />
              <PreferenceRow label={t.profile.allowFriendRequests} checked={prefs.allowFriendRequests} onChange={(v) => void updatePref({ allowFriendRequests: v })} />
              <PreferenceRow label={t.profile.allowDms} checked={prefs.allowDms} onChange={(v) => void updatePref({ allowDms: v })} />
              <PreferenceRow label={t.profile.reducedMotion} checked={prefs.reducedMotion} onChange={(v) => void updatePref({ reducedMotion: v })} />
            </div>

            <div>
              <p className="mb-1 text-sm font-semibold text-slate-200">{t.profile.notifications}</p>
              <PreferenceRow label={t.profile.notifyFriendRequests} checked={prefs.notifyFriendRequests} onChange={(v) => void updatePref({ notifyFriendRequests: v })} />
              <PreferenceRow label={t.profile.notifyMessages} checked={prefs.notifyMessages} onChange={(v) => void updatePref({ notifyMessages: v })} />
              <PreferenceRow label={t.profile.notifyTickets} checked={prefs.notifyTickets} onChange={(v) => void updatePref({ notifyTickets: v })} />
              <PreferenceRow label={t.profile.notifyAnnouncements} checked={prefs.notifyAnnouncements} onChange={(v) => void updatePref({ notifyAnnouncements: v })} />
            </div>
            {savingPrefs && <p className="text-xs text-slate-600">{t.common.loading}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
