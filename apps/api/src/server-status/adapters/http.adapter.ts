import { Injectable, Logger } from '@nestjs/common';
import { env } from '../../config/env';
import type { GameServerAdapter } from './adapter.interface';
import type { GameServerStatus } from '@yurei/shared';

/**
 * Adaptateur HTTP : interroge l'endpoint JSON du serveur de jeu configuré
 * via GAME_SERVER_STATUS_URL. Format attendu (champs optionnels tolérés) :
 * { online, playerCount, maxPlayers, mapName, uptimeSeconds, version, latencyMs, maintenance, players }
 */
@Injectable()
export class HttpGameServerAdapter implements GameServerAdapter {
  readonly source = 'http' as const;
  readonly demo = false;
  private readonly logger = new Logger(HttpGameServerAdapter.name);

  async fetchStatus(): Promise<Omit<GameServerStatus, 'source' | 'demo' | 'recordedAt'>> {
    const offline = {
      online: false,
      playerCount: 0,
      maxPlayers: 0,
      mapName: '',
      uptimeSeconds: 0,
      version: '',
      latencyMs: 0,
      maintenance: false,
    };
    if (!env.GAME_SERVER_STATUS_URL) return offline;
    try {
      const started = Date.now();
      const res = await fetch(env.GAME_SERVER_STATUS_URL, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return offline;
      const data = (await res.json()) as Record<string, unknown>;
      return {
        online: data.online !== false,
        playerCount: Number(data.playerCount ?? 0),
        maxPlayers: Number(data.maxPlayers ?? 0),
        mapName: String(data.mapName ?? ''),
        uptimeSeconds: Number(data.uptimeSeconds ?? 0),
        version: String(data.version ?? ''),
        latencyMs: Number(data.latencyMs ?? Date.now() - started),
        maintenance: data.maintenance === true,
        players: Array.isArray(data.players) ? (data.players as GameServerStatus['players']) : undefined,
      };
    } catch (err) {
      this.logger.warn(`Serveur de jeu injoignable: ${(err as Error).message}`);
      return offline;
    }
  }
}
