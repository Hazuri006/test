import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RbacService } from '../rbac/rbac.service';
import { hashSessionToken, randomToken } from '../common/crypto';
import { env, isProd } from '../config/env';
import type { AuthUser } from '../common/decorators';
import type { Response } from 'express';

export const SESSION_COOKIE = 'yurei_session';
const SESSION_CACHE_TTL = 60; // secondes
const SLIDING_RENEW_AFTER_MS = 6 * 60 * 60 * 1000; // renouvelle après 6h d'usage

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly rbac: RbacService,
  ) {}

  sessionTtlMs(): number {
    return env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
  }

  async createSession(userId: string, ip?: string, userAgent?: string): Promise<string> {
    const token = randomToken();
    await this.prisma.session.create({
      data: {
        tokenHash: hashSessionToken(token),
        userId,
        ip: ip?.slice(0, 64),
        userAgent: userAgent?.slice(0, 255),
        expiresAt: new Date(Date.now() + this.sessionTtlMs()),
      },
    });
    return token;
  }

  setSessionCookie(res: Response, token: string): void {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: this.sessionTtlMs(),
      path: '/',
    });
  }

  clearSessionCookie(res: Response): void {
    res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/' });
  }

  /**
   * Valide un token de session et retourne l'utilisateur authentifié.
   * Renouvellement glissant : l'expiration est repoussée lors d'un usage actif.
   */
  async validate(token: string): Promise<AuthUser | null> {
    if (!token || token.length < 32 || token.length > 128) return null;
    const tokenHash = hashSessionToken(token);

    const session = await this.prisma.session.findUnique({ where: { tokenHash } });
    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) return null;

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
      include: { roles: { include: { role: true } } },
    });
    if (!user || user.deletedAt) return null;

    // Bannissement (définitif ou temporaire non expiré)
    if (user.bannedAt && (!user.banExpiresAt || user.banExpiresAt.getTime() > Date.now())) {
      return null;
    }

    // Renouvellement glissant
    if (Date.now() - session.lastUsedAt.getTime() > SLIDING_RENEW_AFTER_MS) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastUsedAt: new Date(), expiresAt: new Date(Date.now() + this.sessionTtlMs()) },
      });
    }

    const permissions = await this.rbac.getUserPermissions(user.id);
    const role = this.rbac.highestRoleName(user.roles.map((r) => r.role));
    const preference = await this.prisma.userPreference.findUnique({ where: { userId: user.id } });

    return {
      id: user.id,
      discordId: user.discordId,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role,
      permissions,
      locale: preference?.locale ?? 'fr',
      suspended: !!user.suspendedUntil && user.suspendedUntil.getTime() > Date.now(),
      sessionId: session.id,
    };
  }

  async revoke(token: string): Promise<void> {
    const tokenHash = hashSessionToken(token);
    await this.prisma.session.updateMany({ where: { tokenHash }, data: { revokedAt: new Date() } });
    await this.redis.client.del(`sess:${tokenHash}`);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  cacheTtl(): number {
    return SESSION_CACHE_TTL;
  }
}
