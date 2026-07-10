import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { env } from '../config/env';

export interface AppSettings {
  appName: string;
  maintenanceMode: boolean;
  roleSyncEnabled: boolean;
}

const CACHE_KEY = 'app:settings';
const CACHE_TTL = 30;

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async get(): Promise<AppSettings> {
    const cached = await this.redis.getJson<AppSettings>(CACHE_KEY);
    if (cached) return cached;

    const rows = await this.prisma.appSetting.findMany();
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const settings: AppSettings = {
      appName: (map.get('appName') as string) ?? env.APP_NAME,
      maintenanceMode: (map.get('maintenanceMode') as boolean) ?? false,
      roleSyncEnabled: (map.get('roleSyncEnabled') as boolean) ?? env.DISCORD_ROLE_SYNC_ENABLED,
    };
    await this.redis.setJson(CACHE_KEY, settings, CACHE_TTL);
    return settings;
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
    await this.prisma.$transaction(
      entries.map(([key, value]) =>
        this.prisma.appSetting.upsert({
          where: { key },
          create: { key, value: value as never },
          update: { value: value as never },
        }),
      ),
    );
    await this.redis.client.del(CACHE_KEY);
    return this.get();
  }
}
