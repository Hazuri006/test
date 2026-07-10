import type { GameServerStatus } from '@yurei/shared';

/**
 * Interface d'adaptateur serveur de jeu. Implémentations possibles :
 * API HTTP, WebSocket, base de données, webhook, intégration Nanos World…
 * Voir docs/ARCHITECTURE.md pour brancher un vrai serveur.
 */
export interface GameServerAdapter {
  /** Nom identifiable de la source (affiché dans le panel). */
  readonly source: GameServerStatus['source'];
  /** Données fictives de développement ? */
  readonly demo: boolean;
  fetchStatus(): Promise<Omit<GameServerStatus, 'source' | 'demo' | 'recordedAt'>>;
}

export const GAME_SERVER_ADAPTER = Symbol('GAME_SERVER_ADAPTER');
