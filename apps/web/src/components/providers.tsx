'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { I18nProvider } from '@/lib/i18n';
import { SessionProvider } from '@/hooks/use-session';
import { SocketProvider } from '@/hooks/use-socket';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <SessionProvider>
          <SocketProvider>
            {children}
            <Toaster
              position="top-right"
              theme="dark"
              toastOptions={{
                style: {
                  background: 'rgb(22 20 46 / 0.92)',
                  border: '1px solid rgb(167 139 250 / 0.2)',
                  color: '#e5e4f2',
                  backdropFilter: 'blur(10px)',
                },
              }}
            />
          </SocketProvider>
        </SessionProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
