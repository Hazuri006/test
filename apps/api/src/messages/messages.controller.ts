import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { CurrentUser, RequirePermissions, type AuthUser } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import {
  createConversationSchema,
  createReportSchema,
  editMessageSchema,
  PERMISSIONS,
  reactionSchema,
  searchMessagesSchema,
  sendMessageSchema,
} from '@yurei/shared';
import type { ConversationDTO, MessageDTO, Paginated } from '@yurei/shared';
import type { z } from 'zod';

@Controller()
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get('conversations')
  async list(@CurrentUser() user: AuthUser): Promise<ConversationDTO[]> {
    return this.messages.listConversations(user);
  }

  @Post('conversations')
  @RequirePermissions(PERMISSIONS.MESSAGES_SEND)
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createConversationSchema)) body: { userId: string },
  ): Promise<ConversationDTO> {
    return this.messages.getOrCreateDm(user, body.userId);
  }

  @Get('conversations/:id/messages')
  async messagesList(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
  ): Promise<Paginated<MessageDTO>> {
    return this.messages.getMessages(user, id, cursor);
  }

  @Post('conversations/:id/messages')
  @RequirePermissions(PERMISSIONS.MESSAGES_SEND)
  async send(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(sendMessageSchema)) body: z.infer<typeof sendMessageSchema>,
  ): Promise<MessageDTO> {
    return this.messages.sendMessage(user, id, body);
  }

  @Post('conversations/:id/read')
  async markRead(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    await this.messages.markRead(user, id);
    return { ok: true };
  }

  @Post('conversations/:id/mute')
  async mute(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { muted?: boolean },
  ): Promise<{ ok: true }> {
    await this.messages.setMuted(user, id, body?.muted === true);
    return { ok: true };
  }

  @Get('conversations/:id/search')
  async search(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query(new ZodPipe(searchMessagesSchema)) query: { q: string },
  ): Promise<MessageDTO[]> {
    return this.messages.search(user, id, query.q);
  }

  @Patch('messages/:id')
  async edit(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(editMessageSchema)) body: { content: string },
  ): Promise<MessageDTO> {
    return this.messages.editMessage(user, id, body.content);
  }

  @Delete('messages/:id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    await this.messages.deleteMessage(user, id);
    return { ok: true };
  }

  @Post('messages/:id/reactions')
  async addReaction(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(reactionSchema)) body: { emoji: string },
  ): Promise<{ ok: true }> {
    await this.messages.react(user, id, body.emoji, true);
    return { ok: true };
  }

  @Delete('messages/:id/reactions/:emoji')
  async removeReaction(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('emoji') emoji: string,
  ): Promise<{ ok: true }> {
    await this.messages.react(user, id, decodeURIComponent(emoji), false);
    return { ok: true };
  }

  @Post('messages/:id/report')
  async report(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(createReportSchema)) body: z.infer<typeof createReportSchema>,
  ): Promise<{ ok: true }> {
    await this.messages.report(user, id, body.reason, body.details);
    return { ok: true };
  }
}
