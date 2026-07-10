import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { env } from '../config/env';

/**
 * Abstraction de stockage : disque local en développement,
 * S3 (ou compatible : MinIO, R2, Scaleway…) en production.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client | null;
  private readonly uploadDir: string;

  constructor() {
    this.uploadDir = path.resolve(env.UPLOAD_DIR);
    if (env.STORAGE_DRIVER === 's3') {
      this.s3 = new S3Client({
        region: env.S3_REGION || 'us-east-1',
        ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
        credentials: {
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        },
      });
    } else {
      this.s3 = null;
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async save(storedName: string, buffer: Buffer, mimeType: string): Promise<void> {
    if (this.s3) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: storedName,
          Body: buffer,
          ContentType: mimeType,
        }),
      );
      return;
    }
    await fs.promises.writeFile(path.join(this.uploadDir, storedName), buffer);
  }

  async getStream(storedName: string): Promise<Readable> {
    // storedName est validé en amont (nom aléatoire hexadécimal + extension)
    if (this.s3) {
      try {
        const res = await this.s3.send(
          new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: storedName }),
        );
        return res.Body as Readable;
      } catch {
        throw new NotFoundException('Fichier introuvable');
      }
    }
    const filePath = path.join(this.uploadDir, storedName);
    if (!filePath.startsWith(this.uploadDir) || !fs.existsSync(filePath)) {
      throw new NotFoundException('Fichier introuvable');
    }
    return fs.createReadStream(filePath);
  }
}
