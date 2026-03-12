import { Module } from '@nestjs/common';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { SupportCron } from './support.cron' from './support.service';

@Module({
  controllers: [SupportController],
  providers: [SupportService, SupportCron],
})
export class SupportModule {}
