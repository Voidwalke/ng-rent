import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { InvoicesCron } from './invoices.cron';

@Module({
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoicesCron],
  exports: [InvoicesService],
})
export class InvoicesModule {}
