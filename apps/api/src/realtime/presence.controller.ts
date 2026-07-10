import { Controller, Get } from '@nestjs/common';
import { PresenceService } from './presence.service';
import type { PresenceEntry } from '@yurei/shared';

@Controller('presence')
export class PresenceController {
  constructor(private readonly presence: PresenceService) {}

  @Get('online')
  async online(): Promise<PresenceEntry[]> {
    return this.presence.getOnlineList();
  }
}
