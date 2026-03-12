import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsCron } from './subscriptions.cron' from './subscriptions.service';

@Module({
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, SubscriptionsCron],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
