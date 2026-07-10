import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AdminService } from './admin.service';
import { CurrentUser, RequirePermissions, type AuthUser } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import {
  moderationActionSchema,
  PERMISSIONS,
  resolveReportSchema,
  revokeSanctionSchema,
  setRoleSchema,
  updateSettingsSchema,
} from '@yurei/shared';
import { z } from 'zod';

const listUsersSchema = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.string().max(20).optional(),
  banned: z.coerce.boolean().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

const auditFilterSchema = z.object({
  action: z.string().trim().max(60).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  @RequirePermissions(PERMISSIONS.ADMIN_ACCESS)
  async overview(): Promise<unknown> {
    return this.admin.overview();
  }

  @Get('stats')
  @RequirePermissions(PERMISSIONS.ADMIN_ACCESS)
  async stats(): Promise<unknown> {
    return this.admin.stats();
  }

  @Get('users')
  @RequirePermissions(PERMISSIONS.ADMIN_ACCESS, PERMISSIONS.USERS_MODERATE)
  async listUsers(
    @Query(new ZodPipe(listUsersSchema)) filters: z.infer<typeof listUsersSchema>,
  ): Promise<unknown> {
    return this.admin.listUsers(filters);
  }

  @Get('users/:id')
  @RequirePermissions(PERMISSIONS.ADMIN_ACCESS, PERMISSIONS.USERS_MODERATE)
  async userDetail(@Param('id') id: string): Promise<unknown> {
    return this.admin.getUserDetail(id);
  }

  @Post('users/:id/role')
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  async setRole(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(setRoleSchema)) body: z.infer<typeof setRoleSchema>,
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    await this.admin.setRole(user, id, body.roleName, body.reason, req.ip);
    return { ok: true };
  }

  @Post('users/:id/moderation')
  @RequirePermissions(PERMISSIONS.USERS_MODERATE)
  async moderate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(moderationActionSchema)) body: z.infer<typeof moderationActionSchema>,
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    await this.admin.applyModeration(user, id, body, req.ip);
    return { ok: true };
  }

  @Post('users/:id/moderation/revoke')
  @RequirePermissions(PERMISSIONS.USERS_MODERATE)
  async revoke(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(revokeSanctionSchema)) body: z.infer<typeof revokeSanctionSchema>,
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    await this.admin.revokeSanction(user, id, body.actionId, body.reason, req.ip);
    return { ok: true };
  }

  @Post('users/:id/discord-sync')
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  async discordSync(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    await this.admin.syncDiscordRoles(user, id);
    return { ok: true };
  }

  @Get('reports')
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  async reports(@Query('status') status?: string): Promise<unknown> {
    return this.admin.listReports(status);
  }

  @Post('reports/:id/resolve')
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  async resolveReport(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(resolveReportSchema)) body: z.infer<typeof resolveReportSchema>,
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    await this.admin.resolveReport(user, id, body.status, body.note, req.ip);
    return { ok: true };
  }

  @Get('audit')
  @RequirePermissions(PERMISSIONS.AUDIT_VIEW)
  async audit(
    @Query(new ZodPipe(auditFilterSchema)) filters: z.infer<typeof auditFilterSchema>,
  ): Promise<unknown> {
    return this.admin.listAuditLogs(filters);
  }

  @Get('roles')
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  async roles(): Promise<unknown> {
    return this.admin.listRoles();
  }

  @Get('settings')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  async settings(): Promise<unknown> {
    return this.admin.getSettings();
  }

  @Patch('settings')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  async updateSettings(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(updateSettingsSchema)) body: z.infer<typeof updateSettingsSchema>,
    @Req() req: Request,
  ): Promise<unknown> {
    return this.admin.updateSettings(user, body, req.ip);
  }
}
