import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AuditService } from '../audit/audit.service';
import { sanitizePlainText, sanitizeRichContent } from '../common/sanitize';
import { toUserSummary, userSummarySelect } from '../common/mappers';
import { PERMISSIONS } from '@yurei/shared';
import type { AuthUser } from '../common/decorators';
import type { AnnouncementDTO, AnnouncementInput } from '@yurei/shared';
import type { Announcement, Prisma } from '@prisma/client';

type FullAnnouncement = Announcement & {
  author: Prisma.UserGetPayload<{ select: typeof userSummarySelect }>;
};

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

@Injectable()
export class AnnouncementsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnnouncementsService.name);
  private scheduleTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    // Publication programmée : vérification chaque minute
    this.scheduleTimer = setInterval(() => {
      this.publishScheduled().catch((err) =>
        this.logger.warn(`Publication programmée: ${(err as Error).message}`),
      );
    }, 60_000);
  }

  onModuleDestroy(): void {
    if (this.scheduleTimer) clearInterval(this.scheduleTimer);
  }

  private toDto(a: FullAnnouncement, withContent = false): AnnouncementDTO {
    return {
      id: a.id,
      slug: a.slug,
      title: a.title,
      summary: a.summary,
      ...(withContent ? { content: a.content } : {}),
      imageUrl: a.imageUrl,
      category: a.category,
      tags: a.tags,
      pinned: a.pinned,
      status: a.status,
      author: toUserSummary(a.author as never),
      publishedAt: a.publishedAt?.toISOString() ?? null,
      scheduledFor: a.scheduledFor?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    };
  }

  async list(user: AuthUser, includeDrafts: boolean): Promise<AnnouncementDTO[]> {
    const canManage =
      user.permissions.includes(PERMISSIONS.ANNOUNCEMENTS_CREATE) ||
      user.permissions.includes(PERMISSIONS.ANNOUNCEMENTS_MANAGE);
    const where: Prisma.AnnouncementWhereInput =
      includeDrafts && canManage
        ? { deletedAt: null }
        : { deletedAt: null, status: 'PUBLISHED', publishedAt: { lte: new Date() } };

    const rows = await this.prisma.announcement.findMany({
      where,
      orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: 50,
      include: { author: { select: userSummarySelect } },
    });
    return rows.map((a) => this.toDto(a as FullAnnouncement));
  }

  async getBySlug(user: AuthUser, slug: string): Promise<AnnouncementDTO> {
    const announcement = await this.prisma.announcement.findFirst({
      where: { slug, deletedAt: null },
      include: { author: { select: userSummarySelect } },
    });
    if (!announcement) throw new NotFoundException('Annonce introuvable');
    const canManage = user.permissions.includes(PERMISSIONS.ANNOUNCEMENTS_CREATE);
    if (announcement.status !== 'PUBLISHED' && !canManage && announcement.authorId !== user.id) {
      throw new NotFoundException('Annonce introuvable');
    }
    return this.toDto(announcement as FullAnnouncement, true);
  }

  async create(user: AuthUser, input: AnnouncementInput): Promise<AnnouncementDTO> {
    let slug = slugify(input.title) || 'annonce';
    const existing = await this.prisma.announcement.findUnique({ where: { slug } });
    if (existing) slug = `${slug}-${Date.now().toString(36)}`;

    const publishNow = input.status === 'PUBLISHED' && !input.scheduledFor;
    const announcement = await this.prisma.announcement.create({
      data: {
        slug,
        title: sanitizePlainText(input.title),
        summary: sanitizePlainText(input.summary),
        content: sanitizeRichContent(input.content),
        imageUrl: input.imageUrl || null,
        category: sanitizePlainText(input.category),
        tags: input.tags.map((t) => sanitizePlainText(t)),
        status: publishNow ? 'PUBLISHED' : 'DRAFT',
        pinned: input.pinned,
        scheduledFor: input.scheduledFor ?? null,
        publishedAt: publishNow ? new Date() : null,
        authorId: user.id,
      },
      include: { author: { select: userSummarySelect } },
    });

    if (publishNow) await this.broadcastPublication(announcement as FullAnnouncement);
    await this.audit.log({
      actorId: user.id,
      action: 'announcement.create',
      targetType: 'Announcement',
      targetId: announcement.id,
    });
    return this.toDto(announcement as FullAnnouncement, true);
  }

  async update(user: AuthUser, id: string, input: AnnouncementInput): Promise<AnnouncementDTO> {
    const existing = await this.prisma.announcement.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Annonce introuvable');
    const canManageAll = user.permissions.includes(PERMISSIONS.ANNOUNCEMENTS_MANAGE);
    if (existing.authorId !== user.id && !canManageAll) {
      throw new ForbiddenException('Vous ne pouvez modifier que vos propres annonces');
    }

    const publishNow = input.status === 'PUBLISHED' && existing.status === 'DRAFT' && !input.scheduledFor;
    const announcement = await this.prisma.announcement.update({
      where: { id },
      data: {
        title: sanitizePlainText(input.title),
        summary: sanitizePlainText(input.summary),
        content: sanitizeRichContent(input.content),
        imageUrl: input.imageUrl || null,
        category: sanitizePlainText(input.category),
        tags: input.tags.map((t) => sanitizePlainText(t)),
        pinned: input.pinned,
        scheduledFor: input.scheduledFor ?? null,
        ...(publishNow ? { status: 'PUBLISHED', publishedAt: new Date() } : { status: input.status }),
      },
      include: { author: { select: userSummarySelect } },
    });

    if (publishNow) await this.broadcastPublication(announcement as FullAnnouncement);
    await this.audit.log({
      actorId: user.id,
      action: 'announcement.update',
      targetType: 'Announcement',
      targetId: id,
    });
    return this.toDto(announcement as FullAnnouncement, true);
  }

  async softDelete(user: AuthUser, id: string): Promise<void> {
    const existing = await this.prisma.announcement.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Annonce introuvable');
    await this.prisma.announcement.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({
      actorId: user.id,
      action: 'announcement.delete',
      targetType: 'Announcement',
      targetId: id,
    });
  }

  private async publishScheduled(): Promise<void> {
    const due = await this.prisma.announcement.findMany({
      where: { status: 'DRAFT', deletedAt: null, scheduledFor: { lte: new Date() } },
      include: { author: { select: userSummarySelect } },
    });
    for (const announcement of due) {
      const published = await this.prisma.announcement.update({
        where: { id: announcement.id },
        data: { status: 'PUBLISHED', publishedAt: new Date(), scheduledFor: null },
        include: { author: { select: userSummarySelect } },
      });
      await this.broadcastPublication(published as FullAnnouncement);
      this.logger.log(`Annonce programmée publiée: ${published.slug}`);
    }
  }

  /** Diffuse l'annonce en temps réel + notifications selon les préférences. */
  private async broadcastPublication(announcement: FullAnnouncement): Promise<void> {
    this.realtime.broadcast('announcement.new', this.toDto(announcement));
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        bannedAt: null,
        OR: [{ preference: null }, { preference: { notifyAnnouncements: true } }],
      },
      select: { id: true },
    });
    await this.prisma.notification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        type: 'ANNOUNCEMENT' as const,
        title: `📢 ${announcement.title}`,
        body: announcement.summary,
        link: `/news/${announcement.slug}`,
      })),
    });
  }
}
