'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getSocket } from '@/lib/socket';
import { useSession } from './use-session';
import type { Socket } from 'socket.io-client';
import type { NotificationDTO, PresenceEntry, PresenceStatus } from '@yurei/shared';

interface PresenceUpdate {
  userId: string;
  status: PresenceStatus;
  activity: string | null;
  lastActiveAt: string;
}

interface SocketContextValue {
  socket: Socket | null;
  onlineUsers: PresenceEntry[];
  unreadNotifications: number;
  presenceOf: (userId: string) => PresenceStatus;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  onlineUsers: [],
  unreadNotifications: 0,
  presenceOf: () => 'OFFLINE',
});

const IDLE_AFTER_MS = 3 * 60 * 1000;

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const [onlineUsers, setOnlineUsers] = useState<PresenceEntry[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const lastInteractionRef = useRef(Date.now());
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    socket.connect();

    const markInteraction = (): void => {
      lastInteractionRef.current = Date.now();
    };
    window.addEventListener('pointerdown', markInteraction);
    window.addEventListener('keydown', markInteraction);

    const heartbeat = setInterval(() => {
      const idle =
        Date.now() - lastInteractionRef.current > IDLE_AFTER_MS || document.visibilityState === 'hidden';
      socket.emit('heartbeat', { idle, activity: activityLabel(pathnameRef.current) });
    }, 25_000);
    socket.emit('heartbeat', { idle: false, activity: activityLabel(pathnameRef.current) });

    socket.on('presence.list', (list: PresenceEntry[]) => setOnlineUsers(list));

    socket.on('presence.update', (update: PresenceUpdate) => {
      setOnlineUsers((prev) => {
        if (update.status === 'OFFLINE') return prev.filter((e) => e.user.id !== update.userId);
        const existing = prev.find((e) => e.user.id === update.userId);
        if (existing) {
          return prev.map((e) =>
            e.user.id === update.userId
              ? { ...e, status: update.status, activity: update.activity, lastActiveAt: update.lastActiveAt }
              : e,
          );
        }
        // Utilisateur inconnu de la liste locale : on la resynchronise
        void queryClient.invalidateQueries({ queryKey: ['presence'] });
        return prev;
      });
    });

    socket.on('notification.new', (notification: NotificationDTO) => {
      toast(notification.title, { description: notification.body });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
    socket.on('notification.count', ({ count }: { count: number }) => setUnreadNotifications(count));

    socket.on('friend.update', () => {
      void queryClient.invalidateQueries({ queryKey: ['friends'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    });
    socket.on('message.new', () => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });
    socket.on('ticket.updated', () => {
      void queryClient.invalidateQueries({ queryKey: ['tickets'] });
    });
    socket.on('ticket.message', () => {
      void queryClient.invalidateQueries({ queryKey: ['tickets'] });
    });
    socket.on('announcement.new', () => {
      void queryClient.invalidateQueries({ queryKey: ['news'] });
    });

    return () => {
      clearInterval(heartbeat);
      window.removeEventListener('pointerdown', markInteraction);
      window.removeEventListener('keydown', markInteraction);
      socket.off('presence.list');
      socket.off('presence.update');
      socket.off('notification.new');
      socket.off('notification.count');
      socket.off('friend.update');
      socket.off('message.new');
      socket.off('ticket.updated');
      socket.off('ticket.message');
      socket.off('announcement.new');
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, queryClient]);

  // Compteur initial de notifications
  useEffect(() => {
    if (!user) return;
    void import('@/lib/api').then(({ api }) =>
      api<{ count: number }>('/notifications/unread-count')
        .then(({ count }) => setUnreadNotifications(count))
        .catch(() => undefined),
    );
  }, [user]);

  const presenceOf = useCallback(
    (userId: string): PresenceStatus =>
      onlineUsers.find((e) => e.user.id === userId)?.status ?? 'OFFLINE',
    [onlineUsers],
  );

  return (
    <SocketContext.Provider
      value={{ socket: user ? getSocket() : null, onlineUsers, unreadNotifications, presenceOf }}
    >
      {children}
    </SocketContext.Provider>
  );
}

function activityLabel(pathname: string | null): string {
  if (!pathname) return '';
  if (pathname.startsWith('/dashboard')) return 'Tableau de bord';
  if (pathname.startsWith('/messages')) return 'Messagerie';
  if (pathname.startsWith('/tickets') || pathname.startsWith('/staff')) return 'Tickets';
  if (pathname.startsWith('/friends')) return 'Amis';
  if (pathname.startsWith('/news')) return 'Actualités';
  if (pathname.startsWith('/admin')) return 'Administration';
  if (pathname.startsWith('/profile') || pathname.startsWith('/users')) return 'Profils';
  return '';
}

export function useSocket(): SocketContextValue {
  return useContext(SocketContext);
}
