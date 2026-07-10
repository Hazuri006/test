import { Module } from '@nestjs/common';
import { ServerStatusController } from './server-status.controller';
import { ServerStatusService } from './server-status.service';
import { GAME_SERVER_ADAPTER } from './adapters/adapter.interface';
import { DemoGameServerAdapter } from './adapters/demo.adapter';
import { HttpGameServerAdapter } from './adapters/http.adapter';
import { env } from '../config/env';

@Module({
  controllers: [ServerStatusController],
  providers: [
    DemoGameServerAdapter,
    HttpGameServerAdapter,
    {
      provide: GAME_SERVER_ADAPTER,
      useFactory: (demo: DemoGameServerAdapter, http: HttpGameServerAdapter) =>
        env.GAME_SERVER_ADAPTER === 'http' ? http : demo,
      inject: [DemoGameServerAdapter, HttpGameServerAdapter],
    },
    ServerStatusService,
  ],
  exports: [ServerStatusService],
})
export class ServerStatusModule {}
