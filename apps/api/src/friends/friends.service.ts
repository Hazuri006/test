import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { PresenceService } from '../realtime/presence.service';
import { toUserSummary, userSummarySelect } from '../common/mappers';
import type { FriendEntry, FriendRequestEntry, UserSummary } from '@yurei/shared';

const pairKey = (a: string, b: string): string => [a, b].sort().join(':');

@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
    private readonly presence: PresenceService,
  ) {}

  private emitUpdate(...userIds: string[]): void {
    this.realtime.emitToUsers(userIds, 'friend.update', { at: new Date().toISOString() });
  }

  async isBlockedEitherWay(a: string, b: string): Promise<boolean> {
    const row = await this.prisma.blockedUser.findFirst({
      where: {
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
    });
    return !!row;
  }

  async listFriends(userId: string): Promise<FriendEntry[]> {
    const friendships = await this.prisma.friendship.findMany({
      where: { status: 'ACCEPTED', OR: [{ requesterId: userId }, { addresseeId: userId }] },
      include: {
        requester: { select: userSummarySelect },
        addressee: { select: userSummarySelect },
      },
    });

    const entries = friendships.map((f) => {
      const other = f.requesterId === userId ? f.addressee : f.requester;
      return { other, since: f.acceptedAt ?? f.createdAt };
    });

    const statuses = await this.presence.getStatuses(entries.map((e) => e.other.id));
    const order = { ONLINE: 0, AWAY: 1, OFFLINE: 2 } as const;

    return entries
      .map((e) => ({
        user: toUserSummary(e.other as never),
        since: e.since.toISOString(),
        presence: statuses.get(e.other.id) ?? ('OFFLINE' as const),
      }))
      .sort(
        (a, b) =>
          order[a.presence] - order[b.presence] ||
          a.user.displayName.localeCompare(b.user.displayName),
      );
  }

  async listRequests(userId: string): Promise<FriendRequestEntry[]> {
    const requests = await this.prisma.friendship.findMany({
      where: { status: 'PENDING', OR: [{ requesterId: userId }, { addresseeId: userId }] },
      include: {
        requester: { select: userSummarySelect },
        addressee: { select: userSummarySelect },
      },
      orderBy: { createdAt: 'desc' },
    });
    return requests.map((f) => ({
      id: f.id,
      user: toUserSummary((f.requesterId === userId ? f.addressee : f.requester) as never),
      createdAt: f.createdAt.toISOString(),
      direction: f.requesterId === userId ? ('OUTGOING' as const) : ('INCOMING' as const),
    }));
  }

  async sendRequest(userId: string, targetId: string): Promise<void> {
    if (userId === targetId) throw new BadRequestException("Impossible de s'ajouter soi-même");

    const target = await this.prisma.user.findFirst({
      where: { id: targetId, deletedAt: null, bannedAt: null },
      include: { preference: true },
    });
    if (!target) throw new NotFoundException('Utilisateur introuvable');
    if (await this.isBlockedEitherWay(userId, targetId)) {
      throw new ForbiddenException('Relation bloquée');
    }
    if (target.preference && !target.preference.allowFriendRequests) {
      throw new ForbiddenException("Cet utilisateur n'accepte pas les demandes d'ami");
    }

    const existing = await this.prisma.friendship.findUnique({
      where: { pairKey: pairKey(userId, targetId) },
    });
    if (existing) {
      throw new ConflictException(
        existing.status === 'ACCEPTED' ? 'Vous êtes déjà amis' : 'Une demande existe déjà',
      );
    }

    const sender = await this.prisma.user.findUnique({ where: { id: userId } });
    await this.prisma.friendship.create({
      data: { requesterId: userId, addresseeId: targetId, pairKey: pairKey(userId, targetId) },
    });

    await this.notifications.notify(
      targetId,
      'FRIEND_REQUEST',
      "Nouvelle demande d'ami",
      `${sender?.displayName ?? 'Un membre'} souhaite devenir ton ami.`,
      '/friends?tab=requests',
    );
    this.emitUpdate(userId, targetId);
  }

  async accept(userId: string, friendshipId: string): Promise<void> {
    const friendship = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!friendship || friendship.status !== 'PENDING') throw new NotFoundException('Demande introuvable');
    if (friendship.addresseeId !== userId) throw new ForbiddenException('Cette demande ne vous est pas destinée');

    await this.prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });

    const accepter = await this.prisma.user.findUnique({ where: { id: userId } });
    await this.notifications.notify(
      friendship.requesterId,
      'FRIEND_ACCEPTED',
      "Demande d'ami acceptée",
      `${accepter?.displayName ?? 'Un membre'} a accepté ta demande.`,
      `/users/${userId}`,
    );
    this.emitUpdate(userId, friendship.requesterId);
  }

  async decline(userId: string, friendshipId: string): Promise<void> {
    const friendship = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!friendship || friendship.status !== 'PENDING') throw new NotFoundException('Demande introuvable');
    if (friendship.addresseeId !== userId) throw new ForbiddenException('Cette demande ne vous est pas destinée');
    await this.prisma.friendship.delete({ where: { id: friendshipId } });
    this.emitUpdate(userId, friendship.requesterId);
  }

  async cancel(userId: string, friendshipId: string): Promise<void> {
    const friendship = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!friendship || friendship.status !== 'PENDING') throw new NotFoundException('Demande introuvable');
    if (friendship.requesterId !== userId) throw new ForbiddenException("Vous n'êtes pas l'auteur de cette demande");
    await this.prisma.friendship.delete({ where: { id: friendshipId } });
    this.emitUpdate(userId, friendship.addresseeId);
  }

  async removeFriend(userId: string, otherId: string): Promise<void> {
    const friendship = await this.prisma.friendship.findUnique({
      where: { pairKey: pairKey(userId, otherId) },
    });
    if (!friendship || friendship.status !== 'ACCEPTED') throw new NotFoundException('Relation introuvable');
    await this.prisma.friendship.delete({ where: { id: friendship.id } });
    this.emitUpdate(userId, otherId);
  }

  async block(userId: string, targetId: string): Promise<void> {
    if (userId === targetId) throw new BadRequestException('Impossible de se bloquer soi-même');
    const target = await this.prisma.user.findFirst({ where: { id: targetId, deletedAt: null } });
    if (!target) throw new NotFoundException('Utilisateur introuvable');

    await this.prisma.$transaction([
      this.prisma.blockedUser.upsert({
        where: { blockerId_blockedId: { blockerId: userId, blockedId: targetId } },
        create: { blockerId: userId, blockedId: targetId },
        update: {},
      }),
      // Le blocage supprime toute relation (amitié ou demande en attente)
      this.prisma.friendship.deleteMany({ where: { pairKey: pairKey(userId, targetId) } }),
    ]);
    this.emitUpdate(userId, targetId);
  }

  async unblock(userId: string, targetId: string): Promise<void> {
    await this.prisma.blockedUser.deleteMany({ where: { blockerId: userId, blockedId: targetId } });
    this.emitUpdate(userId);
  }

  async listBlocked(userId: string): Promise<UserSummary[]> {
    const rows = await this.prisma.blockedUser.findMany({
      where: { blockerId: userId },
      include: { blocked: { select: userSummarySelect } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => toUserSummary(r.blocked as never));
  }
}
