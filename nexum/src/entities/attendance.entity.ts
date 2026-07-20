import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AttendanceStatus =
  | 'present'
  | 'absent'
  | 'late'
  | 'leave'
  | 'holiday';

@Entity('attendances')
export class Attendance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  companyId: number;

  @Column({ type: 'uuid' })
  employeeId: string;

  @Column({ type: 'varchar', length: 150 })
  employeeName: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'time', nullable: true })
  checkIn: string | null;

  @Column({ type: 'time', nullable: true })
  checkOut: string | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  hoursWorked: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  overtimeHours: number;

  @Column({ type: 'varchar', length: 20, default: 'present' })
  status: AttendanceStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
