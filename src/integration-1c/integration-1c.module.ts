import { Module } from '@nestjs/common';
import { Integration1CController } from './integration-1c.controller';
import { Integration1CService } from './integration-1c.service';
import { Integration1CProvider } from './integration-1c.provider';

@Module({
  controllers: [Integration1CController],
  providers: [Integration1CService, Integration1CProvider],
  exports: [Integration1CService, Integration1CProvider],
})
export class Integration1CModule {}
