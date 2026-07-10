import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import type { NotificationType } from '@prisma/client';
import type { NotificationDTO } from '@yurei/shared';

const PREF_BY_TYPE: Partial<Record<NotificationType, keyof PrefFlags>> = {
  FRIEND_REQUEST: 'notifyFriendRequests',
  FRIEND_ACCEPTED: 'notifyFriendRequests',
  NEW_MESSAGE: 'notifyMessages',
  TICKET_REPLY: 'notifyTickets',
  TICKET_CLAIMED: 'notifyTickets',
  TICKET_STATUS: 'notifyTickets',
  ANNOUNCEMENT: 'notifyAnnouncements',
};

interface PrefFlags {
  notifyFriendRequests: boolean;
  notifyMessages: boolean;
  notifyTickets: boolean;
  notifyAnnouncements: boolean;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Crée une notification (si les préférences l'autorisent) et l'émet en temps réel. */
  async notify(
    userId: string,
    type: NotificationType,
    title: string,
    body = '',
    link: string | null = null,
    data?: Record<string, unknown>,
  ): Promise<void> {
    const prefKey = PREF_BY_TYPE[type];
    if (prefKey) {
      const pref = await this.prisma.userPreference.findUnique({ where: { userId } });
      if (pref && pref[prefKey] === false) return;
    }

    const notification = await this.prisma.notification.create({
      data: { userId, type, title, body, link, data: data as never },
    });

    this.realtime.emitToUser(userId, 'notification.new', this.toDto(notification));
    await this.pushUnreadCount(userId);
  }

  async list(userId: string, unreadOnly = false, limit = 50): Promise<NotificationDTO[]> {
    const rows = await this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((n) => this.toDto(n));
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id: notificationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    await this.pushUnreadCount(userId);
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    await this.pushUnreadCount(userId);
  }

  async remove(userId: string, notificationId: string): Promise<void> {
    await this.prisma.notification.deleteMany({ where: { id: notificationId, userId } });
    await this.pushUnreadCount(userId);
  }

  private async pushUnreadCount(userId: string): Promise<void> {
    const count = await this.unreadCount(userId);
    this.realtime.emitToUser(userId, 'notification.count', { count });
  }

  private toDto(n: {
    id: string;
    type: NotificationType;
    title: string;
    body: string;
    link: string | null;
    readAt: Date | null;
    createdAt: Date;
  }): NotificationDTO {
    return {
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    };
  }
}
