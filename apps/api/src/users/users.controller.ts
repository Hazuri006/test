import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUser, type AuthUser } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { updatePreferencesSchema, updateProfileSchema } from '@yurei/shared';
import type { DashboardData, PublicProfile, UserSummary } from '@yurei/shared';
import type { z } from 'zod';

@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('dashboard')
  async dashboard(@CurrentUser() user: AuthUser): Promise<DashboardData> {
    return this.users.getDashboard(user);
  }

  @Get('users/search')
  async search(@CurrentUser() user: AuthUser, @Query('q') q = ''): Promise<UserSummary[]> {
    return this.users.search(user.id, q);
  }

  @Patch('users/me/profile')
  async updateProfile(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(updateProfileSchema)) body: z.infer<typeof updateProfileSchema>,
  ): Promise<{ ok: true }> {
    await this.users.updateProfile(user.id, body);
    return { ok: true };
  }

  @Patch('users/me/preferences')
  async updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(updatePreferencesSchema)) body: z.infer<typeof updatePreferencesSchema>,
  ): Promise<{ ok: true }> {
    await this.users.updatePreferences(user.id, body);
    return { ok: true };
  }

  @Get('users/:id')
  async publicProfile(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<PublicProfile> {
    return this.users.getPublicProfile(user, id);
  }
}
