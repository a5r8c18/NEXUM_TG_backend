import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from '../entities/message.entity';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
  ) {}

  async findInbox(companyId: number, userId: string) {
    return this.messageRepo.find({
      where: { companyId, toUserId: userId, isDeleted: false },
      order: { sentAt: 'DESC' },
    });
  }

  async findSent(companyId: number, userId: string) {
    return this.messageRepo.find({
      where: { companyId, fromUserId: userId, isDeleted: false },
      order: { sentAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const msg = await this.messageRepo.findOneBy({ id });
    if (!msg) throw new NotFoundException(`Mensaje #${id} no encontrado`);
    return msg;
  }

  async send(companyId: number, data: {
    fromUserId: string;
    fromUserName: string;
    toUserId: string;
    toUserName: string;
    subject: string;
    body: string;
    priority?: string;
  }) {
    const msg = this.messageRepo.create({
      companyId,
      fromUserId: data.fromUserId,
      fromUserName: data.fromUserName,
      toUserId: data.toUserId,
      toUserName: data.toUserName,
      subject: data.subject,
      body: data.body,
      priority: (data.priority as any) || 'normal',
    });
    return this.messageRepo.save(msg);
  }

  async markAsRead(id: string) {
    const msg = await this.findOne(id);
    msg.isRead = true;
    msg.readAt = new Date();
    return this.messageRepo.save(msg);
  }

  async archive(id: string) {
    const msg = await this.findOne(id);
    msg.isArchived = true;
    return this.messageRepo.save(msg);
  }

  async remove(id: string) {
    const msg = await this.findOne(id);
    msg.isDeleted = true;
    return this.messageRepo.save(msg);
  }

  async getUnreadCount(companyId: number, userId: string) {
    const count = await this.messageRepo.count({
      where: { companyId, toUserId: userId, isRead: false, isDeleted: false },
    });
    return { unreadCount: count };
  }
}
