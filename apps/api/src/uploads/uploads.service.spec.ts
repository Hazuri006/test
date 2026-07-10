process.env.SESSION_SECRET = 'test-secret-test-secret';
process.env.APP_ENCRYPTION_KEY = 'test-key-test-key';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

import { BadRequestException } from '@nestjs/common';
import { UploadsService } from './uploads.service';
import { createMockRedis } from '../testing/mocks';

const mockStorage = { save: jest.fn().mockResolvedValue(undefined) };

function fakeFile(name: string, mimetype: string, size = 1000): Express.Multer.File {
  return {
    originalname: name,
    mimetype,
    size,
    buffer: Buffer.from('test'),
  } as Express.Multer.File;
}

describe('UploadsService', () => {
  let service: UploadsService;
  let redis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    redis = createMockRedis();
    service = new UploadsService(redis as never, mockStorage as never);
  });

  it('refuse une extension dangereuse', async () => {
    await expect(service.store('user-1', fakeFile('virus.exe', 'application/octet-stream'))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuse un type MIME non autorisé', async () => {
    await expect(service.store('user-1', fakeFile('page.png', 'text/html'))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('accepte une image et génère un nom aléatoire', async () => {
    const result = await service.store('user-1', fakeFile('photo.png', 'image/png'));
    expect(result.token).toBeTruthy();
    expect(result.url).not.toContain('photo.png'); // nom aléatoire, pas le nom d'origine
    expect(mockStorage.save).toHaveBeenCalled();
  });

  it('claim vérifie le propriétaire et consomme le token (usage unique)', async () => {
    const upload = await service.store('user-1', fakeFile('photo.png', 'image/png'));

    await expect(service.claim('other-user', [upload.token])).rejects.toThrow(BadRequestException);

    const claimed = await service.claim('user-1', [upload.token]);
    expect(claimed).toHaveLength(1);

    // Déjà consommé
    await expect(service.claim('user-1', [upload.token])).rejects.toThrow(BadRequestException);
  });
});
