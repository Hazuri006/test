process.env.SESSION_SECRET = 'test-secret-test-secret';
process.env.APP_ENCRYPTION_KEY = 'test-key-test-key';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import {
  createMockAudit,
  createMockNotifications,
  createMockPrisma,
  createMockRealtime,
  testUser,
  type MockPrisma,
} from '../testing/mocks';

const mockUploads = { claim: jest.fn().mockResolvedValue([]), fileUrl: (n: string) => `http://api/files/${n}` };

const baseTicket = {
  id: 't1',
  number: 1,
  title: 'Test',
  category: 'BUG',
  priority: 'MEDIUM',
  status: 'OPEN',
  creatorId: 'user-1',
  assigneeId: null,
  deletedAt: null,
  closedAt: null,
  lastMessageAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('TicketsService', () => {
  let service: TicketsService;
  let prisma: MockPrisma;

  const member = testUser();
  const staff = testUser({
    id: 'staff-1',
    role: 'SUPPORT',
    permissions: ['tickets.view_all', 'tickets.claim', 'tickets.close', 'tickets.view_own'],
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrisma();
    service = new TicketsService(
      prisma as never,
      createMockNotifications() as never,
      createMockRealtime() as never,
      mockUploads as never,
      createMockAudit() as never,
    );
    // getDetail est appelé en fin d'action : renvoyer un ticket complet
    prisma.ticket.findUnique.mockResolvedValue({
      ...baseTicket,
      creator: { id: 'user-1', username: 'u', displayName: 'U', avatarUrl: null, customStatus: null, roles: [] },
      assignee: null,
      participants: [],
      messages: [],
    });
  });

  describe('accès', () => {
    it('refuse un ticket aux non-participants sans tickets.view_all', async () => {
      prisma.ticket.findFirst.mockResolvedValue({ ...baseTicket, creatorId: 'other' });
      prisma.ticketParticipant.findUnique.mockResolvedValue(null);
      await expect(service.getDetail(member as never, 't1')).rejects.toThrow(ForbiddenException);
    });

    it('autorise le staff avec tickets.view_all', async () => {
      prisma.ticket.findFirst.mockResolvedValue({ ...baseTicket, creatorId: 'other' });
      await expect(service.getDetail(staff as never, 't1')).resolves.toBeDefined();
    });
  });

  describe('setStatus', () => {
    it('permet au créateur de fermer son propre ticket', async () => {
      prisma.ticket.findFirst.mockResolvedValue({ ...baseTicket });
      prisma.ticket.update.mockResolvedValue({ ...baseTicket, status: 'CLOSED' });
      await service.setStatus(member as never, 't1', 'CLOSED');
      expect(prisma.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'CLOSED' }) }),
      );
    });

    it("interdit à un membre d'archiver", async () => {
      prisma.ticket.findFirst.mockResolvedValue({ ...baseTicket });
      await expect(service.setStatus(member as never, 't1', 'ARCHIVED')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('interdit au staff sans tickets.delete d’archiver', async () => {
      prisma.ticket.findFirst.mockResolvedValue({ ...baseTicket });
      await expect(service.setStatus(staff as never, 't1', 'ARCHIVED')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('claim', () => {
    it('refuse un ticket déjà pris en charge par un autre agent', async () => {
      prisma.ticket.findFirst.mockResolvedValue({ ...baseTicket, assigneeId: 'other-staff' });
      await expect(service.claim(staff as never, 't1')).rejects.toThrow(BadRequestException);
    });

    it('assigne le ticket et journalise', async () => {
      prisma.ticket.findFirst.mockResolvedValue({ ...baseTicket });
      await service.claim(staff as never, 't1');
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('addMessage', () => {
    it('refuse un message vide sans pièce jointe', async () => {
      prisma.ticket.findFirst.mockResolvedValue({ ...baseTicket });
      await expect(
        service.addMessage(member as never, 't1', { content: '   ', attachments: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('interdit au membre d’écrire dans un ticket fermé', async () => {
      prisma.ticket.findFirst.mockResolvedValue({ ...baseTicket, status: 'CLOSED' });
      await expect(
        service.addMessage(member as never, 't1', { content: 'hello', attachments: [] }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
