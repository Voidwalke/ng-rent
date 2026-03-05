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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { DocumentsService } from './documents.service';
import { CurrentUser, Roles } from '../common/decorators';

@ApiTags('Документы')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
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
  getDownloadUrl(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.documentsService.getDownloadUrl(user.tenantId, id);
  }

  @Delete(':id')
  @Roles('admin', 'manager')
  remove(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    return this.documentsService.remove(user.tenantId, id);
  }
}
