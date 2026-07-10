import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { FriendsService } from './friends.service';
import { CurrentUser, type AuthUser } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { friendTargetSchema } from '@yurei/shared';
import type { FriendEntry, FriendRequestEntry, UserSummary } from '@yurei/shared';

@Controller('friends')
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser): Promise<FriendEntry[]> {
    return this.friends.listFriends(user.id);
  }

  @Get('requests')
  async requests(@CurrentUser() user: AuthUser): Promise<FriendRequestEntry[]> {
    return this.friends.listRequests(user.id);
  }

  @Get('blocked')
  async blocked(@CurrentUser() user: AuthUser): Promise<UserSummary[]> {
    return this.friends.listBlocked(user.id);
  }

  @Post('requests')
  async sendRequest(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(friendTargetSchema)) body: { userId: string },
  ): Promise<{ ok: true }> {
    await this.friends.sendRequest(user.id, body.userId);
    return { ok: true };
  }

  @Post('requests/:id/accept')
  async accept(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    await this.friends.accept(user.id, id);
    return { ok: true };
  }

  @Post('requests/:id/decline')
  async decline(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    await this.friends.decline(user.id, id);
    return { ok: true };
  }

  @Post('requests/:id/cancel')
  async cancel(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    await this.friends.cancel(user.id, id);
    return { ok: true };
  }

  @Delete(':userId')
  async remove(@CurrentUser() user: AuthUser, @Param('userId') userId: string): Promise<{ ok: true }> {
    await this.friends.removeFriend(user.id, userId);
    return { ok: true };
  }

  @Post('block')
  async block(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(friendTargetSchema)) body: { userId: string },
  ): Promise<{ ok: true }> {
    await this.friends.block(user.id, body.userId);
    return { ok: true };
  }

  @Post('unblock')
  async unblock(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(friendTargetSchema)) body: { userId: string },
  ): Promise<{ ok: true }> {
    await this.friends.unblock(user.id, body.userId);
    return { ok: true };
  }
}
