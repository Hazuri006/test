import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators';
import { env } from './config/env';

@Controller()
export class HealthController {
  @Public()
  @Get('health')
  health(): { status: string; app: string } {
    return { status: 'ok', app: env.APP_NAME };
  }
}
