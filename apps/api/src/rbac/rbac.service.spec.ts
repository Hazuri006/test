process.env.SESSION_SECRET = 'test-secret-test-secret';
process.env.APP_ENCRYPTION_KEY = 'test-key-test-key';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

import { RbacService } from './rbac.service';
import { createMockPrisma, createMockRedis, type MockPrisma } from '../testing/mocks';

describe('RbacService', () => {
  let service: RbacService;
  let prisma: MockPrisma;
  let redis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    prisma = createMockPrisma();
    redis = createMockRedis();
    service = new RbacService(prisma as never, redis as never);
  });

  it("calcule l'union des permissions de tous les rôles", async () => {
    prisma.userRole.findMany.mockResolvedValue([
      {
        role: {
          permissions: [
            { permission: { key: 'tickets.create' } },
            { permission: { key: 'messages.send' } },
          ],
        },
      },
      {
        role: {
          permissions: [
            { permission: { key: 'messages.send' } },
            { permission: { key: 'tickets.view_all' } },
          ],
        },
      },
    ]);

    const permissions = await service.getUserPermissions('user-1');
    expect(permissions.sort()).toEqual(['messages.send', 'tickets.create', 'tickets.view_all']);
  });

  it('utilise le cache Redis au second appel', async () => {
    prisma.userRole.findMany.mockResolvedValue([
      { role: { permissions: [{ permission: { key: 'tickets.create' } }] } },
    ]);
    await service.getUserPermissions('user-1');
    await service.getUserPermissions('user-1');
    expect(prisma.userRole.findMany).toHaveBeenCalledTimes(1);
  });

  it('retourne le rôle le plus prioritaire', () => {
    const role = service.highestRoleName([
      { name: 'MEMBER', priority: 10 },
      { name: 'ADMIN', priority: 40 },
      { name: 'SUPPORT', priority: 20 },
    ] as never);
    expect(role).toBe('ADMIN');
  });

  it('retourne MEMBER sans rôle', () => {
    expect(service.highestRoleName([])).toBe('MEMBER');
  });
});
