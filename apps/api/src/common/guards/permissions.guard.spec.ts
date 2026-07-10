process.env.SESSION_SECRET = 'test-secret-test-secret';
process.env.APP_ENCRYPTION_KEY = 'test-key-test-key';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { testUser } from '../../testing/mocks';
import type { ExecutionContext } from '@nestjs/common';

function contextWith(user: unknown): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  const reflector = new Reflector();
  const guard = new PermissionsGuard(reflector);

  it('laisse passer sans permissions requises', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(contextWith(testUser()))).toBe(true);
  });

  it('autorise un utilisateur ayant la permission', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['tickets.create']);
    expect(guard.canActivate(contextWith(testUser()))).toBe(true);
  });

  it('bloque un utilisateur sans la permission', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin.access']);
    expect(() => guard.canActivate(contextWith(testUser()))).toThrow(ForbiddenException);
  });

  it('bloque une requête sans utilisateur', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['tickets.create']);
    expect(guard.canActivate(contextWith(undefined))).toBe(false);
  });
});
