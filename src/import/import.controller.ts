import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseInterceptors,
  UploadedFile,
  ParseIntPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
} from '@nestjs/swagger';
import { ImportService } from './import.service';
import { CurrentUser, Roles } from '../common/decorators';

@ApiTags('Импорт данных')
@ApiBearerAuth()
@Controller('import')
@Roles('admin', 'manager')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post(':type')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Загрузить файл для импорта' })
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @CurrentUser() user: any,
    @Param('type') type: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.importService.createJob(user.tenantId, user.id, type, file);
  }

  @Post('confirm/:id')
  @ApiOperation({ summary: 'Подтвердить импорт' })
  confirm(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    return this.importService.confirmImport(user.tenantId, id);
  }

  @Get('template')
  @ApiOperation({ summary: 'Скачать шаблон для импорта' })
  getTemplate(@Query('type') type: string) {
    return this.importService.getTemplate(type);
  }

  @Get('jobs')
  @ApiOperation({ summary: 'Список задач импорта' })
  findAll(@CurrentUser() user: any) {
    return this.importService.findAll(user.tenantId);
  }
}
