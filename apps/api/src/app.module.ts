import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { RbacModule } from './rbac/rbac.module';
import { AuditModule } from './audit/audit.module';
import { SessionModule } from './session/session.module';
import { AuthModule } from './auth/auth.module';
import { RealtimeModule } from './realtime/realtime.module';
import { UsersModule } from './users/users.module';
import { FriendsModule } from './friends/friends.module';
import { MessagesModule } from './messages/messages.module';
import { UploadsModule } from './uploads/uploads.module';
import { TicketsModule } from './tickets/tickets.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { ServerStatusModule } from './server-status/server-status.module';
import { AdminModule } from './admin/admin.module';
import { SettingsModule } from './settings/settings.module';
import { DiscordSyncModule } from './discord-sync/discord-sync.module';
import { HealthController } from './health.controller';
import { SessionAuthGuard } from './common/guards/session-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { OriginGuard } from './common/guards/origin.guard';

@Module({
  imports: [
    // Rate limiting global par IP (des limites plus strictes par utilisateur
    // sont appliquées dans les services via Redis).
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }] }),
    PrismaModule,
    RedisModule,
    RbacModule,
    AuditModule,
    SettingsModule,
    SessionModule,
    RealtimeModule,
    NotificationsModule,
    DiscordSyncModule,
    AuthModule,
    UsersModule,
    FriendsModule,
    MessagesModule,
    UploadsModule,
    TicketsModule,
    AnnouncementsModule,
    ServerStatusModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
