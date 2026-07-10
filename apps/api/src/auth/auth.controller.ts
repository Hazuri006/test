import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { DiscordService } from './discord.service';
import { SessionService, SESSION_COOKIE } from '../session/session.service';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Public, CurrentUser, type AuthUser } from '../common/decorators';
import { randomToken } from '../common/crypto';
import { env } from '../config/env';
import type { SessionUser } from '@yurei/shared';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly discord: DiscordService,
    private readonly sessions: SessionService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Démarre le flux OAuth2 Discord avec un `state` aléatoire anti-CSRF. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('discord')
  async login(@Res() res: Response): Promise<void> {
    if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET) {
      res.redirect(`${env.WEB_URL}/login?error=not_configured`);
      return;
    }
    const state = randomToken(24);
    await this.redis.client.set(`oauth:state:${state}`, '1', 'EX', 600);
    res.redirect(this.discord.buildAuthorizeUrl(state));
  }

  /** Retour OAuth : échange du code, création/mise à jour du compte, session. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('discord/callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') oauthError: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const fail = (reason: string): void => res.redirect(`${env.WEB_URL}/login?error=${reason}`);

    if (oauthError) return fail('discord_denied');
    if (!code || !state) return fail('invalid_request');

    // Validation stricte du state (usage unique)
    const known = await this.redis.client.getdel(`oauth:state:${state}`);
    if (!known) return fail('invalid_state');

    try {
      const tokens = await this.discord.exchangeCode(code);
      const profile = await this.discord.fetchProfile(tokens.access_token);
      const user = await this.auth.upsertFromDiscord(profile, tokens);

      if (this.auth.isBanned(user)) {
        await this.audit.log({ actorId: user.id, action: 'auth.login_banned_attempt', ip: req.ip });
        return fail('banned');
      }

      const token = await this.sessions.createSession(user.id, req.ip, req.headers['user-agent']);
      this.sessions.setSessionCookie(res, token);
      await this.audit.log({ actorId: user.id, action: 'auth.login', ip: req.ip });
      res.redirect(`${env.WEB_URL}/dashboard`);
    } catch {
      return fail('discord_error');
    }
  }

  /** Déconnexion réelle : révocation serveur + suppression du cookie. */
  @Post('logout')
  async logout(@Req() req: Request, @Res() res: Response): Promise<void> {
    const token = (req.cookies?.[SESSION_COOKIE] as string) ?? '';
    if (token) await this.sessions.revoke(token);
    this.sessions.clearSessionCookie(res);
    res.json({ ok: true });
  }

  /** Profil de la session courante (utilisé par le frontend au chargement). */
  @Get('me')
  async me(@CurrentUser() user: AuthUser): Promise<SessionUser> {
    const full = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { preference: true },
    });
    if (!full) throw new BadRequestException('Utilisateur introuvable');
    const pref = full.preference;
    return {
      id: full.id,
      discordId: full.discordId,
      username: full.username,
      displayName: full.displayName,
      avatarUrl: full.avatarUrl,
      bannerUrl: full.bannerUrl,
      bio: full.bio,
      customStatus: full.customStatus,
      role: user.role as SessionUser['role'],
      locale: pref?.locale ?? 'fr',
      createdAt: full.createdAt.toISOString(),
      lastLoginAt: full.lastLoginAt?.toISOString() ?? null,
      permissions: user.permissions as SessionUser['permissions'],
      preferences: {
        locale: pref?.locale ?? 'fr',
        theme: pref?.theme ?? 'dark',
        notifyFriendRequests: pref?.notifyFriendRequests ?? true,
        notifyMessages: pref?.notifyMessages ?? true,
        notifyTickets: pref?.notifyTickets ?? true,
        notifyAnnouncements: pref?.notifyAnnouncements ?? true,
        showActivity: pref?.showActivity ?? true,
        showLastSeen: pref?.showLastSeen ?? true,
        allowFriendRequests: pref?.allowFriendRequests ?? true,
        allowDms: pref?.allowDms ?? true,
        reducedMotion: pref?.reducedMotion ?? false,
      },
    };
  }
}
