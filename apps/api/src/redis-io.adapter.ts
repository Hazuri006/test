import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { ServerOptions } from 'socket.io';
import { env } from './config/env';

/**
 * Adapter Socket.IO branché sur Redis pub/sub — permet de faire tourner
 * plusieurs instances de l'API derrière un load balancer.
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  async connectToRedis(): Promise<void> {
    const pubClient = new Redis(env.REDIS_URL);
    const subClient = pubClient.duplicate();
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): ReturnType<IoAdapter['createIOServer']> {
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: env.WEB_URL, credentials: true },
    });
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }
}
