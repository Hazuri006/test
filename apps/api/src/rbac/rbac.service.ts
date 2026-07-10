import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ROLE_PRIORITIES, type RoleName } from '@yurei/shared';
import type { Role } from '@prisma/client';

const PERMS_CACHE_TTL = 60; // secondes

@Injectable()
export class RbacService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Union des permissions de tous les rôles de l'utilisateur (avec cache Redis). */
  async getUserPermissions(userId: string): Promise<string[]> {
    const cacheKey = `perms:${userId}`;
    const cached = await this.redis.getJson<string[]>(cacheKey);
    if (cached) return cached;

    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    const permissions = [
      ...new Set(userRoles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.key))),
    ];
    await this.redis.setJson(cacheKey, permissions, PERMS_CACHE_TTL);
    return permissions;
  }

  async invalidateUser(userId: string): Promise<void> {
    await this.redis.client.del(`perms:${userId}`);
  }

  highestRoleName(roles: Pick<Role, 'name' | 'priority'>[]): RoleName {
    if (roles.length === 0) return 'MEMBER';
    const sorted = [...roles].sort((a, b) => b.priority - a.priority);
    return (sorted[0].name as RoleName) ?? 'MEMBER';
  }

  async getHighestRole(userId: string): Promise<RoleName> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });
    return this.highestRoleName(userRoles.map((ur) => ur.role));
  }

  rolePriority(name: RoleName): number {
    return ROLE_PRIORITIES[name] ?? 0;
  }

  /**
   * Remplace le rôle "principal" de l'utilisateur. Les rôles système sont
   * exclusifs : un utilisateur a exactement un rôle parmi MEMBER..OWNER.
   */
  async setPrimaryRole(userId: string, roleName: RoleName, assignedById?: string): Promise<void> {
    const role = await this.prisma.role.findUnique({ where: { name: roleName } });
    if (!role) throw new Error(`Rôle inconnu: ${roleName}`);
    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId, role: { isSystem: true } } }),
      this.prisma.userRole.create({ data: { userId, roleId: role.id, assignedById } }),
    ]);
    await this.invalidateUser(userId);
  }

  async ensureRole(userId: string, roleName: RoleName): Promise<void> {
    const role = await this.prisma.role.findUnique({ where: { name: roleName } });
    if (!role) return;
    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      create: { userId, roleId: role.id },
      update: {},
    });
    await this.invalidateUser(userId);
  }
}
