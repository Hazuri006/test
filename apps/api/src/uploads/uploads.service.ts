import { BadRequestException, Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { StorageService } from './storage.service';
import { randomFileName, randomToken } from '../common/crypto';
import { sanitizePlainText } from '../common/sanitize';
import { ALLOWED_FILE_EXTENSIONS, ALLOWED_MIME_TYPES, type UploadResult } from '@yurei/shared';
import { env } from '../config/env';

export interface PendingUpload {
  ownerId: string;
  storedName: string;
  fileName: string;
  mimeType: string;
  size: number;
}

const TOKEN_TTL = 3600; // 1 heure pour attacher le fichier à un message/ticket

@Injectable()
export class UploadsService {
  constructor(
    private readonly redis: RedisService,
    private readonly storage: StorageService,
  ) {}

  fileUrl(storedName: string): string {
    return `${env.API_URL}/api/files/${storedName}`;
  }

  /** Valide et stocke un fichier ; retourne un token à joindre au message. */
  async store(ownerId: string, file: Express.Multer.File): Promise<UploadResult> {
    const ext = (file.originalname.split('.').pop() ?? '').toLowerCase();
    if (!ALLOWED_FILE_EXTENSIONS.includes(ext as never)) {
      throw new BadRequestException(`Extension .${ext} refusée`);
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype as never)) {
      throw new BadRequestException(`Type de fichier ${file.mimetype} refusé`);
    }
    if (file.size > env.MAX_UPLOAD_SIZE_MB * 1024 * 1024) {
      throw new BadRequestException(`Fichier trop volumineux (max ${env.MAX_UPLOAD_SIZE_MB} Mo)`);
    }

    const storedName = randomFileName(ext);
    await this.storage.save(storedName, file.buffer, file.mimetype);

    const token = randomToken(24);
    const pending: PendingUpload = {
      ownerId,
      storedName,
      fileName: sanitizePlainText(file.originalname).slice(0, 120) || `fichier.${ext}`,
      mimeType: file.mimetype,
      size: file.size,
    };
    await this.redis.setJson(`upload:${token}`, pending, TOKEN_TTL);
    await this.redis.setJson(`uploadmeta:${storedName}`, { mimeType: file.mimetype }, TOKEN_TTL);

    return {
      token,
      fileName: pending.fileName,
      mimeType: pending.mimeType,
      size: pending.size,
      url: this.fileUrl(storedName),
    };
  }

  /** Consomme des tokens d'upload (usage unique, propriétaire vérifié). */
  async claim(ownerId: string, tokens: string[]): Promise<PendingUpload[]> {
    const claimed: PendingUpload[] = [];
    for (const token of tokens) {
      const key = `upload:${token}`;
      const pending = await this.redis.getJson<PendingUpload>(key);
      if (!pending || pending.ownerId !== ownerId) {
        throw new BadRequestException('Pièce jointe invalide ou expirée');
      }
      await this.redis.client.del(key);
      claimed.push(pending);
    }
    return claimed;
  }

  async getMimeType(storedName: string): Promise<string | null> {
    const meta = await this.redis.getJson<{ mimeType: string }>(`uploadmeta:${storedName}`);
    return meta?.mimeType ?? null;
  }
}
