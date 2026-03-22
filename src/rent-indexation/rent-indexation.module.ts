import { Module } from '@nestjs/common';
import { RentIndexationController } from './rent-indexation.controller';
import { RentIndexationService } from './rent-indexation.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RentIndexationController],
  providers: [RentIndexationService],
})
export class RentIndexationModule {}
