import { Global, Module } from '@nestjs/common';
import { DiscordSyncService } from './discord-sync.service';

@Global()
@Module({
  providers: [DiscordSyncService],
  exports: [DiscordSyncService],
})
export class DiscordSyncModule {}
