import { Controller, Post, Delete, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/decorators';

@ApiTags('Push-уведомления')
@ApiBearerAuth()
@Controller('push')
export class PushController {
  constructor(private prisma: PrismaService) {}

  @Post('subscribe')
  @ApiOperation({ summary: 'Подписка на push-уведомления' })
  async subscribe(
    @CurrentUser() user: any,
    @Body()
    body: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
      deviceInfo?: string;
    },
  ) {
    // Удаляем старую подписку с тем же endpoint
    await this.prisma.pushSubscription.deleteMany({
      where: { endpoint: body.endpoint },
    });

    return this.prisma.pushSubscription.create({
      data: {
        userId: user.id,
        endpoint: body.endpoint,
        keysP256dh: body.keys.p256dh,
        keysAuth: body.keys.auth,
        deviceInfo: body.deviceInfo,
      },
    });
  }

  @Delete('unsubscribe')
  @ApiOperation({ summary: 'Отписка от push-уведомлений' })
  async unsubscribe(
    @CurrentUser() user: any,
    @Body('endpoint') endpoint: string,
  ) {
    await this.prisma.pushSubscription.deleteMany({
      where: { userId: user.id, endpoint },
    });
    return { message: 'Подписка удалена' };
  }
}
