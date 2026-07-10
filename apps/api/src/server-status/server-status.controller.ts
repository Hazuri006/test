import { Controller, Get, Query } from '@nestjs/common';
import { ServerStatusService } from './server-status.service';
import type { GameServerStatus, ServerStatusHistoryPoint } from '@yurei/shared';

@Controller('server')
export class ServerStatusController {
  constructor(private readonly serverStatus: ServerStatusService) {}

  @Get('status')
  async status(): Promise<GameServerStatus> {
    return this.serverStatus.getStatus();
  }

  @Get('status/history')
  async history(@Query('hours') hours?: string): Promise<ServerStatusHistoryPoint[]> {
    const parsed = Math.min(Math.max(Number(hours ?? 24) || 24, 1), 168);
    return this.serverStatus.getHistory(parsed);
  }
}
