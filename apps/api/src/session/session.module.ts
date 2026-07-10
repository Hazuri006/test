import { Global, Module } from '@nestjs/common';
import { SessionService } from './session.service';
import { RbacModule } from '../rbac/rbac.module';

@Global()
@Module({
  imports: [RbacModule],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
