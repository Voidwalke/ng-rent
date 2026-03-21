import { Global, Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { QueueWorker } from './queue.worker';
import { ContractsModule } from '../contracts/contracts.module';
import { AccessControlModule } from '../access-control/access-control.module';

@Global()
@Module({
  imports: [ContractsModule, AccessControlModule],
  providers: [QueueService, QueueWorker],
  exports: [QueueService],
})
export class QueueModule {}
