import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RealtimeService } from './realtime.service';
import { env } from '../config/env';
import { toUserSummary, userSummarySelect } from '../common/mappers';
import type { PresenceEntry, PresenceStatus } from '@yurei/shared';

const ONLINE_SET = 'presence:online';
const dataKey = (userId: string) => `presence:data:${userId}`;
const socketsKey = (userId: string) => `presence:sockets:${userId}`;
const heartbeatKey = (userId: string) => `presence:hb:${userId}`;

/**
 * Présence SUR LE PANEL (pas le statut Discord) :
 * - connexion WebSocket + heartbeat régulier ;
 * - AWAY après PRESENCE_AWAY_AFTER_MS sans activité ;
 * - OFFLINE si le heartbeat expire (PRESENCE_OFFLINE_AFTER_MS) ;
 * - état partagé dans Redis pour supporter plusieurs instances.
 */
@Injectable()
export class PresenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PresenceService.name);
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly realtime: RealtimeService,
  ) {}

  onModuleInit(): void {
    this.sweepTimer = setInterval(() => {
      this.sweep().catch((err) => this.logger.warn(`Sweep présence: ${(err as Error).message}`));
    }, 30_000);
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  async handleConnect(userId: string, socketId: string): Promise<void> {
    const r = this.redis.client;
    const wasOnline = await r.sismember(ONLINE_SET, userId);
    await r
      .multi()
      .sadd(socketsKey(userId), socketId)
      .sadd(ONLINE_SET, userId)
      .hset(dataKey(userId), { status: 'ONLINE', lastActiveAt: new Date().toISOString() })
      .set(heartbeatKey(userId), '1', 'PX', env.PRESENCE_OFFLINE_AFTER_MS)
      .exec();

    if (!wasOnline) {
      await this.prisma.presence.upsert({
        where: { userId },
        create: { userId, status: 'ONLINE', lastActiveAt: new Date() },
        update: { status: 'ONLINE', lastActiveAt: new Date() },
      });
      await this.broadcastUpdate(userId);
    }
  }

  async handleDisconnect(userId: string, socketId: string): Promise<void> {
    const r = this.redis.client;
    await r.srem(socketsKey(userId), socketId);
    const remaining = await r.scard(socketsKey(userId));
    if (remaining === 0) {
      await this.markOffline(userId);
    }
  }

  async heartbeat(userId: string, idle: boolean, activity?: string): Promise<void> {
    const r = this.redis.client;
    const current = await r.hgetall(dataKey(userId));
    const nextStatus: PresenceStatus = idle ? 'AWAY' : 'ONLINE';
    const changed = current.status !== nextStatus || (activity !== undefined && current.activity !== activity);

    const update: Record<string, string> = { status: nextStatus };
    if (!idle) update.lastActiveAt = new Date().toISOString();
    if (activity !== undefined) update.activity = activity.slice(0, 80);

    await r
      .multi()
      .hset(dataKey(userId), update)
      .set(heartbeatKey(userId), '1', 'PX', env.PRESENCE_OFFLINE_AFTER_MS)
      .sadd(ONLINE_SET, userId)
      .exec();

    if (changed) await this.broadcastUpdate(userId);
  }

  private async markOffline(userId: string): Promise<void> {
    const r = this.redis.client;
    await r
      .multi()
      .srem(ONLINE_SET, userId)
      .del(dataKey(userId), heartbeatKey(userId), socketsKey(userId))
      .exec();
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.presence.upsert({
        where: { userId },
        create: { userId, status: 'OFFLINE', lastActiveAt: now },
        update: { status: 'OFFLINE', lastActiveAt: now },
      }),
      this.prisma.user.update({ where: { id: userId }, data: { lastSeenAt: now } }),
    ]);
    this.realtime.broadcast('presence.update', {
      userId,
      status: 'OFFLINE',
      activity: null,
      lastActiveAt: now.toISOString(),
    });
  }

  /** Marque AWAY les inactifs, OFFLINE ceux dont le heartbeat a expiré. */
  private async sweep(): Promise<void> {
    const r = this.redis.client;
    const userIds = await r.smembers(ONLINE_SET);
    for (const userId of userIds) {
      const alive = await r.exists(heartbeatKey(userId));
      if (!alive) {
        await this.markOffline(userId);
        continue;
      }
      const data = await r.hgetall(dataKey(userId));
      if (data.status === 'ONLINE' && data.lastActiveAt) {
        const idleMs = Date.now() - new Date(data.lastActiveAt).getTime();
        if (idleMs > env.PRESENCE_AWAY_AFTER_MS) {
          await r.hset(dataKey(userId), 'status', 'AWAY');
          await this.broadcastUpdate(userId);
        }
      }
    }
  }

  async getStatus(userId: string): Promise<PresenceStatus> {
    const data = await this.redis.client.hgetall(dataKey(userId));
    return (data.status as PresenceStatus) ?? 'OFFLINE';
  }

  async getStatuses(userIds: string[]): Promise<Map<string, PresenceStatus>> {
    const result = new Map<string, PresenceStatus>();
    if (userIds.length === 0) return result;
    const pipeline = this.redis.client.pipeline();
    for (const id of userIds) pipeline.hget(dataKey(id), 'status');
    const rows = await pipeline.exec();
    userIds.forEach((id, i) => {
      result.set(id, ((rows?.[i]?.[1] as string) ?? 'OFFLINE') as PresenceStatus);
    });
    return result;
  }

  async isOnline(userId: string): Promise<boolean> {
    return (await this.getStatus(userId)) === 'ONLINE';
  }

  async onlineCount(): Promise<number> {
    return this.redis.client.scard(ONLINE_SET);
  }

  /** Liste « En ligne » complète pour la colonne de droite. */
  async getOnlineList(): Promise<PresenceEntry[]> {
    const r = this.redis.client;
    const userIds = await r.smembers(ONLINE_SET);
    if (userIds.length === 0) return [];

    const pipeline = r.pipeline();
    for (const id of userIds) pipeline.hgetall(dataKey(id));
    const rows = await pipeline.exec();

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds }, deletedAt: null },
      select: userSummarySelect,
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const entries: PresenceEntry[] = [];
    userIds.forEach((id, i) => {
      const user = userMap.get(id);
      const data = (rows?.[i]?.[1] as Record<string, string>) ?? {};
      if (!user) return;
      entries.push({
        user: toUserSummary(user as never),
        status: ((data.status as PresenceStatus) ?? 'ONLINE'),
        activity: data.activity ?? null,
        lastActiveAt: data.lastActiveAt ?? new Date().toISOString(),
      });
    });
    return entries.sort((a, b) => a.user.displayName.localeCompare(b.user.displayName));
  }

  private async broadcastUpdate(userId: string): Promise<void> {
    const data = await this.redis.client.hgetall(dataKey(userId));
    this.realtime.broadcast('presence.update', {
      userId,
      status: data.status ?? 'OFFLINE',
      activity: data.activity ?? null,
      lastActiveAt: data.lastActiveAt ?? new Date().toISOString(),
    });
  }
}
