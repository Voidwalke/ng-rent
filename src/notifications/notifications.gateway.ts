import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({
  namespace: '/notifications',
  cors: { origin: '*' },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwt.verify(token, {
        secret: this.config.get('JWT_SECRET'),
      });

      const room = `user:${payload.userId}`;
      client.join(room);
      client.data.userId = payload.userId;
      client.data.tenantId = payload.tenantId;

      this.logger.debug(`WS подключён: user ${payload.userId}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    if (client.data?.userId) {
      this.logger.debug(`WS отключён: user ${client.data.userId}`);
    }
  }

  /** Отправляет событие конкретному пользователю */
  sendToUser(userId: number, event: string, payload: any) {
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  /** Отправляет событие всем пользователям тенанта */
  sendToTenant(tenantId: number, event: string, payload: any) {
    const sockets = this.server.sockets;
    sockets.sockets.forEach((socket) => {
      if (socket.data?.tenantId === tenantId) {
        socket.emit(event, payload);
      }
    });
  }
}
