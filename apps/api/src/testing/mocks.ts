/** Utilitaires de test : mocks Prisma/Redis légers. */

type MockFn = jest.Mock;

export interface MockModel {
  findUnique: MockFn;
  findFirst: MockFn;
  findMany: MockFn;
  create: MockFn;
  createMany: MockFn;
  update: MockFn;
  updateMany: MockFn;
  upsert: MockFn;
  delete: MockFn;
  deleteMany: MockFn;
  count: MockFn;
  groupBy: MockFn;
}

function mockModel(): MockModel {
  return {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
  };
}

export function createMockPrisma() {
  return {
    user: mockModel(),
    discordAccount: mockModel(),
    session: mockModel(),
    userPreference: mockModel(),
    role: mockModel(),
    permission: mockModel(),
    rolePermission: mockModel(),
    userRole: mockModel(),
    friendship: mockModel(),
    blockedUser: mockModel(),
    conversation: mockModel(),
    conversationMember: mockModel(),
    message: mockModel(),
    messageReaction: mockModel(),
    messageAttachment: mockModel(),
    ticket: mockModel(),
    ticketParticipant: mockModel(),
    ticketMessage: mockModel(),
    ticketAttachment: mockModel(),
    ticketInternalNote: mockModel(),
    notification: mockModel(),
    announcement: mockModel(),
    presence: mockModel(),
    moderationAction: mockModel(),
    report: mockModel(),
    auditLog: mockModel(),
    serverStatus: mockModel(),
    appSetting: mockModel(),
    $transaction: jest.fn(async (arg: unknown): Promise<unknown> => {
      if (Array.isArray(arg)) return Promise.all(arg as Promise<unknown>[]);
      return (arg as (tx: unknown) => unknown)({});
    }),
  };
}

export type MockPrisma = ReturnType<typeof createMockPrisma>;

export function createMockRedis() {
  const store = new Map<string, string>();
  return {
    store,
    client: {
      get: jest.fn(async (key: string) => store.get(key) ?? null),
      set: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
        return 'OK';
      }),
      del: jest.fn(async (...keys: string[]) => keys.map((k) => store.delete(k)).length),
      incr: jest.fn(async (key: string) => {
        const next = Number(store.get(key) ?? '0') + 1;
        store.set(key, String(next));
        return next;
      }),
      expire: jest.fn(async () => 1),
      getdel: jest.fn(async (key: string) => {
        const value = store.get(key) ?? null;
        store.delete(key);
        return value;
      }),
      sismember: jest.fn(async () => 0),
      smembers: jest.fn(async () => []),
      scard: jest.fn(async () => 0),
      hgetall: jest.fn(async () => ({})),
      pipeline: jest.fn(() => ({ hget: jest.fn(), hgetall: jest.fn(), exec: jest.fn(async () => []) })),
    },
    getJson: jest.fn(async (key: string) => {
      const raw = store.get(key);
      return raw ? JSON.parse(raw) : null;
    }),
    setJson: jest.fn(async (key: string, value: unknown) => {
      store.set(key, JSON.stringify(value));
    }),
    isRateLimited: jest.fn(async () => false),
  };
}

export function createMockNotifications() {
  return { notify: jest.fn().mockResolvedValue(undefined) };
}

export function createMockRealtime() {
  return {
    emitToUser: jest.fn(),
    emitToUsers: jest.fn(),
    broadcast: jest.fn(),
    disconnectUser: jest.fn(),
    setServer: jest.fn(),
  };
}

export function createMockPresence() {
  return {
    getStatus: jest.fn().mockResolvedValue('OFFLINE'),
    getStatuses: jest.fn().mockResolvedValue(new Map()),
    isOnline: jest.fn().mockResolvedValue(false),
    onlineCount: jest.fn().mockResolvedValue(0),
    getOnlineList: jest.fn().mockResolvedValue([]),
  };
}

export function createMockAudit() {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

export const testUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-1',
  discordId: '123',
  username: 'tester',
  displayName: 'Tester',
  avatarUrl: null,
  role: 'MEMBER',
  permissions: ['tickets.create', 'tickets.view_own', 'messages.send'],
  locale: 'fr',
  suspended: false,
  sessionId: 'sess-1',
  ...overrides,
});
