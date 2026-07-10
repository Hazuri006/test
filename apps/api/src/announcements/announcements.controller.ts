import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { CurrentUser, RequirePermissions, type AuthUser } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { announcementSchema, PERMISSIONS } from '@yurei/shared';
import type { AnnouncementDTO, AnnouncementInput } from '@yurei/shared';

@Controller('news')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query('drafts') drafts?: string,
  ): Promise<AnnouncementDTO[]> {
    return this.announcements.list(user, drafts === 'true');
  }

  @Get(':slug')
  async detail(@CurrentUser() user: AuthUser, @Param('slug') slug: string): Promise<AnnouncementDTO> {
    return this.announcements.getBySlug(user, slug);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ANNOUNCEMENTS_CREATE)
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(announcementSchema)) body: AnnouncementInput,
  ): Promise<AnnouncementDTO> {
    return this.announcements.create(user, body);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ANNOUNCEMENTS_CREATE)
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(announcementSchema)) body: AnnouncementInput,
  ): Promise<AnnouncementDTO> {
    return this.announcements.update(user, id, body);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.ANNOUNCEMENTS_MANAGE)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    await this.announcements.softDelete(user, id);
    return { ok: true };
  }
}
