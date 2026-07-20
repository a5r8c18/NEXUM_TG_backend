import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeContract } from '../entities/employee-contract.entity';
import { Attendance } from '../entities/attendance.entity';
import { LeaveRequest } from '../entities/leave-request.entity';

function diffDaysInclusive(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  const ms = e.getTime() - s.getTime();
  if (isNaN(ms) || ms < 0) return 0;
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
}

function hoursBetween(checkIn?: string | null, checkOut?: string | null): number {
  if (!checkIn || !checkOut) return 0;
  const [ih, im] = checkIn.split(':').map(Number);
  const [oh, om] = checkOut.split(':').map(Number);
  const mins = oh * 60 + om - (ih * 60 + im);
  if (isNaN(mins) || mins <= 0) return 0;
  return Math.round((mins / 60) * 100) / 100;
}

@Injectable()
export class HrManagementService {
  constructor(
    @InjectRepository(EmployeeContract)
    private readonly contractRepo: Repository<EmployeeContract>,
    @InjectRepository(Attendance)
    private readonly attendanceRepo: Repository<Attendance>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRepo: Repository<LeaveRequest>,
  ) {}

  // ── Contratos ──

  async findAllContracts(
    companyId: number,
    filters?: { employeeId?: string; status?: string },
  ) {
    const qb = this.contractRepo
      .createQueryBuilder('c')
      .where('c.companyId = :companyId', { companyId });
    if (filters?.employeeId)
      qb.andWhere('c.employeeId = :employeeId', { employeeId: filters.employeeId });
    if (filters?.status)
      qb.andWhere('c.status = :status', { status: filters.status });
    qb.orderBy('c.startDate', 'DESC');
    return qb.getMany();
  }

  async createContract(companyId: number, data: Partial<EmployeeContract>) {
    const contract = this.contractRepo.create({ ...data, companyId });
    return this.contractRepo.save(contract);
  }

  async updateContract(companyId: number, id: string, data: Partial<EmployeeContract>) {
    const contract = await this.contractRepo.findOneBy({ id, companyId });
    if (!contract) throw new NotFoundException(`Contrato #${id} no encontrado`);
    Object.assign(contract, data);
    return this.contractRepo.save(contract);
  }

  async deleteContract(companyId: number, id: string) {
    const contract = await this.contractRepo.findOneBy({ id, companyId });
    if (!contract) throw new NotFoundException(`Contrato #${id} no encontrado`);
    await this.contractRepo.remove(contract);
    return { message: 'Contrato eliminado' };
  }

  // ── Asistencia ──

  async findAllAttendance(
    companyId: number,
    filters?: { employeeId?: string; date?: string; from?: string; to?: string; status?: string },
  ) {
    const qb = this.attendanceRepo
      .createQueryBuilder('a')
      .where('a.companyId = :companyId', { companyId });
    if (filters?.employeeId)
      qb.andWhere('a.employeeId = :employeeId', { employeeId: filters.employeeId });
    if (filters?.date) qb.andWhere('a.date = :date', { date: filters.date });
    if (filters?.from) qb.andWhere('a.date >= :from', { from: filters.from });
    if (filters?.to) qb.andWhere('a.date <= :to', { to: filters.to });
    if (filters?.status) qb.andWhere('a.status = :status', { status: filters.status });
    qb.orderBy('a.date', 'DESC');
    return qb.getMany();
  }

  async createAttendance(companyId: number, data: Partial<Attendance>) {
    const hoursWorked =
      data.hoursWorked != null
        ? Number(data.hoursWorked)
        : hoursBetween(data.checkIn, data.checkOut);
    const attendance = this.attendanceRepo.create({
      ...data,
      companyId,
      hoursWorked,
    });
    return this.attendanceRepo.save(attendance);
  }

  async updateAttendance(companyId: number, id: string, data: Partial<Attendance>) {
    const attendance = await this.attendanceRepo.findOneBy({ id, companyId });
    if (!attendance) throw new NotFoundException(`Asistencia #${id} no encontrada`);
    Object.assign(attendance, data);
    if (data.checkIn != null || data.checkOut != null) {
      attendance.hoursWorked = hoursBetween(
        attendance.checkIn,
        attendance.checkOut,
      );
    }
    return this.attendanceRepo.save(attendance);
  }

  async deleteAttendance(companyId: number, id: string) {
    const attendance = await this.attendanceRepo.findOneBy({ id, companyId });
    if (!attendance) throw new NotFoundException(`Asistencia #${id} no encontrada`);
    await this.attendanceRepo.remove(attendance);
    return { message: 'Registro de asistencia eliminado' };
  }

  // ── Vacaciones / Licencias ──

  async findAllLeaves(
    companyId: number,
    filters?: { employeeId?: string; status?: string; type?: string },
  ) {
    const qb = this.leaveRepo
      .createQueryBuilder('l')
      .where('l.companyId = :companyId', { companyId });
    if (filters?.employeeId)
      qb.andWhere('l.employeeId = :employeeId', { employeeId: filters.employeeId });
    if (filters?.status)
      qb.andWhere('l.status = :status', { status: filters.status });
    if (filters?.type) qb.andWhere('l.type = :type', { type: filters.type });
    qb.orderBy('l.startDate', 'DESC');
    return qb.getMany();
  }

  async createLeave(companyId: number, data: Partial<LeaveRequest>) {
    const days =
      data.days && Number(data.days) > 0
        ? Number(data.days)
        : diffDaysInclusive(data.startDate as string, data.endDate as string);
    const leave = this.leaveRepo.create({
      ...data,
      companyId,
      days,
      status: data.status || 'pending',
    });
    return this.leaveRepo.save(leave);
  }

  async updateLeave(companyId: number, id: string, data: Partial<LeaveRequest>) {
    const leave = await this.leaveRepo.findOneBy({ id, companyId });
    if (!leave) throw new NotFoundException(`Solicitud #${id} no encontrada`);
    Object.assign(leave, data);
    if (data.startDate || data.endDate) {
      leave.days = diffDaysInclusive(leave.startDate, leave.endDate);
    }
    return this.leaveRepo.save(leave);
  }

  async setLeaveStatus(
    companyId: number,
    id: string,
    status: 'approved' | 'rejected' | 'cancelled',
    approvedBy?: string,
  ) {
    const leave = await this.leaveRepo.findOneBy({ id, companyId });
    if (!leave) throw new NotFoundException(`Solicitud #${id} no encontrada`);
    leave.status = status;
    if (status === 'approved') {
      leave.approvedBy = approvedBy || 'Sistema';
      leave.approvedAt = new Date().toISOString().split('T')[0];
    }
    return this.leaveRepo.save(leave);
  }

  async deleteLeave(companyId: number, id: string) {
    const leave = await this.leaveRepo.findOneBy({ id, companyId });
    if (!leave) throw new NotFoundException(`Solicitud #${id} no encontrada`);
    await this.leaveRepo.remove(leave);
    return { message: 'Solicitud eliminada' };
  }
}
