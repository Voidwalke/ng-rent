import { Module } from '@nestjs/common';
import { AccessControlController } from './access-control.controller';
import { AccessControlService } from './access-control.service';
import { MockAccessControlProvider } from './access-control.provider';

@Module({
  controllers: [AccessControlController],
  providers: [
    AccessControlService,
    // Переключение через .env: ACCESS_CONTROL_PROVIDER=mock|hikvision|zkteco
    { provide: 'ACCESS_CONTROL_PROVIDER', useClass: MockAccessControlProvider },
  ],
  exports: [AccessControlService, 'ACCESS_CONTROL_PROVIDER'],
})
export class AccessControlModule {}
