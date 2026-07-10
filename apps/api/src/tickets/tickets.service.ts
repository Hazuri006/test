import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { UploadsService } from '../uploads/uploads.service';
import { AuditService } from '../audit/audit.service';
import { sanitizePlainText } from '../common/sanitize';
import { decodeCursor, encodeCursor, toUserSummary, userSummarySelect } from '../common/mappers';
import { env } from '../config/env';
import { PERMISSIONS, ticketNumberLabel } from '@yurei/shared';
import type { AuthUser } from '../common/decorators';
import type {
  CreateTicketInput,
  Paginated,
  TicketDetail,
  TicketListItem,
  TicketMessageDTO,
} from '@yurei/shared';
import type { Prisma, Ticket, TicketStatus } from '@prisma/client';

const listInclude = {
  creator: { select: userSummarySelect },
  assignee: { select: userSummarySelect },
} as const;

type TicketWithRefs = Ticket & {
  creator: Prisma.UserGetPayload<{ select: typeof userSummarySelect }>;
  assignee: Prisma.UserGetPayload<{ select: typeof userSummarySelect }> | null;
};

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
    private readonly uploads: UploadsService,
    private readonly audit: AuditService,
  ) {}

  private isStaff(user: AuthUser): boolean {
    return user.permissions.includes(PERMISSIONS.TICKETS_VIEW_ALL);
  }

  private toListItem(t: TicketWithRefs): TicketListItem {
    return {
      id: t.id,
      number: t.number,
      code: ticketNumberLabel(t.number),
      title: t.title,
      category: t.category,
      priority: t.priority,
      status: t.status,
      creator: toUserSummary(t.creator as never),
      assignee: t.assignee ? toUserSummary(t.assignee as never) : null,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      lastMessageAt: t.lastMessageAt?.toISOString() ?? null,
    };
  }

  private async requireTicketAccess(user: AuthUser, ticketId: string): Promise<Ticket> {
    const ticket = await this.prisma.ticket.findFirst({ where: { id: ticketId, deletedAt: null } });
    if (!ticket) throw new NotFoundException('Ticket introuvable');
    if (this.isStaff(user)) return ticket;
    const participant = await this.prisma.ticketParticipant.findUnique({
      where: { ticketId_userId: { ticketId, userId: user.id } },
    });
    if (ticket.creatorId !== user.id && !participant) {
      throw new ForbiddenException('Accès refusé à ce ticket');
    }
    return ticket;
  }

  private async notifyStaffAndParticipants(
    ticket: Ticket,
    exceptUserId: string,
    title: string,
    body: string,
  ): Promise<void> {
    const participantIds = (
      await this.prisma.ticketParticipant.findMany({ where: { ticketId: ticket.id } })
    ).map((p) => p.userId);
    const targets = new Set<string>([ticket.creatorId, ...participantIds]);
    if (ticket.assigneeId) targets.add(ticket.assigneeId);
    targets.delete(exceptUserId);
    for (const target of targets) {
      await this.notifications.notify(target, 'TICKET_REPLY', title, body, `/tickets/${ticket.id}`);
    }
    this.realtime.emitToUsers([...targets, exceptUserId], 'ticket.updated', {
      ticketId: ticket.id,
    });
  }

  async create(user: AuthUser, input: CreateTicketInput): Promise<TicketDetail> {
    if (input.subjectUserId) {
      const subject = await this.prisma.user.findFirst({
        where: { id: input.subjectUserId, deletedAt: null },
      });
      if (!subject) throw new BadRequestException('Utilisateur concerné introuvable');
    }

    const claimed = await this.uploads.claim(user.id, input.attachments);
    const ticket = await this.prisma.ticket.create({
      data: {
        title: sanitizePlainText(input.title),
        category: input.category,
        priority: input.priority,
        creatorId: user.id,
        lastMessageAt: new Date(),
        participants: {
          create: [
            { userId: user.id },
            ...(input.subjectUserId && input.subjectUserId !== user.id
              ? [{ userId: input.subjectUserId }]
              : []),
          ],
        },
        messages: {
          create: { authorId: user.id, content: sanitizePlainText(input.description) },
        },
      },
      include: listInclude,
    });

    const firstMessage = await this.prisma.ticketMessage.findFirst({
      where: { ticketId: ticket.id },
    });
    if (claimed.length > 0 && firstMessage) {
      await this.prisma.ticketAttachment.createMany({
        data: claimed.map((c) => ({
          ticketId: ticket.id,
          ticketMessageId: firstMessage.id,
          fileName: c.fileName,
          storedName: c.storedName,
          mimeType: c.mimeType,
          size: c.size,
        })),
      });
    }

    await this.audit.log({
      actorId: user.id,
      action: 'ticket.create',
      targetType: 'Ticket',
      targetId: ticket.id,
    });
    void this.sendDiscordWebhook(ticket as TicketWithRefs);

    return this.getDetail(user, ticket.id);
  }

  /** Webhook Discord facultatif — résumé sans contenu sensible. */
  private async sendDiscordWebhook(ticket: TicketWithRefs): Promise<void> {
    if (!env.DISCORD_TICKET_WEBHOOK_URL) return;
    try {
      await fetch(env.DISCORD_TICKET_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [
            {
              title: `🎫 Nouveau ticket ${ticketNumberLabel(ticket.number)}`,
              color: 0x8b5cf6,
              fields: [
                { name: 'Catégorie', value: ticket.category, inline: true },
                { name: 'Priorité', value: ticket.priority, inline: true },
              ],
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      });
    } catch (err) {
      this.logger.warn(`Webhook Discord tickets: ${(err as Error).message}`);
    }
  }

  async listOwn(user: AuthUser): Promise<TicketListItem[]> {
    const tickets = await this.prisma.ticket.findMany({
      where: {
        deletedAt: null,
        OR: [{ creatorId: user.id }, { participants: { some: { userId: user.id } } }],
      },
      orderBy: { updatedAt: 'desc' },
      include: listInclude,
    });
    return tickets.map((t) => this.toListItem(t as TicketWithRefs));
  }

  async listAll(
    _user: AuthUser,
    filters: {
      status?: TicketStatus;
      category?: string;
      priority?: string;
      creatorId?: string;
      assigneeId?: string;
      unassigned?: boolean;
      q?: string;
      cursor?: string;
      limit: number;
    },
  ): Promise<Paginated<TicketListItem>> {
    const where: Prisma.TicketWhereInput = {
      deletedAt: null,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.category ? { category: filters.category as never } : {}),
      ...(filters.priority ? { priority: filters.priority as never } : {}),
      ...(filters.creatorId ? { creatorId: filters.creatorId } : {}),
      ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
      ...(filters.unassigned ? { assigneeId: null, status: { notIn: ['CLOSED', 'ARCHIVED'] } } : {}),
      ...(filters.q
        ? {
            OR: [
              { title: { contains: filters.q, mode: 'insensitive' } },
              { creator: { displayName: { contains: filters.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const cursorId = decodeCursor(filters.cursor);
    const tickets = await this.prisma.ticket.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: filters.limit + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      include: listInclude,
    });
    const hasMore = tickets.length > filters.limit;
    const page = tickets.slice(0, filters.limit);
    return {
      items: page.map((t) => this.toListItem(t as TicketWithRefs)),
      nextCursor: hasMore ? encodeCursor(page[page.length - 1].id) : null,
    };
  }

  async getDetail(user: AuthUser, ticketId: string): Promise<TicketDetail> {
    await this.requireTicketAccess(user, ticketId);
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        ...listInclude,
        participants: { include: { user: { select: userSummarySelect } } },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          include: { author: { select: userSummarySelect }, attachments: true },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket introuvable');

    // Notes internes : visibles uniquement par le staff
    const internalNotes = this.isStaff(user)
      ? await this.prisma.ticketInternalNote.findMany({
          where: { ticketId },
          orderBy: { createdAt: 'asc' },
          include: { author: { select: userSummarySelect } },
        })
      : null;

    const messages: TicketMessageDTO[] = ticket.messages.map((m) => ({
      id: m.id,
      author: toUserSummary(m.author as never),
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      system: m.system,
      attachments: m.attachments.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        mimeType: a.mimeType,
        size: a.size,
        url: this.uploads.fileUrl(a.storedName),
      })),
    }));

    return {
      ...this.toListItem(ticket as unknown as TicketWithRefs),
      participants: ticket.participants.map((p) => toUserSummary(p.user as never)),
      closedAt: ticket.closedAt?.toISOString() ?? null,
      messages,
      ...(internalNotes
        ? {
            internalNotes: internalNotes.map((n) => ({
              id: n.id,
              author: toUserSummary(n.author as never),
              content: n.content,
              createdAt: n.createdAt.toISOString(),
            })),
          }
        : {}),
    };
  }

  async addMessage(
    user: AuthUser,
    ticketId: string,
    input: { content: string; attachments: string[] },
  ): Promise<TicketDetail> {
    const ticket = await this.requireTicketAccess(user, ticketId);
    if (['CLOSED', 'ARCHIVED'].includes(ticket.status) && !this.isStaff(user)) {
      throw new ForbiddenException('Ce ticket est fermé');
    }

    const content = sanitizePlainText(input.content);
    const claimed = await this.uploads.claim(user.id, input.attachments);
    if (!content && claimed.length === 0) throw new BadRequestException('Message vide');

    const message = await this.prisma.ticketMessage.create({
      data: { ticketId, authorId: user.id, content },
    });
    if (claimed.length > 0) {
      await this.prisma.ticketAttachment.createMany({
        data: claimed.map((c) => ({
          ticketId,
          ticketMessageId: message.id,
          fileName: c.fileName,
          storedName: c.storedName,
          mimeType: c.mimeType,
          size: c.size,
        })),
      });
    }

    // Bascule automatique du statut selon qui répond
    const isStaffReply = this.isStaff(user) && ticket.creatorId !== user.id;
    const nextStatus: TicketStatus =
      ticket.status === 'RESOLVED' || ticket.status === 'CLOSED' || ticket.status === 'ARCHIVED'
        ? ticket.status
        : isStaffReply
          ? 'WAITING_USER'
          : ticket.assigneeId
            ? 'CLAIMED'
            : 'WAITING_STAFF';

    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { lastMessageAt: message.createdAt, status: nextStatus },
    });

    await this.notifyStaffAndParticipants(
      updated,
      user.id,
      `Réponse sur ${ticketNumberLabel(ticket.number)}`,
      `${user.displayName}: ${content.slice(0, 100) || 'Pièce jointe'}`,
    );
    this.realtime.emitToUsers(
      [ticket.creatorId, ...(ticket.assigneeId ? [ticket.assigneeId] : [])],
      'ticket.message',
      { ticketId },
    );
    return this.getDetail(user, ticketId);
  }

  async claim(user: AuthUser, ticketId: string): Promise<TicketDetail> {
    const ticket = await this.requireTicketAccess(user, ticketId);
    if (ticket.assigneeId && ticket.assigneeId !== user.id) {
      throw new BadRequestException('Ticket déjà pris en charge');
    }
    await this.prisma.$transaction([
      this.prisma.ticket.update({
        where: { id: ticketId },
        data: { assigneeId: user.id, status: 'CLAIMED' },
      }),
      this.prisma.ticketMessage.create({
        data: {
          ticketId,
          authorId: user.id,
          system: true,
          content: `${user.displayName} a pris en charge le ticket.`,
        },
      }),
    ]);
    await this.notifications.notify(
      ticket.creatorId,
      'TICKET_CLAIMED',
      `${ticketNumberLabel(ticket.number)} pris en charge`,
      `${user.displayName} s'occupe de ton ticket.`,
      `/tickets/${ticketId}`,
    );
    await this.audit.log({ actorId: user.id, action: 'ticket.claim', targetType: 'Ticket', targetId: ticketId });
    this.realtime.emitToUser(ticket.creatorId, 'ticket.updated', { ticketId });
    return this.getDetail(user, ticketId);
  }

  async update(
    user: AuthUser,
    ticketId: string,
    patch: { priority?: string; category?: string; assigneeId?: string | null },
  ): Promise<TicketDetail> {
    const ticket = await this.requireTicketAccess(user, ticketId);
    if (patch.assigneeId) {
      const assignee = await this.prisma.user.findFirst({
        where: { id: patch.assigneeId, deletedAt: null },
      });
      if (!assignee) throw new BadRequestException('Agent introuvable');
    }
    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        ...(patch.priority ? { priority: patch.priority as never } : {}),
        ...(patch.category ? { category: patch.category as never } : {}),
        ...(patch.assigneeId !== undefined ? { assigneeId: patch.assigneeId } : {}),
      },
    });
    await this.audit.log({
      actorId: user.id,
      action: 'ticket.update',
      targetType: 'Ticket',
      targetId: ticketId,
      metadata: patch as Record<string, unknown>,
    });
    this.realtimeNotify(ticket);
    return this.getDetail(user, ticketId);
  }

  private realtimeNotify(ticket: Ticket): void {
    this.realtime.emitToUsers(
      [ticket.creatorId, ...(ticket.assigneeId ? [ticket.assigneeId] : [])],
      'ticket.updated',
      { ticketId: ticket.id },
    );
  }

  async setStatus(user: AuthUser, ticketId: string, status: TicketStatus): Promise<TicketDetail> {
    const ticket = await this.requireTicketAccess(user, ticketId);
    const staff = this.isStaff(user);
    const canClose = user.permissions.includes(PERMISSIONS.TICKETS_CLOSE);
    const canArchive = user.permissions.includes(PERMISSIONS.TICKETS_DELETE);

    // Membre : peut fermer son propre ticket ou demander sa réouverture.
    if (!staff) {
      const allowed =
        (status === 'CLOSED' && ticket.creatorId === user.id) ||
        (status === 'WAITING_STAFF' && ticket.creatorId === user.id &&
          ['CLOSED', 'RESOLVED'].includes(ticket.status));
      if (!allowed) throw new ForbiddenException('Action non autorisée');
    } else {
      if (status === 'ARCHIVED' && !canArchive) throw new ForbiddenException('Permission requise: tickets.delete');
      if (['CLOSED', 'RESOLVED', 'OPEN', 'WAITING_STAFF', 'WAITING_USER', 'CLAIMED'].includes(status) && !canClose) {
        throw new ForbiddenException('Permission requise: tickets.close');
      }
    }

    const closing = ['CLOSED', 'RESOLVED', 'ARCHIVED'].includes(status);
    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { status, closedAt: closing ? new Date() : null },
    });
    await this.prisma.ticketMessage.create({
      data: {
        ticketId,
        authorId: user.id,
        system: true,
        content: `Statut changé en ${status} par ${user.displayName}.`,
      },
    });
    await this.notifications.notify(
      ticket.creatorId === user.id && ticket.assigneeId ? ticket.assigneeId : ticket.creatorId,
      'TICKET_STATUS',
      `${ticketNumberLabel(ticket.number)} — ${status}`,
      `Statut mis à jour par ${user.displayName}.`,
      `/tickets/${ticketId}`,
    );
    await this.audit.log({
      actorId: user.id,
      action: 'ticket.status',
      targetType: 'Ticket',
      targetId: ticketId,
      metadata: { status },
    });
    this.realtimeNotify(updated);
    return this.getDetail(user, ticketId);
  }

  async addInternalNote(user: AuthUser, ticketId: string, content: string): Promise<TicketDetail> {
    await this.requireTicketAccess(user, ticketId);
    await this.prisma.ticketInternalNote.create({
      data: { ticketId, authorId: user.id, content: sanitizePlainText(content) },
    });
    return this.getDetail(user, ticketId);
  }

  async softDelete(user: AuthUser, ticketId: string): Promise<void> {
    const ticket = await this.requireTicketAccess(user, ticketId);
    await this.prisma.ticket.update({ where: { id: ticketId }, data: { deletedAt: new Date() } });
    await this.audit.log({
      actorId: user.id,
      action: 'ticket.delete',
      targetType: 'Ticket',
      targetId: ticketId,
      metadata: { number: ticket.number },
    });
  }

  /** Transcription en texte brut, téléchargeable par les participants. */
  async transcript(user: AuthUser, ticketId: string): Promise<string> {
    const detail = await this.getDetail(user, ticketId);
    const lines = [
      `Transcription ${detail.code} — ${detail.title}`,
      `Catégorie: ${detail.category} | Priorité: ${detail.priority} | Statut: ${detail.status}`,
      `Créé par ${detail.creator.displayName} le ${detail.createdAt}`,
      ''.padEnd(60, '='),
      '',
    ];
    for (const m of detail.messages) {
      lines.push(`[${m.createdAt}] ${m.system ? '⚙' : ''}${m.author.displayName}:`);
      lines.push(m.content || '(pièce jointe)');
      for (const a of m.attachments) lines.push(`  📎 ${a.fileName} (${a.size} octets)`);
      lines.push('');
    }
    return lines.join('\n');
  }

  /** Statistiques staff : volumes par statut + temps moyen de première réponse. */
  async stats(): Promise<{
    byStatus: Record<string, number>;
    unassigned: number;
    avgFirstResponseMinutes: number | null;
  }> {
    const grouped = await this.prisma.ticket.groupBy({
      by: ['status'],
      where: { deletedAt: null },
      _count: { _all: true },
    });
    const byStatus: Record<string, number> = {};
    for (const g of grouped) byStatus[g.status] = g._count._all;

    const unassigned = await this.prisma.ticket.count({
      where: { deletedAt: null, assigneeId: null, status: { notIn: ['CLOSED', 'ARCHIVED', 'RESOLVED'] } },
    });

    // Première réponse d'une autre personne que le créateur
    const recent = await this.prisma.ticket.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        messages: { where: { system: false }, orderBy: { createdAt: 'asc' }, take: 10 },
      },
    });
    const durations: number[] = [];
    for (const t of recent) {
      const firstReply = t.messages.find((m) => m.authorId !== t.creatorId);
      if (firstReply) durations.push(firstReply.createdAt.getTime() - t.createdAt.getTime());
    }
    const avgFirstResponseMinutes =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 60000)
        : null;

    return { byStatus, unassigned, avgFirstResponseMinutes };
  }
}
