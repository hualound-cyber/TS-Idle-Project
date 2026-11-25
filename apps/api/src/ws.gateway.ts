import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class WsGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('chat:send')
  handleChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sender: string; channel: string; message: string },
  ) {
    const msg = String(payload?.message ?? '').trim().slice(0, 300);
    if (!msg) return;
    this.server.emit('chat:message', {
      sender: String(payload?.sender ?? 'แม่ทัพ').slice(0, 40),
      channel: payload?.channel === 'GUILD' ? 'GUILD' : 'WORLD',
      message: msg,
      timestamp: new Date().toISOString(),
    });
  }
}
