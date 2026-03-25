import { Global, Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { QueueWorker } from './queue.worker';
import { ContractsModule } from '../contracts/contracts.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { DocumentsModule } from '../documents/documents.module';

@Global()
@Module({
  imports: [ContractsModule, AccessControlModule, DocumentsModule],
  providers: [QueueService, QueueWorker],
  exports: [QueueService],
})
export class QueueModule {}
