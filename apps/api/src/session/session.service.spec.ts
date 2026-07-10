process.env.SESSION_SECRET = 'test-secret-test-secret';
process.env.APP_ENCRYPTION_KEY = 'test-key-test-key';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

import { SessionService } from './session.service';
import { hashSessionToken } from '../common/crypto';
import { createMockPrisma, createMockRedis, type MockPrisma } from '../testing/mocks';

const mockRbac = {
  getUserPermissions: jest.fn().mockResolvedValue(['tickets.create']),
  highestRoleName: jest.fn().mockReturnValue('MEMBER'),
};

const validToken = 'a'.repeat(64);

const activeUser = {
  id: 'user-1',
  discordId: '123',
  username: 'tester',
  displayName: 'Tester',
  avatarUrl: null,
  deletedAt: null,
  bannedAt: null,
  banExpiresAt: null,
  suspendedUntil: null,
  roles: [],
};

describe('SessionService', () => {
  let service: SessionService;
  let prisma: MockPrisma;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrisma();
    service = new SessionService(prisma as never, createMockRedis() as never, mockRbac as never);
    prisma.userPreference.findUnique.mockResolvedValue(null);
  });

  it('rejette un token trop court', async () => {
    expect(await service.validate('short')).toBeNull();
  });

  it('rejette une session expirée', async () => {
    prisma.session.findUnique.mockResolvedValue({
      id: 's1',
      userId: 'user-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
      lastUsedAt: new Date(),
    });
    expect(await service.validate(validToken)).toBeNull();
  });

  it('rejette une session révoquée', async () => {
    prisma.session.findUnique.mockResolvedValue({
      id: 's1',
      userId: 'user-1',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 100000),
      lastUsedAt: new Date(),
    });
    expect(await service.validate(validToken)).toBeNull();
  });

  it('rejette un utilisateur banni', async () => {
    prisma.session.findUnique.mockResolvedValue({
      id: 's1',
      userId: 'user-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 100000),
      lastUsedAt: new Date(),
    });
    prisma.user.findUnique.mockResolvedValue({ ...activeUser, bannedAt: new Date(), banExpiresAt: null });
    expect(await service.validate(validToken)).toBeNull();
  });

  it('retourne le profil authentifié pour une session valide', async () => {
    prisma.session.findUnique.mockResolvedValue({
      id: 's1',
      userId: 'user-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 100000),
      lastUsedAt: new Date(),
    });
    prisma.user.findUnique.mockResolvedValue(activeUser);

    const authUser = await service.validate(validToken);
    expect(authUser).toMatchObject({ id: 'user-1', role: 'MEMBER', permissions: ['tickets.create'] });
  });

  it('recherche la session par hash (jamais le token en clair)', async () => {
    prisma.session.findUnique.mockResolvedValue(null);
    await service.validate(validToken);
    expect(prisma.session.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashSessionToken(validToken) },
    });
  });
});
