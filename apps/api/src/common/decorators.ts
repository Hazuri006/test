import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { PermissionKey } from '@yurei/shared';

export const IS_PUBLIC_KEY = 'isPublic';
/** Route accessible sans session (login OAuth, healthcheck…). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = 'requiredPermissions';
/** Permissions requises — vérifiées côté serveur par PermissionsGuard. */
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export interface AuthUser {
  id: string;
  discordId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  permissions: string[];
  locale: string;
  suspended: boolean;
  sessionId: string;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
