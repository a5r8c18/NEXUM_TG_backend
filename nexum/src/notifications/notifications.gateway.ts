import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

export interface NotificationPayload {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  timestamp: string;
  targetRole?: string;
  targetUserId?: string;
  targetTenantId?: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/notifications',
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private logger = new Logger('NotificationsGateway');
  private connectedClients = new Map<string, { userId?: string; role?: string; tenantId?: string }>();

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);
    this.connectedClients.set(client.id, {});
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.connectedClients.delete(client.id);
  }

  @SubscribeMessage('register')
  handleRegister(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; role: string; tenantId: string },
  ): void {
    this.connectedClients.set(client.id, {
      userId: data.userId,
      role: data.role,
      tenantId: data.tenantId,
    });
    client.join(`user:${data.userId}`);
    client.join(`role:${data.role}`);
    client.join(`tenant:${data.tenantId}`);
    this.logger.log(`Client ${client.id} registered as user=${data.userId} role=${data.role} tenant=${data.tenantId}`);
  }

  // Enviar notificación a todos los clientes conectados
  broadcastNotification(notification: NotificationPayload): void {
    this.server.emit('notification', notification);
  }

  // Enviar notificación solo a superadmins
  notifySuperadmins(notification: NotificationPayload): void {
    this.server.to('role:superadmin').emit('notification', {
      ...notification,
      targetRole: 'superadmin',
    });
  }

  // Enviar notificación a un tenant específico
  notifyTenant(tenantId: string, notification: NotificationPayload): void {
    this.server.to(`tenant:${tenantId}`).emit('notification', {
      ...notification,
      targetTenantId: tenantId,
    });
  }

  // Enviar notificación a un usuario específico
  notifyUser(userId: string, notification: NotificationPayload): void {
    this.server.to(`user:${userId}`).emit('notification', {
      ...notification,
      targetUserId: userId,
    });
  }

  // Enviar evento de actualización de solicitudes de tenant
  emitTenantRequestUpdate(data: { action: string; email: string; status: string }): void {
    this.server.emit('tenant-request-update', data);
  }

  // Enviar alerta de stock bajo
  emitStockAlert(data: { productName: string; currentStock: number; minStock: number; companyId: number; tenantId: string }): void {
    this.server.to(`tenant:${data.tenantId}`).emit('stock-alert', data);
  }

  // Enviar actualización de factura
  emitInvoiceUpdate(data: { invoiceId: string; status: string; companyId: number; tenantId: string }): void {
    this.server.to(`tenant:${data.tenantId}`).emit('invoice-update', data);
  }
}
