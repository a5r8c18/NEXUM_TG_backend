import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type LeaveType =
  | 'vacation'
  | 'sick'
  | 'unpaid'
  | 'maternity'
  | 'paternity'
  | 'other';

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

@Entity('leave_requests')
export class LeaveRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  companyId: number;

  @Column({ type: 'uuid' })
  employeeId: string;

  @Column({ type: 'varchar', length: 150 })
  employeeName: string;

  @Column({ type: 'varchar', length: 20, default: 'vacation' })
  type: LeaveType;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  endDate: string;

  @Column({ type: 'integer', default: 0 })
  days: number;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: LeaveStatus;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  approvedBy: string | null;

  @Column({ type: 'date', nullable: true })
  approvedAt: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
