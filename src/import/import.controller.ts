import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Res,
  UseInterceptors,
  UploadedFile,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
  ApiProduces,
} from '@nestjs/swagger';
import { ImportService } from './import.service';
import { CurrentUser, Roles } from '../common/decorators';
import { UserRole } from '@prisma/client';
import { ImportTemplateQueryDto } from './dto/import-template-query.dto';
import type { Response } from 'express';

@ApiTags('Импорт данных')
@ApiBearerAuth()
@Controller('import')
@Roles(UserRole.admin, UserRole.manager)
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Get('template')
  @ApiOperation({ summary: 'Скачать шаблон для импорта' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  getTemplate(@Query() query: ImportTemplateQueryDto, @Res() res: Response) {
    const { fileName, buffer } = this.importService.getTemplate(query.type);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('jobs')
  @ApiOperation({ summary: 'Список задач импорта' })
  findAll(@CurrentUser() user: any) {
    return this.importService.findAll(user.tenantId);
  }

  @Post('confirm/:id')
  @ApiOperation({ summary: 'Подтвердить импорт' })
  confirm(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    return this.importService.confirmImport(user.tenantId, id);
  }

  @Post(':type')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Загрузить файл для импорта' })
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @CurrentUser() user: any,
    @Param('type') type: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Файл обязателен');
    }
    return this.importService.createJob(user.tenantId, user.id, type, file);
  }
}
