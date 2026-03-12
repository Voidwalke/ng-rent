import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SupportCron {
  private readonly logger = new Logger(SupportCron.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Напоминает о неотвеченных тикетах старше 24 часов */
  @Cron('0 8 * * *')
  async staleTicketReminder() {
    const dayAgo = new Date();
    dayAgo.setDate(dayAgo.getDate() - 1);

    const stale = await this.prisma.supportTicket.findMany({
      where: {
        status: 'open',
        updatedAt: { lt: dayAgo },
      },
    });

    for (const ticket of stale) {
      this.logger.warn(
        `Тикет #${ticket.id} без ответа более 24ч: ${ticket.subject}`,
      );
    }

    if (stale.length > 0) this.logger.warn(`Зависших тикетов: ${stale.length}`);
  }
}
