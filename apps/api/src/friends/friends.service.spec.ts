process.env.SESSION_SECRET = 'test-secret-test-secret';
process.env.APP_ENCRYPTION_KEY = 'test-key-test-key';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { FriendsService } from './friends.service';
import {
  createMockNotifications,
  createMockPresence,
  createMockPrisma,
  createMockRealtime,
  type MockPrisma,
} from '../testing/mocks';

describe('FriendsService', () => {
  let service: FriendsService;
  let prisma: MockPrisma;
  let notifications: ReturnType<typeof createMockNotifications>;
  let realtime: ReturnType<typeof createMockRealtime>;

  beforeEach(() => {
    prisma = createMockPrisma();
    notifications = createMockNotifications();
    realtime = createMockRealtime();
    service = new FriendsService(
      prisma as never,
      notifications as never,
      realtime as never,
      createMockPresence() as never,
    );
  });

  describe('sendRequest', () => {
    it("refuse de s'ajouter soi-même", async () => {
      await expect(service.sendRequest('user-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('refuse un doublon de demande', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'user-2', preference: null });
      prisma.blockedUser.findFirst.mockResolvedValue(null);
      prisma.friendship.findUnique.mockResolvedValue({ id: 'f1', status: 'PENDING' });
      await expect(service.sendRequest('user-1', 'user-2')).rejects.toThrow(ConflictException);
    });

    it('refuse si la relation est bloquée', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'user-2', preference: null });
      prisma.blockedUser.findFirst.mockResolvedValue({ blockerId: 'user-2', blockedId: 'user-1' });
      await expect(service.sendRequest('user-1', 'user-2')).rejects.toThrow(ForbiddenException);
    });

    it("refuse si la cible n'accepte pas les demandes", async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-2',
        preference: { allowFriendRequests: false },
      });
      prisma.blockedUser.findFirst.mockResolvedValue(null);
      await expect(service.sendRequest('user-1', 'user-2')).rejects.toThrow(ForbiddenException);
    });

    it('crée la demande, notifie et émet en temps réel', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'user-2', preference: null });
      prisma.blockedUser.findFirst.mockResolvedValue(null);
      prisma.friendship.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', displayName: 'Tester' });
      prisma.friendship.create.mockResolvedValue({ id: 'f1' });

      await service.sendRequest('user-1', 'user-2');

      expect(prisma.friendship.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ requesterId: 'user-1', addresseeId: 'user-2', pairKey: 'user-1:user-2' }),
      });
      expect(notifications.notify).toHaveBeenCalledWith(
        'user-2',
        'FRIEND_REQUEST',
        expect.any(String),
        expect.any(String),
        expect.any(String),
      );
      expect(realtime.emitToUsers).toHaveBeenCalled();
    });
  });

  describe('accept', () => {
    it('refuse si le destinataire est un autre utilisateur', async () => {
      prisma.friendship.findUnique.mockResolvedValue({
        id: 'f1',
        status: 'PENDING',
        requesterId: 'user-1',
        addresseeId: 'user-3',
      });
      await expect(service.accept('user-2', 'f1')).rejects.toThrow(ForbiddenException);
    });

    it('passe la demande en ACCEPTED et notifie le demandeur', async () => {
      prisma.friendship.findUnique.mockResolvedValue({
        id: 'f1',
        status: 'PENDING',
        requesterId: 'user-1',
        addresseeId: 'user-2',
      });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-2', displayName: 'B' });

      await service.accept('user-2', 'f1');

      expect(prisma.friendship.update).toHaveBeenCalledWith({
        where: { id: 'f1' },
        data: expect.objectContaining({ status: 'ACCEPTED' }),
      });
      expect(notifications.notify).toHaveBeenCalledWith(
        'user-1',
        'FRIEND_ACCEPTED',
        expect.any(String),
        expect.any(String),
        expect.any(String),
      );
    });
  });

  describe('block', () => {
    it('supprime toute relation existante lors du blocage', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'user-2' });
      await service.block('user-1', 'user-2');
      expect(prisma.friendship.deleteMany).toHaveBeenCalledWith({
        where: { pairKey: 'user-1:user-2' },
      });
      expect(prisma.blockedUser.upsert).toHaveBeenCalled();
    });

    it('refuse de se bloquer soi-même', async () => {
      await expect(service.block('user-1', 'user-1')).rejects.toThrow(BadRequestException);
    });
  });
});
