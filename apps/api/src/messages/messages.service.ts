import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RealtimeService } from '../realtime/realtime.service';
import { PresenceService } from '../realtime/presence.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UploadsService } from '../uploads/uploads.service';
import { FriendsService } from '../friends/friends.service';
import { sanitizePlainText } from '../common/sanitize';
import { decodeCursor, encodeCursor, toUserSummary, userSummarySelect } from '../common/mappers';
import type { AuthUser } from '../common/decorators';
import type { ConversationDTO, MessageDTO, Paginated } from '@yurei/shared';
import type { Message, MessageAttachment, MessageReaction, Prisma } from '@prisma/client';

const dmKey = (a: string, b: string): string => [a, b].sort().join(':');

type FullMessage = Message & {
  author: Prisma.UserGetPayload<{ select: typeof userSummarySelect }>;
  attachments: MessageAttachment[];
  reactions: MessageReaction[];
  replyTo: (Message & { author: { displayName: string } }) | null;
};

const messageInclude = {
  author: { select: userSummarySelect },
  attachments: true,
  reactions: true,
  replyTo: { include: { author: { select: { displayName: true } } } },
} as const;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly realtime: RealtimeService,
    private readonly presence: PresenceService,
    private readonly notifications: NotificationsService,
    private readonly uploads: UploadsService,
    private readonly friends: FriendsService,
  ) {}

  private toDto(message: FullMessage, viewerId: string): MessageDTO {
    const reactionMap = new Map<string, { count: number; mine: boolean }>();
    for (const r of message.reactions) {
      const entry = reactionMap.get(r.emoji) ?? { count: 0, mine: false };
      entry.count += 1;
      if (r.userId === viewerId) entry.mine = true;
      reactionMap.set(r.emoji, entry);
    }
    const deleted = !!message.deletedAt;
    return {
      id: message.id,
      conversationId: message.conversationId,
      author: toUserSummary(message.author as never),
      content: deleted ? '' : message.content,
      createdAt: message.createdAt.toISOString(),
      editedAt: message.editedAt?.toISOString() ?? null,
      deletedAt: message.deletedAt?.toISOString() ?? null,
      replyTo: message.replyTo
        ? {
            id: message.replyTo.id,
            content: message.replyTo.deletedAt ? '' : message.replyTo.content.slice(0, 120),
            authorName: message.replyTo.author.displayName,
          }
        : null,
      attachments: deleted
        ? []
        : message.attachments.map((a) => ({
            id: a.id,
            fileName: a.fileName,
            mimeType: a.mimeType,
            size: a.size,
            url: this.uploads.fileUrl(a.storedName),
          })),
      reactions: [...reactionMap.entries()].map(([emoji, v]) => ({ emoji, ...v })),
    };
  }

  private async requireMembership(conversationId: string, userId: string) {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) throw new ForbiddenException('Vous ne participez pas à cette conversation');
    return member;
  }

  private async otherMemberIds(conversationId: string, userId: string): Promise<string[]> {
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId, userId: { not: userId } },
      select: { userId: true },
    });
    return members.map((m) => m.userId);
  }

  /** Crée (ou retrouve) le DM avec un utilisateur — un seul DM par paire. */
  async getOrCreateDm(user: AuthUser, otherId: string): Promise<ConversationDTO> {
    if (otherId === user.id) throw new BadRequestException('Conversation avec soi-même impossible');
    const other = await this.prisma.user.findFirst({
      where: { id: otherId, deletedAt: null, bannedAt: null },
      include: { preference: true },
    });
    if (!other) throw new NotFoundException('Utilisateur introuvable');
    if (await this.friends.isBlockedEitherWay(user.id, otherId)) {
      throw new ForbiddenException('Conversation indisponible');
    }
    if (other.preference && !other.preference.allowDms) {
      throw new ForbiddenException("Cet utilisateur n'accepte pas les messages privés");
    }

    const key = dmKey(user.id, otherId);
    let conversation = await this.prisma.conversation.findUnique({ where: { dmKey: key } });
    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          dmKey: key,
          members: { create: [{ userId: user.id }, { userId: otherId }] },
        },
      });
    }
    const list = await this.listConversations(user);
    const found = list.find((c) => c.id === conversation!.id);
    if (found) return found;
    // Conversation neuve sans message
    const otherSummary = await this.prisma.user.findUnique({
      where: { id: otherId },
      select: userSummarySelect,
    });
    return {
      id: conversation.id,
      other: toUserSummary(otherSummary as never),
      lastMessage: null,
      unreadCount: 0,
      muted: false,
      lastMessageAt: null,
    };
  }

  async listConversations(user: AuthUser): Promise<ConversationDTO[]> {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId: user.id },
      include: {
        conversation: {
          include: {
            members: { include: { user: { select: userSummarySelect } } },
            messages: {
              where: { deletedAt: null },
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: { attachments: { select: { id: true } } },
            },
          },
        },
      },
    });

    const dtos: ConversationDTO[] = [];
    for (const membership of memberships) {
      const conv = membership.conversation;
      const otherMember = conv.members.find((m) => m.userId !== user.id);
      if (!otherMember) continue;
      const last = conv.messages[0];
      const unreadCount = await this.prisma.message.count({
        where: {
          conversationId: conv.id,
          deletedAt: null,
          authorId: { not: user.id },
          createdAt: { gt: membership.lastReadAt ?? new Date(0) },
        },
      });
      dtos.push({
        id: conv.id,
        other: toUserSummary(otherMember.user as never),
        lastMessage: last
          ? {
              content: last.content.slice(0, 80),
              authorId: last.authorId,
              createdAt: last.createdAt.toISOString(),
              hasAttachment: last.attachments.length > 0,
            }
          : null,
        unreadCount,
        muted: membership.muted,
        lastMessageAt: conv.lastMessageAt?.toISOString() ?? null,
      });
    }
    return dtos.sort(
      (a, b) => new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime(),
    );
  }

  async getMessages(
    user: AuthUser,
    conversationId: string,
    cursor?: string,
    limit = 30,
  ): Promise<Paginated<MessageDTO>> {
    await this.requireMembership(conversationId, user.id);
    const cursorId = decodeCursor(cursor);

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      include: messageInclude,
    });

    const hasMore = messages.length > limit;
    const page = messages.slice(0, limit);
    return {
      items: page.map((m) => this.toDto(m as FullMessage, user.id)).reverse(),
      nextCursor: hasMore ? encodeCursor(page[page.length - 1].id) : null,
    };
  }

  async sendMessage(
    user: AuthUser,
    conversationId: string,
    input: { content: string; replyToId?: string; attachments: string[] },
  ): Promise<MessageDTO> {
    await this.requireMembership(conversationId, user.id);

    if (await this.redis.isRateLimited(`rl:msg:${user.id}`, 15, 10)) {
      throw new HttpException('Trop de messages, ralentis un peu', HttpStatus.TOO_MANY_REQUESTS);
    }

    const otherIds = await this.otherMemberIds(conversationId, user.id);
    for (const otherId of otherIds) {
      if (await this.friends.isBlockedEitherWay(user.id, otherId)) {
        throw new ForbiddenException('Conversation indisponible');
      }
    }

    if (input.replyToId) {
      const target = await this.prisma.message.findFirst({
        where: { id: input.replyToId, conversationId },
      });
      if (!target) throw new BadRequestException('Message cité introuvable');
    }

    const content = sanitizePlainText(input.content);
    const claimed = await this.uploads.claim(user.id, input.attachments);
    if (!content && claimed.length === 0) throw new BadRequestException('Message vide');

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        authorId: user.id,
        content,
        replyToId: input.replyToId,
        attachments: {
          create: claimed.map((c) => ({
            fileName: c.fileName,
            storedName: c.storedName,
            mimeType: c.mimeType,
            size: c.size,
          })),
        },
      },
      include: messageInclude,
    });
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: message.createdAt },
    });
    // L'auteur a évidemment lu sa propre conversation
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: user.id } },
      data: { lastReadAt: message.createdAt },
    });

    const dto = this.toDto(message as FullMessage, user.id);
    this.realtime.emitToUsers([user.id, ...otherIds], 'message.new', dto);

    // Notification uniquement pour les destinataires hors ligne, conversation non muette
    for (const otherId of otherIds) {
      const membership = await this.prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId: otherId } },
      });
      if (membership?.muted) continue;
      if (!(await this.presence.isOnline(otherId))) {
        await this.notifications.notify(
          otherId,
          'NEW_MESSAGE',
          `Nouveau message de ${user.displayName}`,
          content.slice(0, 100) || 'Pièce jointe',
          `/messages/${conversationId}`,
        );
      }
    }
    return dto;
  }

  async editMessage(user: AuthUser, messageId: string, content: string): Promise<MessageDTO> {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) throw new NotFoundException('Message introuvable');
    if (message.authorId !== user.id) throw new ForbiddenException('Seul l’auteur peut modifier ce message');

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { content: sanitizePlainText(content), editedAt: new Date() },
      include: messageInclude,
    });
    const dto = this.toDto(updated as FullMessage, user.id);
    const memberIds = await this.prisma.conversationMember.findMany({
      where: { conversationId: message.conversationId },
      select: { userId: true },
    });
    this.realtime.emitToUsers(memberIds.map((m) => m.userId), 'message.updated', dto);
    return dto;
  }

  async deleteMessage(user: AuthUser, messageId: string): Promise<void> {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) throw new NotFoundException('Message introuvable');
    const canModerate = user.permissions.includes('messages.moderate');
    if (message.authorId !== user.id && !canModerate) {
      throw new ForbiddenException('Action non autorisée');
    }
    await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });
    const memberIds = await this.prisma.conversationMember.findMany({
      where: { conversationId: message.conversationId },
      select: { userId: true },
    });
    this.realtime.emitToUsers(memberIds.map((m) => m.userId), 'message.deleted', {
      messageId,
      conversationId: message.conversationId,
    });
  }

  async react(user: AuthUser, messageId: string, emoji: string, add: boolean): Promise<void> {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) throw new NotFoundException('Message introuvable');
    await this.requireMembership(message.conversationId, user.id);

    if (add) {
      await this.prisma.messageReaction.upsert({
        where: { messageId_userId_emoji: { messageId, userId: user.id, emoji } },
        create: { messageId, userId: user.id, emoji },
        update: {},
      });
    } else {
      await this.prisma.messageReaction.deleteMany({
        where: { messageId, userId: user.id, emoji },
      });
    }
    const updated = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: messageInclude,
    });
    const memberIds = await this.prisma.conversationMember.findMany({
      where: { conversationId: message.conversationId },
      select: { userId: true },
    });
    for (const m of memberIds) {
      this.realtime.emitToUser(m.userId, 'message.reaction', this.toDto(updated as FullMessage, m.userId));
    }
  }

  async markRead(user: AuthUser, conversationId: string): Promise<void> {
    await this.requireMembership(conversationId, user.id);
    const now = new Date();
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: user.id } },
      data: { lastReadAt: now },
    });
    const otherIds = await this.otherMemberIds(conversationId, user.id);
    this.realtime.emitToUsers([user.id, ...otherIds], 'conversation.read', {
      conversationId,
      userId: user.id,
      at: now.toISOString(),
    });
  }

  async setMuted(user: AuthUser, conversationId: string, muted: boolean): Promise<void> {
    await this.requireMembership(conversationId, user.id);
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: user.id } },
      data: { muted },
    });
  }

  async search(user: AuthUser, conversationId: string, q: string): Promise<MessageDTO[]> {
    await this.requireMembership(conversationId, user.id);
    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        deletedAt: null,
        content: { contains: q, mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: messageInclude,
    });
    return messages.map((m) => this.toDto(m as FullMessage, user.id));
  }

  async report(user: AuthUser, messageId: string, reason: string, details: string): Promise<void> {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message introuvable');
    await this.requireMembership(message.conversationId, user.id);
    await this.prisma.report.create({
      data: {
        reporterId: user.id,
        targetUserId: message.authorId,
        messageId,
        reason: sanitizePlainText(reason),
        details: sanitizePlainText(details),
      },
    });
  }
}
