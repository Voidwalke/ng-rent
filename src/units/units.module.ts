import { Module } from '@nestjs/common';
import { UnitsController } from './units.controller';
import { CatalogController } from './catalog.controller';
import { UnitsService } from './units.service';

@Module({
  controllers: [UnitsController, CatalogController],
  providers: [UnitsService],
  exports: [UnitsService],
})
export class UnitsModule {}
