import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { UploadsModule } from '../uploads/uploads.module';
import { FriendsModule } from '../friends/friends.module';

@Module({
  imports: [UploadsModule, FriendsModule],
  controllers: [MessagesController],
  providers: [MessagesService],
})
export class MessagesModule {}
