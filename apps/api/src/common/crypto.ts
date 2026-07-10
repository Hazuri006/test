import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { env } from '../config/env';

const key = createHash('sha256').update(env.APP_ENCRYPTION_KEY).digest();

/** Chiffre une chaîne sensible (AES-256-GCM). Format: base64(iv).base64(tag).base64(data) */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${data.toString('base64')}`;
}

export function decryptSecret(encrypted: string): string | null {
  try {
    const [iv, tag, data] = encrypted.split('.');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export function randomToken(bytes = 48): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(`${token}${env.SESSION_SECRET}`).digest('hex');
}

export function randomFileName(ext: string): string {
  return `${Date.now().toString(36)}-${randomBytes(16).toString('hex')}.${ext}`;
}
