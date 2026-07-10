'use client';

import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { disconnectSocket } from '@/lib/socket';
import { useI18n } from '@/lib/i18n';
import type { PermissionKey, SessionUser } from '@yurei/shared';

interface SessionContextValue {
  user: SessionUser | null;
  isLoading: boolean;
  can: (permission: PermissionKey) => boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  user: null,
  isLoading: true,
  can: () => false,
  refresh: async () => undefined,
  logout: async () => undefined,
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { setLocale } = useI18n();

  const { data, isLoading } = useQuery<SessionUser | null>({
    queryKey: ['session'],
    queryFn: async () => {
      try {
        return await api<SessionUser>('/auth/me', { redirectOn401: false });
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
    retry: false,
  });

  // Applique la langue préférée de l'utilisateur
  useEffect(() => {
    if (data?.preferences.locale === 'en' || data?.preferences.locale === 'fr') {
      setLocale(data.preferences.locale);
    }
  }, [data?.preferences.locale, setLocale]);

  const can = useCallback(
    (permission: PermissionKey) => data?.permissions.includes(permission) ?? false,
    [data],
  );

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['session'] });
  }, [queryClient]);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' });
    disconnectSocket();
    queryClient.clear();
    window.location.href = '/login';
  }, [queryClient]);

  return (
    <SessionContext.Provider value={{ user: data ?? null, isLoading, can, refresh, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
