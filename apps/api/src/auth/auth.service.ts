import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DiscordSyncService } from '../discord-sync/discord-sync.service';
import { DiscordService, type DiscordProfile, type DiscordTokens } from './discord.service';
import { encryptSecret } from '../common/crypto';
import { env } from '../config/env';
import type { User } from '@prisma/client';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly discord: DiscordService,
    private readonly rbac: RbacService,
    private readonly notifications: NotificationsService,
    private readonly discordSync: DiscordSyncService,
  ) {}

  /**
   * Première connexion : crée le compte local (rôle MEMBER, préférences par
   * défaut, notification de bienvenue). Connexions suivantes : met à jour le
   * pseudo/avatar Discord et lastLoginAt — jamais de compte en double,
   * l'identifiant Discord est la clé externe unique.
   */
  async upsertFromDiscord(profile: DiscordProfile, tokens: DiscordTokens): Promise<User> {
    const displayName = profile.global_name ?? profile.username;
    const avatarUrl = this.discord.avatarUrl(profile);
    const bannerUrl = this.discord.bannerUrl(profile);
    const email = env.DISCORD_REQUEST_EMAIL ? profile.email ?? null : null;

    const existing = await this.prisma.user.findUnique({ where: { discordId: profile.id } });

    const discordAccountData = {
      username: profile.username,
      globalName: profile.global_name,
      avatarHash: profile.avatar,
      bannerHash: profile.banner,
      email,
      accessToken: encryptSecret(tokens.access_token),
      refreshToken: encryptSecret(tokens.refresh_token),
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    };

    let user: User;
    if (existing) {
      user = await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          username: profile.username,
          displayName,
          avatarUrl,
          bannerUrl,
          email,
          lastLoginAt: new Date(),
          discordAccount: {
            upsert: {
              create: { discordId: profile.id, ...discordAccountData },
              update: discordAccountData,
            },
          },
        },
      });
    } else {
      user = await this.prisma.user.create({
        data: {
          discordId: profile.id,
          username: profile.username,
          displayName,
          avatarUrl,
          bannerUrl,
          email,
          lastLoginAt: new Date(),
          discordAccount: { create: { discordId: profile.id, ...discordAccountData } },
          preference: { create: {} },
        },
      });
      await this.rbac.ensureRole(user.id, 'MEMBER');
      await this.notifications.notify(
        user.id,
        'WELCOME',
        `Bienvenue sur ${env.APP_NAME} !`,
        'Ton compte a été créé. Complète ton profil et découvre le panel.',
        '/profile',
      );
      this.logger.log(`Nouveau compte créé pour ${profile.username} (${profile.id})`);
    }

    // Synchronisation facultative des rôles Discord (ne bloque jamais la connexion)
    void this.discordSync.syncUserRoles(user.id, profile.id);

    return user;
  }

  /** L'utilisateur est-il banni (définitivement ou temporairement) ? */
  isBanned(user: User): boolean {
    return !!user.bannedAt && (!user.banExpiresAt || user.banExpiresAt.getTime() > Date.now());
  }
}
