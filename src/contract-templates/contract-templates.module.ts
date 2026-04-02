import { Module } from '@nestjs/common';
import { ContractTemplatesController } from './contract-templates.controller';
import { ContractTemplatesService } from './contract-templates.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ContractsModule } from '../contracts/contracts.module';

@Module({
  imports: [PrismaModule, ContractsModule],
  controllers: [ContractTemplatesController],
  providers: [ContractTemplatesService],
  exports: [ContractTemplatesService],
})
export class ContractTemplatesModule {}
