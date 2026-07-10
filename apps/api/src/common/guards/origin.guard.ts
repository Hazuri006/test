import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { env } from '../../config/env';
import type { Request } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Protection CSRF : les requêtes mutatives doivent provenir du frontend
 * autorisé (vérification de l'en-tête Origin/Referer, l'API étant consommée
 * en cross-origin avec cookies SameSite=Lax).
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowed = new Set([env.WEB_URL.replace(/\/$/, ''), env.API_URL.replace(/\/$/, '')]);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;

    const origin = request.headers.origin ?? null;
    if (origin) {
      if (this.allowed.has(origin.replace(/\/$/, ''))) return true;
      throw new ForbiddenException('Origine non autorisée');
    }
    const referer = request.headers.referer;
    if (referer) {
      try {
        const url = new URL(referer);
        if (this.allowed.has(url.origin)) return true;
      } catch {
        /* referer illisible → refus */
      }
      throw new ForbiddenException('Origine non autorisée');
    }
    // Ni Origin ni Referer (clients non-navigateur) : refus des mutations.
    throw new ForbiddenException('Origine manquante');
  }
}
