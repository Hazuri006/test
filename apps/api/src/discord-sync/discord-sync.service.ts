import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { env } from '../config/env';
import { RedisService } from '../redis/redis.service';
import { RbacService } from '../rbac/rbac.service';
import { SettingsService } from '../settings/settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { ROLE_NAMES, type RoleName } from '@yurei/shared';

interface RoleMapping {
  discordRoleId: string;
  localRole: RoleName;
}

const CACHE_TTL = 600; // 10 minutes

/**
 * Synchronisation FACULTATIVE des rôles Discord → rôles locaux.
 * Nécessite DISCORD_BOT_TOKEN + DISCORD_GUILD_ID + discord-role-map.json.
 * Les rôles ne sont JAMAIS acceptés depuis le navigateur : la vérification
 * se fait exclusivement ici, côté backend, via l'API bot de Discord.
 */
@Injectable()
export class DiscordSyncService {
  private readonly logger = new Logger(DiscordSyncService.name);
  private mappings: RoleMapping[] = [];

  constructor(
    private readonly redis: RedisService,
    private readonly rbac: RbacService,
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {
    this.loadMappings();
  }

  private loadMappings(): void {
    const file = path.resolve(__dirname, '../../discord-role-map.json');
    try {
      if (fs.existsSync(file)) {
        const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { mappings?: RoleMapping[] };
        this.mappings = (raw.mappings ?? []).filter((m) =>
          ROLE_NAMES.includes(m.localRole) && typeof m.discordRoleId === 'string',
        );
      }
    } catch (err) {
      this.logger.warn(`discord-role-map.json illisible: ${(err as Error).message}`);
    }
  }

  async isEnabled(): Promise<boolean> {
    if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return false;
    const settings = await this.settings.get();
    return settings.roleSyncEnabled;
  }

  /** Retourne les IDs de rôles Discord du membre (avec cache), ou null si non membre. */
  private async fetchMemberRoles(discordId: string): Promise<string[] | null> {
    const cacheKey = `discord:member:${discordId}`;
    const cached = await this.redis.getJson<{ roles: string[] | null }>(cacheKey);
    if (cached) return cached.roles;

    const res = await fetch(
      `https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${discordId}`,
      { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } },
    );

    if (res.status === 404) {
      await this.redis.setJson(cacheKey, { roles: null }, CACHE_TTL);
      return null;
    }
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after') ?? '5');
      this.logger.warn(`Rate limit Discord — retry après ${retryAfter}s`);
      return null; // on réessaiera à la prochaine connexion
    }
    if (!res.ok) {
      this.logger.warn(`API Discord: HTTP ${res.status} lors de la lecture du membre`);
      return null;
    }
    const member = (await res.json()) as { roles: string[] };
    await this.redis.setJson(cacheKey, { roles: member.roles }, CACHE_TTL);
    return member.roles;
  }

  /**
   * Applique le rôle local le plus élevé correspondant aux rôles Discord.
   * Ne rétrograde jamais un OWNER et n'élève jamais au-dessus d'ADMIN.
   */
  async syncUserRoles(userId: string, discordId: string): Promise<void> {
    try {
      if (!(await this.isEnabled()) || this.mappings.length === 0) return;

      const discordRoles = await this.fetchMemberRoles(discordId);
      await this.prisma.discordAccount.updateMany({
        where: { userId },
        data: { guildMember: discordRoles !== null, lastSyncAt: new Date() },
      });
      if (discordRoles === null) return;

      const matched = this.mappings
        .filter((m) => discordRoles.includes(m.discordRoleId))
        .map((m) => m.localRole)
        .filter((r) => r !== 'OWNER'); // OWNER ne se donne jamais via Discord
      if (matched.length === 0) return;

      const current = await this.rbac.getHighestRole(userId);
      if (current === 'OWNER') return;

      const best = matched.sort((a, b) => this.rbac.rolePriority(b) - this.rbac.rolePriority(a))[0];
      if (this.rbac.rolePriority(best) > this.rbac.rolePriority(current)) {
        await this.rbac.setPrimaryRole(userId, best);
        this.logger.log(`Rôle ${best} appliqué à ${userId} via la synchronisation Discord`);
      }
    } catch (err) {
      // La synchronisation ne doit jamais bloquer la connexion.
      this.logger.warn(`Synchronisation Discord échouée: ${(err as Error).message}`);
    }
  }
}
