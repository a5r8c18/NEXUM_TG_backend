import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../entities/user.entity';

@Entity('refresh_tokens')
@Index('IDX_refresh_tokens_user_id', ['userId'])
@Index('IDX_refresh_tokens_token_hash', ['tokenHash'])
@Index('IDX_refresh_tokens_expires_at', ['expiresAt'])
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'token_hash', length: 255, unique: true })
  tokenHash: string;

  @Column({ name: 'expires_at' })
  expiresAt: Date;

  @Column({ name: 'is_revoked', default: false })
  isRevoked: boolean;

  @Column({
    name: 'revoked_at',
    nullable: true,
    type: 'timestamp',
  })
  revokedAt: Date | null;

  @Column({
    name: 'ip_address',
    length: 45,
    nullable: true,
    type: 'varchar',
  })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
