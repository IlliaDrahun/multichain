import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  handleConnection(client: Socket) {
    const userAddress = client.handshake.query.userAddress as string;
    if (userAddress) {
      void client.join(userAddress);
      this.logger.log(
        `Client ${client.id} connected and joined room: ${userAddress}`,
      );
    } else {
      this.logger.log(`Client ${client.id} connected without a userAddress.`);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  sendToUser(userAddress: string, event: string, data: unknown) {
    this.server.to(userAddress).emit(event, data);
    this.logger.log(`Sent event ${event} to user (room) ${userAddress}`);
  }
}
