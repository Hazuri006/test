import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators';
import { SessionService, SESSION_COOKIE } from '../../session/session.service';
import type { Request } from 'express';

/**
 * Guard global : chaque endpoint vérifie l'utilisateur connecté,
 * sauf routes explicitement marquées @Public().
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const token = (request.cookies?.[SESSION_COOKIE] as string) ?? '';
    const user = await this.sessions.validate(token);
    if (!user) throw new UnauthorizedException('Session invalide ou expirée');

    // Un compte suspendu reste consultable en lecture mais ne peut plus agir.
    if (user.suspended && request.method !== 'GET' && !request.path.endsWith('/auth/logout')) {
      throw new ForbiddenException('Compte suspendu — action non autorisée');
    }

    request.user = user;
    return true;
  }
}
