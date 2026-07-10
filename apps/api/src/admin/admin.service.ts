import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { AuditService } from '../audit/audit.service';
import { SessionService } from '../session/session.service';
import { RealtimeService } from '../realtime/realtime.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PresenceService } from '../realtime/presence.service';
import { SettingsService, type AppSettings } from '../settings/settings.service';
import { DiscordSyncService } from '../discord-sync/discord-sync.service';
import { decodeCursor, encodeCursor, toUserSummary, userSummarySelect } from '../common/mappers';
import { sanitizePlainText } from '../common/sanitize';
import type { AuthUser } from '../common/decorators';
import type {
  AuditLogDTO,
  ModerationActionDTO,
  Paginated,
  ReportDTO,
  RoleName,
  UserSummary,
} from '@yurei/shared';
import type { Prisma } from '@prisma/client';

export interface AdminUserRow extends UserSummary {
  discordId: string;
  createdAt: string;
  lastLoginAt: string | null;
  lastSeenAt: string | null;
  suspendedUntil: string | null;
  bannedAt: string | null;
  banExpiresAt: string | null;
  banReason: string | null;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
    private readonly presence: PresenceService,
    private readonly settings: SettingsService,
    private readonly discordSync: DiscordSyncService,
  ) {}

  /** Un modérateur ne peut jamais agir sur quelqu'un de rang supérieur ou égal. */
  private async assertCanActOn(actor: AuthUser, targetId: string): Promise<void> {
    if (actor.id === targetId) throw new BadRequestException('Action impossible sur soi-même');
    const targetRole = await this.rbac.getHighestRole(targetId);
    const actorPriority = this.rbac.rolePriority(actor.role as RoleName);
    if (this.rbac.rolePriority(targetRole) >= actorPriority) {
      throw new ForbiddenException("Impossible d'agir sur un membre de rang supérieur ou égal");
    }
  }

  async overview(): Promise<Record<string, number>> {
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
    const [users, newUsers24h, openTickets, openReports, messages24h, onlineNow] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null, createdAt: { gte: dayAgo } } }),
      this.prisma.ticket.count({
        where: { deletedAt: null, status: { notIn: ['CLOSED', 'ARCHIVED', 'RESOLVED'] } },
      }),
      this.prisma.report.count({ where: { status: { in: ['OPEN', 'REVIEWING'] } } }),
      this.prisma.message.count({ where: { createdAt: { gte: dayAgo } } }),
      this.presence.onlineCount(),
    ]);
    return { users, newUsers24h, openTickets, openReports, messages24h, onlineNow };
  }

  async listUsers(filters: {
    q?: string;
    role?: string;
    banned?: boolean;
    cursor?: string;
    limit: number;
  }): Promise<Paginated<AdminUserRow>> {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(filters.q
        ? {
            OR: [
              { username: { contains: filters.q, mode: 'insensitive' } },
              { displayName: { contains: filters.q, mode: 'insensitive' } },
              { discordId: { contains: filters.q } },
            ],
          }
        : {}),
      ...(filters.role ? { roles: { some: { role: { name: filters.role } } } } : {}),
      ...(filters.banned ? { bannedAt: { not: null } } : {}),
    };
    const cursorId = decodeCursor(filters.cursor);
    const users = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters.limit + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      include: { roles: { include: { role: true } } },
    });
    const hasMore = users.length > filters.limit;
    const page = users.slice(0, filters.limit);
    return {
      items: page.map((u) => ({
        ...toUserSummary(u),
        discordId: u.discordId,
        createdAt: u.createdAt.toISOString(),
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
        suspendedUntil: u.suspendedUntil?.toISOString() ?? null,
        bannedAt: u.bannedAt?.toISOString() ?? null,
        banExpiresAt: u.banExpiresAt?.toISOString() ?? null,
        banReason: u.banReason,
      })),
      nextCursor: hasMore ? encodeCursor(page[page.length - 1].id) : null,
    };
  }

  async getUserDetail(userId: string): Promise<{
    user: AdminUserRow;
    moderation: ModerationActionDTO[];
  }> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { roles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const actions = await this.prisma.moderationAction.findMany({
      where: { targetId: userId },
      orderBy: { createdAt: 'desc' },
      include: { moderator: { select: userSummarySelect } },
    });

    return {
      user: {
        ...toUserSummary(user),
        discordId: user.discordId,
        createdAt: user.createdAt.toISOString(),
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
        suspendedUntil: user.suspendedUntil?.toISOString() ?? null,
        bannedAt: user.bannedAt?.toISOString() ?? null,
        banExpiresAt: user.banExpiresAt?.toISOString() ?? null,
        banReason: user.banReason,
      },
      moderation: actions.map((a) => ({
        id: a.id,
        type: a.type,
        reason: a.reason,
        moderator: toUserSummary(a.moderator as never),
        expiresAt: a.expiresAt?.toISOString() ?? null,
        revokedAt: a.revokedAt?.toISOString() ?? null,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }

  async setRole(actor: AuthUser, targetId: string, roleName: RoleName, reason: string, ip?: string): Promise<void> {
    await this.assertCanActOn(actor, targetId);
    const actorPriority = this.rbac.rolePriority(actor.role as RoleName);
    if (this.rbac.rolePriority(roleName) >= actorPriority) {
      throw new ForbiddenException("Impossible d'attribuer un rôle supérieur ou égal au vôtre");
    }
    await this.rbac.setPrimaryRole(targetId, roleName, actor.id);
    await this.audit.log({
      actorId: actor.id,
      action: 'admin.role_change',
      targetType: 'User',
      targetId,
      reason,
      metadata: { roleName },
      ip,
    });
    await this.notifications.notify(
      targetId,
      'SYSTEM',
      'Ton rôle a été mis à jour',
      `Nouveau rôle : ${roleName}`,
    );
    this.realtime.emitToUser(targetId, 'friend.update', {});
  }

  async applyModeration(
    actor: AuthUser,
    targetId: string,
    input: { type: 'WARN' | 'SUSPEND' | 'TEMP_BAN' | 'BAN' | 'NOTE'; reason: string; durationHours?: number },
    ip?: string,
  ): Promise<void> {
    await this.assertCanActOn(actor, targetId);
    const reason = sanitizePlainText(input.reason);
    const expiresAt =
      input.durationHours && ['SUSPEND', 'TEMP_BAN'].includes(input.type)
        ? new Date(Date.now() + input.durationHours * 3600 * 1000)
        : null;
    if (['SUSPEND', 'TEMP_BAN'].includes(input.type) && !expiresAt) {
      throw new BadRequestException('Durée requise pour cette sanction');
    }

    await this.prisma.moderationAction.create({
      data: { targetId, moderatorId: actor.id, type: input.type, reason, expiresAt },
    });

    switch (input.type) {
      case 'SUSPEND':
        await this.prisma.user.update({ where: { id: targetId }, data: { suspendedUntil: expiresAt } });
        break;
      case 'TEMP_BAN':
        await this.prisma.user.update({
          where: { id: targetId },
          data: { bannedAt: new Date(), banExpiresAt: expiresAt, banReason: reason },
        });
        await this.sessions.revokeAllForUser(targetId);
        await this.realtime.disconnectUser(targetId);
        break;
      case 'BAN':
        await this.prisma.user.update({
          where: { id: targetId },
          data: { bannedAt: new Date(), banExpiresAt: null, banReason: reason },
        });
        await this.sessions.revokeAllForUser(targetId);
        await this.realtime.disconnectUser(targetId);
        break;
      case 'WARN':
        await this.notifications.notify(targetId, 'MODERATION', 'Avertissement', reason);
        break;
      case 'NOTE':
        break; // note interne uniquement
    }

    await this.audit.log({
      actorId: actor.id,
      action: `admin.moderation.${input.type.toLowerCase()}`,
      targetType: 'User',
      targetId,
      reason,
      metadata: { durationHours: input.durationHours ?? null },
      ip,
    });
  }

  async revokeSanction(actor: AuthUser, targetId: string, actionId: string, reason: string, ip?: string): Promise<void> {
    const action = await this.prisma.moderationAction.findFirst({
      where: { id: actionId, targetId, revokedAt: null },
    });
    if (!action) throw new NotFoundException('Sanction introuvable ou déjà levée');

    await this.prisma.moderationAction.update({
      where: { id: actionId },
      data: { revokedAt: new Date(), revokedById: actor.id },
    });

    if (['BAN', 'TEMP_BAN'].includes(action.type)) {
      await this.prisma.user.update({
        where: { id: targetId },
        data: { bannedAt: null, banExpiresAt: null, banReason: null },
      });
      await this.prisma.moderationAction.create({
        data: { targetId, moderatorId: actor.id, type: 'UNBAN', reason: sanitizePlainText(reason) },
      });
    }
    if (action.type === 'SUSPEND') {
      await this.prisma.user.update({ where: { id: targetId }, data: { suspendedUntil: null } });
    }

    await this.audit.log({
      actorId: actor.id,
      action: 'admin.moderation.revoke',
      targetType: 'User',
      targetId,
      reason,
      metadata: { actionId, actionType: action.type },
      ip,
    });
  }

  async listReports(status?: string): Promise<ReportDTO[]> {
    const reports = await this.prisma.report.findMany({
      where: status ? { status: status as never } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        reporter: { select: userSummarySelect },
        targetUser: { select: userSummarySelect },
      },
    });
    const resolverIds = [...new Set(reports.map((r) => r.resolvedById).filter(Boolean))] as string[];
    const resolvers = resolverIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: resolverIds } }, select: userSummarySelect })
      : [];
    const resolverMap = new Map(resolvers.map((r) => [r.id, r]));

    return reports.map((r) => ({
      id: r.id,
      reporter: toUserSummary(r.reporter as never),
      targetUser: r.targetUser ? toUserSummary(r.targetUser as never) : null,
      messageId: r.messageId,
      reason: r.reason,
      details: r.details,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      resolvedBy: r.resolvedById ? toUserSummary(resolverMap.get(r.resolvedById) as never) : null,
    }));
  }

  async resolveReport(
    actor: AuthUser,
    reportId: string,
    status: 'REVIEWING' | 'RESOLVED' | 'DISMISSED',
    note?: string,
    ip?: string,
  ): Promise<void> {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Signalement introuvable');
    await this.prisma.report.update({
      where: { id: reportId },
      data: {
        status,
        ...(status !== 'REVIEWING'
          ? { resolvedById: actor.id, resolvedAt: new Date(), resolveNote: note ? sanitizePlainText(note) : null }
          : {}),
      },
    });
    await this.audit.log({
      actorId: actor.id,
      action: 'admin.report.resolve',
      targetType: 'Report',
      targetId: reportId,
      reason: note,
      metadata: { status },
      ip,
    });
  }

  async listAuditLogs(filters: { action?: string; cursor?: string; limit: number }): Promise<Paginated<AuditLogDTO>> {
    const cursorId = decodeCursor(filters.cursor);
    const logs = await this.prisma.auditLog.findMany({
      where: filters.action ? { action: { contains: filters.action } } : {},
      orderBy: { createdAt: 'desc' },
      take: filters.limit + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      include: { actor: { select: userSummarySelect } },
    });
    const hasMore = logs.length > filters.limit;
    const page = logs.slice(0, filters.limit);
    return {
      items: page.map((l) => ({
        id: l.id,
        actor: l.actor ? toUserSummary(l.actor as never) : null,
        action: l.action,
        targetType: l.targetType,
        targetId: l.targetId,
        reason: l.reason,
        metadata: l.metadata as Record<string, unknown> | null,
        createdAt: l.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? encodeCursor(page[page.length - 1].id) : null,
    };
  }

  async listRoles(): Promise<
    { name: string; priority: number; permissions: string[]; userCount: number }[]
  > {
    const roles = await this.prisma.role.findMany({
      orderBy: { priority: 'desc' },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });
    return roles.map((r) => ({
      name: r.name,
      priority: r.priority,
      permissions: r.permissions.map((p) => p.permission.key),
      userCount: r._count.users,
    }));
  }

  async getSettings(): Promise<AppSettings> {
    return this.settings.get();
  }

  async updateSettings(actor: AuthUser, patch: Partial<AppSettings>, ip?: string): Promise<AppSettings> {
    const updated = await this.settings.update(patch);
    await this.audit.log({
      actorId: actor.id,
      action: 'admin.settings.update',
      metadata: patch as Record<string, unknown>,
      ip,
    });
    return updated;
  }

  async syncDiscordRoles(actor: AuthUser, targetId: string): Promise<void> {
    const target = await this.prisma.user.findFirst({ where: { id: targetId, deletedAt: null } });
    if (!target) throw new NotFoundException('Utilisateur introuvable');
    await this.discordSync.syncUserRoles(target.id, target.discordId);
    await this.audit.log({
      actorId: actor.id,
      action: 'admin.discord.sync',
      targetType: 'User',
      targetId,
    });
  }

  /** Statistiques : inscriptions et messages par jour (30 jours). */
  async stats(): Promise<{
    usersPerDay: { date: string; count: number }[];
    messagesPerDay: { date: string; count: number }[];
    ticketsByStatus: Record<string, number>;
  }> {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const [users, messages, tickets] = await Promise.all([
      this.prisma.user.findMany({
        where: { createdAt: { gte: since }, deletedAt: null },
        select: { createdAt: true },
      }),
      this.prisma.message.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      this.prisma.ticket.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { _all: true } }),
    ]);

    const bucket = (rows: { createdAt: Date }[]): { date: string; count: number }[] => {
      const map = new Map<string, number>();
      for (let i = 29; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 3600 * 1000);
        map.set(d.toISOString().slice(0, 10), 0);
      }
      for (const row of rows) {
        const key = row.createdAt.toISOString().slice(0, 10);
        if (map.has(key)) map.set(key, (map.get(key) ?? 0) + 1);
      }
      return [...map.entries()].map(([date, count]) => ({ date, count }));
    };

    const ticketsByStatus: Record<string, number> = {};
    for (const t of tickets) ticketsByStatus[t.status] = t._count._all;

    return { usersPerDay: bucket(users), messagesPerDay: bucket(messages), ticketsByStatus };
  }
}
