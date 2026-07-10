import { z } from 'zod';
import * as path from 'path';
import * as dotenv from 'dotenv';

// En développement, le .env racine du monorepo est partagé par les deux apps.
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config();

const boolFromString = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().default('Yurei Project'),
  API_PORT: z.coerce.number().default(4000),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:4000'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  SESSION_SECRET: z.string().min(16),
  APP_ENCRYPTION_KEY: z.string().min(16),
  SESSION_TTL_DAYS: z.coerce.number().min(1).max(90).default(7),
  DISCORD_CLIENT_ID: z.string().default(''),
  DISCORD_CLIENT_SECRET: z.string().default(''),
  DISCORD_REDIRECT_URI: z.string().default('http://localhost:4000/api/auth/discord/callback'),
  DISCORD_REQUEST_EMAIL: boolFromString,
  DISCORD_ROLE_SYNC_ENABLED: boolFromString,
  DISCORD_GUILD_ID: z.string().default(''),
  DISCORD_BOT_TOKEN: z.string().default(''),
  DISCORD_TICKET_WEBHOOK_URL: z.string().default(''),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().min(1).max(100).default(10),
  S3_ENDPOINT: z.string().default(''),
  S3_REGION: z.string().default(''),
  S3_BUCKET: z.string().default(''),
  S3_ACCESS_KEY_ID: z.string().default(''),
  S3_SECRET_ACCESS_KEY: z.string().default(''),
  PRESENCE_AWAY_AFTER_MS: z.coerce.number().default(5 * 60 * 1000),
  PRESENCE_OFFLINE_AFTER_MS: z.coerce.number().default(2 * 60 * 1000),
  GAME_SERVER_ADAPTER: z.enum(['demo', 'http']).default('demo'),
  GAME_SERVER_STATUS_URL: z.string().default(''),
  SEED_DEMO: boolFromString,
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Configuration invalide:', parsed.error.flatten().fieldErrors);
  throw new Error('Variables d\'environnement invalides — voir .env.example');
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
