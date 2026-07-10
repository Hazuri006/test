import { Injectable } from '@nestjs/common';
import type { GameServerAdapter } from './adapter.interface';
import type { GameServerStatus } from '@yurei/shared';

/**
 * ⚠ ADAPTATEUR DE DÉMONSTRATION — données fictives de développement.
 * Produit des valeurs pseudo-aléatoires mais stables dans le temps pour
 * pouvoir travailler sur l'interface sans serveur de jeu réel.
 */
@Injectable()
export class DemoGameServerAdapter implements GameServerAdapter {
  readonly source = 'demo' as const;
  readonly demo = true;
  private readonly bootedAt = Date.now() - 3600 * 6 * 1000;

  async fetchStatus(): Promise<Omit<GameServerStatus, 'source' | 'demo' | 'recordedAt'>> {
    // Courbe de fréquentation « journalière » plausible
    const hour = new Date().getHours() + new Date().getMinutes() / 60;
    const base = 12 + 20 * Math.exp(-((hour - 21) ** 2) / 18) + 10 * Math.exp(-((hour - 15) ** 2) / 10);
    const jitter = Math.sin(Date.now() / 120000) * 3;
    const playerCount = Math.max(0, Math.round(base + jitter));

    return {
      online: true,
      playerCount,
      maxPlayers: 64,
      mapName: 'Yurei City',
      uptimeSeconds: Math.floor((Date.now() - this.bootedAt) / 1000),
      version: '1.4.2-demo',
      latencyMs: 18 + Math.round(Math.abs(Math.sin(Date.now() / 60000)) * 14),
      maintenance: false,
      players: Array.from({ length: Math.min(playerCount, 10) }, (_, i) => ({
        name: `Joueur_${i + 1}`,
        playTimeMinutes: 15 + i * 12,
      })),
    };
  }
}
