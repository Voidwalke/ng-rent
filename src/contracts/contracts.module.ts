import { Module } from '@nestjs/common';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { ContractGeneratorService } from './contract-generator.service';
import { EdoService } from './edo.service';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [DocumentsModule],
  controllers: [ContractsController],
  providers: [ContractsService, ContractGeneratorService, EdoService],
  exports: [ContractsService, ContractGeneratorService, EdoService],
})
export class ContractsModule {}
