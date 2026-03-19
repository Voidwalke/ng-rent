import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { MailerModule } from '../mailer/mailer.module';
import { InvoicesService } from './invoices.service';
import { InvoicesCron } from './invoices.cron';

@Module({
  imports: [MailerModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoicesCron],
  exports: [InvoicesService],
})
export class InvoicesModule {}
