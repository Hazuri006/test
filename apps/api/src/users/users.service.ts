import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from '../realtime/presence.service';
import { ServerStatusService } from '../server-status/server-status.service';
import { sanitizePlainText } from '../common/sanitize';
import { highestRole, toUserSummary, userSummarySelect } from '../common/mappers';
import type { AuthUser } from '../common/decorators';
import type { DashboardData, PublicProfile, UserSummary } from '@yurei/shared';
import type { Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly serverStatus: ServerStatusService,
  ) {}

  async updateProfile(userId: string, data: { bio?: string; customStatus?: string }): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.bio !== undefined ? { bio: sanitizePlainText(data.bio) } : {}),
        ...(data.customStatus !== undefined
          ? { customStatus: sanitizePlainText(data.customStatus) }
          : {}),
      },
    });
  }

  async updatePreferences(userId: string, patch: Record<string, unknown>): Promise<void> {
    const allowed = [
      'locale', 'theme', 'notifyFriendRequests', 'notifyMessages', 'notifyTickets',
      'notifyAnnouncements', 'showActivity', 'showLastSeen', 'allowFriendRequests',
      'allowDms', 'reducedMotion',
    ];
    const data = Object.fromEntries(
      Object.entries(patch).filter(([k, v]) => allowed.includes(k) && v !== undefined),
    );
    await this.prisma.userPreference.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  async search(viewerId: string, query: string): Promise<UserSummary[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    const blocked = await this.prisma.blockedUser.findMany({
      where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
    });
    const excludedIds = new Set(blocked.map((b) => (b.blockerId === viewerId ? b.blockedId : b.blockerId)));

    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        bannedAt: null,
        id: { notIn: [...excludedIds] },
        OR: [
          { username: { contains: q, mode: 'insensitive' } },
          { displayName: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: userSummarySelect,
      take: 10,
      orderBy: { displayName: 'asc' },
    });
    return users.map((u) => toUserSummary(u as never));
  }

  private async acceptedFriendIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.friendship.findMany({
      where: { status: 'ACCEPTED', OR: [{ requesterId: userId }, { addresseeId: userId }] },
    });
    return rows.map((f) => (f.requesterId === userId ? f.addresseeId : f.requesterId));
  }

  async getPublicProfile(viewer: AuthUser, targetId: string): Promise<PublicProfile> {
    const user = await this.prisma.user.findFirst({
      where: { id: targetId, deletedAt: null },
      include: { roles: { include: { role: true } }, preference: true },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const blockedByTarget = await this.prisma.blockedUser.findFirst({
      where: { blockerId: targetId, blockedId: viewer.id },
    });
    if (blockedByTarget && viewer.id !== targetId) {
      throw new ForbiddenException('Profil indisponible');
    }

    const [viewerFriends, targetFriends, friendship, viewerBlocked, presenceStatus, ticketCount, messageCount] =
      await Promise.all([
        this.acceptedFriendIds(viewer.id),
        this.acceptedFriendIds(targetId),
        this.prisma.friendship.findUnique({
          where: { pairKey: [viewer.id, targetId].sort().join(':') },
        }),
        this.prisma.blockedUser.findFirst({ where: { blockerId: viewer.id, blockedId: targetId } }),
        this.presence.getStatus(targetId),
        this.prisma.ticket.count({ where: { creatorId: targetId, deletedAt: null } }),
        this.prisma.message.count({ where: { authorId: targetId, deletedAt: null } }),
      ]);

    const mutualIds = viewerFriends.filter((id) => targetFriends.includes(id)).slice(0, 8);
    const mutualUsers = mutualIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: mutualIds } }, select: userSummarySelect })
      : [];

    let friendshipStatus: PublicProfile['friendshipStatus'] = 'NONE';
    if (viewer.id === targetId) friendshipStatus = 'SELF';
    else if (viewerBlocked) friendshipStatus = 'BLOCKED';
    else if (friendship?.status === 'ACCEPTED') friendshipStatus = 'FRIENDS';
    else if (friendship?.status === 'PENDING') {
      friendshipStatus = friendship.requesterId === viewer.id ? 'PENDING_SENT' : 'PENDING_RECEIVED';
    }

    const showLastSeen = user.preference?.showLastSeen ?? true;

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bannerUrl: user.bannerUrl,
      role: highestRole(user.roles),
      customStatus: user.customStatus,
      bio: user.bio,
      badges: user.badges,
      createdAt: user.createdAt.toISOString(),
      lastSeenAt: showLastSeen || viewer.id === targetId ? user.lastSeenAt?.toISOString() ?? null : null,
      presence: presenceStatus,
      friendCount: targetFriends.length,
      mutualFriends: mutualUsers.map((u) => toUserSummary(u as never)),
      friendshipStatus,
      stats: { tickets: ticketCount, messages: messageCount },
    };
  }

  async getDashboard(user: AuthUser): Promise<DashboardData> {
    const friendWhere: Prisma.FriendshipWhereInput = {
      status: 'ACCEPTED',
      OR: [{ requesterId: user.id }, { addresseeId: user.id }],
    };

    const [friendCount, pendingRequests, openTickets, unreadNotifications, onlineCount, memberships] =
      await Promise.all([
        this.prisma.friendship.count({ where: friendWhere }),
        this.prisma.friendship.count({ where: { status: 'PENDING', addresseeId: user.id } }),
        this.prisma.ticket.count({
          where: {
            deletedAt: null,
            status: { notIn: ['CLOSED', 'ARCHIVED', 'RESOLVED'] },
            OR: [{ creatorId: user.id }, { participants: { some: { userId: user.id } } }],
          },
        }),
        this.prisma.notification.count({ where: { userId: user.id, readAt: null } }),
        this.presence.onlineCount(),
        this.prisma.conversationMember.findMany({ where: { userId: user.id } }),
      ]);

    // Messages non lus, toutes conversations confondues
    let unreadMessages = 0;
    for (const membership of memberships) {
      unreadMessages += await this.prisma.message.count({
        where: {
          conversationId: membership.conversationId,
          deletedAt: null,
          authorId: { not: user.id },
          createdAt: { gt: membership.lastReadAt ?? new Date(0) },
        },
      });
    }

    const announcements = await this.prisma.announcement.findMany({
      where: { status: 'PUBLISHED', deletedAt: null, publishedAt: { lte: new Date() } },
      orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
      take: 4,
      include: { author: { select: userSummarySelect } },
    });

    const recentNotifications = await this.prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 6,
    });

    const [serverStatus, serverHistory] = await Promise.all([
      this.serverStatus.getStatus(),
      this.serverStatus.getHistory(24),
    ]);

    return {
      friendCount,
      pendingFriendRequests: pendingRequests,
      unreadMessages,
      openTickets,
      onlineCount,
      unreadNotifications,
      recentAnnouncements: announcements.map((a) => ({
        id: a.id,
        slug: a.slug,
        title: a.title,
        summary: a.summary,
        imageUrl: a.imageUrl,
        category: a.category,
        tags: a.tags,
        pinned: a.pinned,
        status: a.status,
        author: toUserSummary(a.author as never),
        publishedAt: a.publishedAt?.toISOString() ?? null,
        scheduledFor: a.scheduledFor?.toISOString() ?? null,
        createdAt: a.createdAt.toISOString(),
      })),
      recentActivity: recentNotifications.map((n) => ({
        type: n.type,
        label: n.title,
        at: n.createdAt.toISOString(),
        link: n.link,
      })),
      serverStatus,
      serverHistory,
    };
  }
}
