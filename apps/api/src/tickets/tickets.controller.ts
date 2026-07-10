import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { TicketsService } from './tickets.service';
import { CurrentUser, RequirePermissions, type AuthUser } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import {
  createTicketSchema,
  PERMISSIONS,
  ticketFilterSchema,
  ticketInternalNoteSchema,
  ticketMessageSchema,
  TICKET_STATUSES,
  updateTicketSchema,
} from '@yurei/shared';
import type { Paginated, TicketDetail, TicketListItem } from '@yurei/shared';
import type { z } from 'zod';
import { BadRequestException } from '@nestjs/common';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @RequirePermissions(PERMISSIONS.TICKETS_CREATE)
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createTicketSchema)) body: z.infer<typeof createTicketSchema>,
  ): Promise<TicketDetail> {
    return this.tickets.create(user, body);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.TICKETS_VIEW_OWN)
  async listOwn(@CurrentUser() user: AuthUser): Promise<TicketListItem[]> {
    return this.tickets.listOwn(user);
  }

  @Get('all')
  @RequirePermissions(PERMISSIONS.TICKETS_VIEW_ALL)
  async listAll(
    @CurrentUser() user: AuthUser,
    @Query(new ZodPipe(ticketFilterSchema)) filters: z.infer<typeof ticketFilterSchema>,
  ): Promise<Paginated<TicketListItem>> {
    return this.tickets.listAll(user, filters);
  }

  @Get('stats')
  @RequirePermissions(PERMISSIONS.TICKETS_VIEW_ALL)
  async stats(): Promise<unknown> {
    return this.tickets.stats();
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.TICKETS_VIEW_OWN)
  async detail(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<TicketDetail> {
    return this.tickets.getDetail(user, id);
  }

  @Post(':id/messages')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @RequirePermissions(PERMISSIONS.TICKETS_VIEW_OWN)
  async addMessage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(ticketMessageSchema)) body: z.infer<typeof ticketMessageSchema>,
  ): Promise<TicketDetail> {
    return this.tickets.addMessage(user, id, body);
  }

  @Post(':id/claim')
  @RequirePermissions(PERMISSIONS.TICKETS_CLAIM)
  async claim(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<TicketDetail> {
    return this.tickets.claim(user, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.TICKETS_CLAIM)
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateTicketSchema)) body: z.infer<typeof updateTicketSchema>,
  ): Promise<TicketDetail> {
    return this.tickets.update(user, id, body);
  }

  @Post(':id/status')
  @RequirePermissions(PERMISSIONS.TICKETS_VIEW_OWN)
  async setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { status?: string },
  ): Promise<TicketDetail> {
    const status = body?.status;
    if (!status || !TICKET_STATUSES.includes(status as never)) {
      throw new BadRequestException('Statut invalide');
    }
    return this.tickets.setStatus(user, id, status as never);
  }

  @Post(':id/notes')
  @RequirePermissions(PERMISSIONS.TICKETS_VIEW_ALL)
  async addNote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(ticketInternalNoteSchema)) body: { content: string },
  ): Promise<TicketDetail> {
    return this.tickets.addInternalNote(user, id, body.content);
  }

  @Get(':id/transcript')
  @RequirePermissions(PERMISSIONS.TICKETS_VIEW_OWN)
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="transcript.txt"')
  async transcript(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<string> {
    return this.tickets.transcript(user, id);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.TICKETS_DELETE)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    await this.tickets.softDelete(user, id);
    return { ok: true };
  }
}
