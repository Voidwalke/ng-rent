import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  ParseIntPipe,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiOperation,
} from '@nestjs/swagger';
import { DocumentsService } from './documents.service';
import { CurrentUser, Roles } from '../common/decorators';
import { UserRole } from '@prisma/client';

@ApiTags('Документы')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @ApiOperation({ summary: 'Загрузить документ' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        entityType: { type: 'string' },
        entityId: { type: 'number' },
        category: { type: 'string' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  upload(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
    @Body('entityType') entityType: string,
    @Body('entityId', ParseIntPipe) entityId: number,
    @Body('category') category?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Файл обязателен');
    }
    const allowedEntityTypes = [
      'contract',
      'property',
      'unit',
      'client',
      'application',
    ];
    if (!entityType || !allowedEntityTypes.includes(entityType)) {
      throw new BadRequestException(
        `entityType должен быть одним из: ${allowedEntityTypes.join(', ')}`,
      );
    }
    return this.documentsService.upload(
      user.tenantId,
      user.id,
      file,
      entityType,
      entityId,
      category,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Список документов' })
  findAll(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
  ) {
    return this.documentsService.findAll(
      user.tenantId,
      page ? +page : 1,
      limit ? +limit : 20,
      category,
    );
  }

  @Get('entity/:entityType/:entityId')
  @ApiOperation({ summary: 'Документы по сущности' })
  findByEntity(
    @CurrentUser() user: any,
    @Param('entityType') entityType: string,
    @Param('entityId', ParseIntPipe) entityId: number,
  ) {
    return this.documentsService.findByEntity(
      user.tenantId,
      entityType,
      entityId,
    );
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Получить ссылку на скачивание' })
  getDownloadUrl(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.documentsService.getDownloadUrl(user.tenantId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить документ' })
  @Roles(UserRole.admin, UserRole.manager)
  remove(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    return this.documentsService.remove(user.tenantId, id);
  }
}
