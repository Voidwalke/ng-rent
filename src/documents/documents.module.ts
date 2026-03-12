import { Module } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { ClamavService } from '../common/services/clamav.service';
import { DocumentsController } from './documents.controller';

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService, ClamavService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
