import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { parse as parseCookie } from 'cookie';
import type { Server, Socket } from 'socket.io';
import { SessionService, SESSION_COOKIE } from '../session/session.service';
import { PresenceService } from './presence.service';
import { RealtimeService } from './realtime.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/decorators';

interface AuthedSocket extends Socket {
  data: { user?: AuthUser };
}

@WebSocketGateway({ path: '/ws' })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly sessions: SessionService,
    private readonly presence: PresenceService,
    private readonly realtime: RealtimeService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server): void {
    this.realtime.setServer(server);
  }

  async handleConnection(socket: AuthedSocket): Promise<void> {
    try {
      const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
      const user = await this.sessions.validate(cookies[SESSION_COOKIE] ?? '');
      if (!user) {
        socket.disconnect(true);
        return;
      }
      socket.data.user = user;
      await socket.join(`user:${user.id}`);
      await this.presence.handleConnect(user.id, socket.id);
      socket.emit('presence.list', await this.presence.getOnlineList());
    } catch (err) {
      this.logger.warn(`Connexion WS refusée: ${(err as Error).message}`);
      socket.disconnect(true);
    }
  }

  async handleDisconnect(socket: AuthedSocket): Promise<void> {
    const user = socket.data.user;
    if (user) await this.presence.handleDisconnect(user.id, socket.id);
  }

  @SubscribeMessage('heartbeat')
  async onHeartbeat(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { idle?: boolean; activity?: string },
  ): Promise<void> {
    const user = socket.data.user;
    if (!user) return;
    const activity = typeof body?.activity === 'string' ? body.activity : undefined;
    await this.presence.heartbeat(user.id, body?.idle === true, activity);
  }

  @SubscribeMessage('typing')
  async onTyping(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { conversationId?: string; isTyping?: boolean },
  ): Promise<void> {
    const user = socket.data.user;
    if (!user || typeof body?.conversationId !== 'string') return;

    // Autorisation : uniquement les membres de la conversation.
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId: body.conversationId },
      select: { userId: true },
    });
    if (!members.some((m) => m.userId === user.id)) return;

    for (const member of members) {
      if (member.userId === user.id) continue;
      this.realtime.emitToUser(member.userId, 'typing', {
        conversationId: body.conversationId,
        userId: user.id,
        displayName: user.displayName,
        isTyping: body.isTyping === true,
      });
    }
  }
}
