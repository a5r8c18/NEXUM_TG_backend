import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export type MessagePriority = 'low' | 'normal' | 'high' | 'urgent';

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  companyId: number;

  @Column()
  fromUserId: string;

  @Column()
  fromUserName: string;

  @Column()
  toUserId: string;

  @Column()
  toUserName: string;

  @Column()
  subject: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'varchar', default: 'normal' })
  priority: MessagePriority;

  @Column({ default: false })
  isRead: boolean;

  @Column({ default: false })
  isArchived: boolean;

  @Column({ default: false })
  isDeleted: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  sentAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  readAt: Date | null;
}
