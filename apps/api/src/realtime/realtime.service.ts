import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

/** Point d'émission central des événements temps réel vers les clients. */
@Injectable()
export class RealtimeService {
  private server: Server | null = null;

  setServer(server: Server): void {
    this.server = server;
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  emitToUsers(userIds: string[], event: string, payload: unknown): void {
    for (const id of new Set(userIds)) this.emitToUser(id, event, payload);
  }

  broadcast(event: string, payload: unknown): void {
    this.server?.emit(event, payload);
  }

  async disconnectUser(userId: string): Promise<void> {
    if (!this.server) return;
    const sockets = await this.server.in(`user:${userId}`).fetchSockets();
    for (const socket of sockets) socket.disconnect(true);
  }
}
