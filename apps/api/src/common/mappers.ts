import type { User, Role } from '@prisma/client';
import type { UserSummary } from '@yurei/shared';
import type { RoleName } from '@yurei/shared';

export type UserWithRoles = User & { roles?: { role: Role }[] };

export function highestRole(roles?: { role: Role }[]): RoleName {
  if (!roles || roles.length === 0) return 'MEMBER';
  return (roles.map((r) => r.role).sort((a, b) => b.priority - a.priority)[0]?.name as RoleName) ?? 'MEMBER';
}

export function toUserSummary(user: UserWithRoles): UserSummary {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: highestRole(user.roles),
    customStatus: user.customStatus,
  };
}

export const userSummarySelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  customStatus: true,
  roles: { select: { role: true } },
} as const;

/** Curseur de pagination encodé (id opaque). */
export function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

export function decodeCursor(cursor?: string | null): string | undefined {
  if (!cursor) return undefined;
  try {
    return Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    return undefined;
  }
}
