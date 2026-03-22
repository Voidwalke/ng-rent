import { Controller, Post, Delete, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/decorators';
import { PushSubscribeDto } from './dto/push-subscribe.dto';

@ApiTags('Push-уведомления')
@ApiBearerAuth()
@Controller('push')
export class PushController {
  constructor(private prisma: PrismaService) {}

  @Post('subscribe')
  @ApiOperation({ summary: 'Подписка на push-уведомления' })
  async subscribe(@CurrentUser() user: any, @Body() dto: PushSubscribeDto) {
    await this.prisma.pushSubscription.deleteMany({
      where: { endpoint: dto.endpoint },
    });

    return this.prisma.pushSubscription.create({
      data: {
        userId: user.id,
        endpoint: dto.endpoint,
        keysP256dh: dto.keys.p256dh,
        keysAuth: dto.keys.auth,
        deviceInfo: dto.deviceInfo,
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
