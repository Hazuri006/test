import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DiscordService } from './discord.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, DiscordService],
  exports: [AuthService, DiscordService],
})
export class AuthModule {}
