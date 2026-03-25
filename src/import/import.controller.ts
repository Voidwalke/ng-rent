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
  BadRequestException,
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
import { UserRole } from '@prisma/client';
import { ImportTemplateQueryDto } from './dto/import-template-query.dto';

@ApiTags('Импорт данных')
@ApiBearerAuth()
@Controller('import')
@Roles(UserRole.admin, UserRole.manager)
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Get('template')
  @ApiOperation({ summary: 'Скачать шаблон для импорта' })
  getTemplate(@Query() query: ImportTemplateQueryDto) {
    return this.importService.getTemplate(query.type);
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
