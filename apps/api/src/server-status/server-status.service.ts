import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { GAME_SERVER_ADAPTER, type GameServerAdapter } from './adapters/adapter.interface';
import type { GameServerStatus, ServerStatusHistoryPoint } from '@yurei/shared';

const CACHE_KEY = 'gameserver:status';
const CACHE_TTL = 10; // secondes
const SNAPSHOT_LOCK = 'gameserver:snapshot:lock';

@Injectable()
export class ServerStatusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ServerStatusService.name);
  private snapshotTimer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(GAME_SERVER_ADAPTER) private readonly adapter: GameServerAdapter,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  onModuleInit(): void {
    // Instantané toutes les 5 minutes (verrou Redis : une seule instance écrit)
    this.snapshotTimer = setInterval(() => {
      this.snapshot().catch((err) => this.logger.warn(`Snapshot: ${(err as Error).message}`));
    }, 5 * 60_000);
  }

  onModuleDestroy(): void {
    if (this.snapshotTimer) clearInterval(this.snapshotTimer);
  }

  async getStatus(): Promise<GameServerStatus> {
    const cached = await this.redis.getJson<GameServerStatus>(CACHE_KEY);
    if (cached) return cached;

    const raw = await this.adapter.fetchStatus();
    const status: GameServerStatus = {
      ...raw,
      source: this.adapter.source,
      demo: this.adapter.demo,
      recordedAt: new Date().toISOString(),
    };
    await this.redis.setJson(CACHE_KEY, status, CACHE_TTL);
    return status;
  }

  async getHistory(hours: number): Promise<ServerStatusHistoryPoint[]> {
    const rows = await this.prisma.serverStatus.findMany({
      where: { recordedAt: { gte: new Date(Date.now() - hours * 3600 * 1000) } },
      orderBy: { recordedAt: 'asc' },
      take: 500,
    });
    return rows.map((r) => ({
      recordedAt: r.recordedAt.toISOString(),
      playerCount: r.playerCount,
      online: r.online,
    }));
  }

  private async snapshot(): Promise<void> {
    const locked = await this.redis.client.set(SNAPSHOT_LOCK, '1', 'EX', 240, 'NX');
    if (!locked) return;
    const status = await this.getStatus();
    await this.prisma.serverStatus.create({
      data: {
        online: status.online,
        playerCount: status.playerCount,
        maxPlayers: status.maxPlayers,
        mapName: status.mapName,
        uptimeSeconds: status.uptimeSeconds,
        version: status.version,
        latencyMs: status.latencyMs,
        maintenance: status.maintenance,
        players: status.players as never,
        source: status.source,
      },
    });
  }
}
