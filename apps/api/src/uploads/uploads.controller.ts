import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import * as multer from 'multer';
import type { Response } from 'express';
import { UploadsService } from './uploads.service';
import { StorageService } from './storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, type AuthUser } from '../common/decorators';
import { IMAGE_MIME_TYPES, type UploadResult } from '@yurei/shared';
import { env } from '../config/env';

const STORED_NAME_RE = /^[a-z0-9]+-[a-f0-9]{32}\.[a-z0-9]{2,5}$/;

@Controller()
export class UploadsController {
  constructor(
    private readonly uploads: UploadsService,
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('uploads')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: { fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024, files: 1 },
    }),
  )
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<UploadResult> {
    if (!file) throw new BadRequestException('Aucun fichier reçu');
    return this.uploads.store(user.id, file);
  }

  /** Sert les pièces jointes aux utilisateurs authentifiés uniquement. */
  @Get('files/:storedName')
  async serve(@Param('storedName') storedName: string, @Res() res: Response): Promise<void> {
    if (!STORED_NAME_RE.test(storedName)) throw new BadRequestException('Nom de fichier invalide');

    // Type MIME : depuis la pièce jointe enregistrée, sinon depuis le cache d'upload
    const [msgAtt, ticketAtt, cachedMime] = await Promise.all([
      this.prisma.messageAttachment.findUnique({ where: { storedName } }),
      this.prisma.ticketAttachment.findUnique({ where: { storedName } }),
      this.uploads.getMimeType(storedName),
    ]);
    const mimeType = msgAtt?.mimeType ?? ticketAtt?.mimeType ?? cachedMime ?? 'application/octet-stream';
    const fileName = msgAtt?.fileName ?? ticketAtt?.fileName ?? storedName;

    const stream = await this.storage.getStream(storedName);
    const isImage = IMAGE_MIME_TYPES.includes(mimeType as never);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `${isImage ? 'inline' : 'attachment'}; filename="${encodeURIComponent(fileName)}"`,
    );
    res.setHeader('Cache-Control', 'private, max-age=3600');
    stream.pipe(res);
  }
}
