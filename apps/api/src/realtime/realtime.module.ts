import { Global, Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';
import { PresenceService } from './presence.service';
import { PresenceController } from './presence.controller';

@Global()
@Module({
  providers: [RealtimeGateway, RealtimeService, PresenceService],
  controllers: [PresenceController],
  exports: [RealtimeService, PresenceService],
})
export class RealtimeModule {}
