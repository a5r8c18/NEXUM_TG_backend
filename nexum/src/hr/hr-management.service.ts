import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeContract } from '../entities/employee-contract.entity';
import { Attendance } from '../entities/attendance.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import { JobPosition } from '../entities/job-position.entity';
import { PayrollItem } from '../entities/payroll-item.entity';
import { HrReportService } from './hr-report.service';
import { overlapWorkingDays, round2 } from './payroll-calculations';

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
    @InjectRepository(JobPosition)
    private readonly positionRepo: Repository<JobPosition>,
    @InjectRepository(PayrollItem)
    private readonly payrollItemRepo: Repository<PayrollItem>,
    private readonly hrReportService: HrReportService,
  ) {}

  // ── Contratos ──

  async findAllContracts(
    companyId: number,
    filters?: { employeeId?: string; status?: string; positionId?: string },
  ) {
    const qb = this.contractRepo
      .createQueryBuilder('c')
      .where('c.companyId = :companyId', { companyId });
    if (filters?.employeeId)
      qb.andWhere('c.employeeId = :employeeId', { employeeId: filters.employeeId });
    if (filters?.status)
      qb.andWhere('c.status = :status', { status: filters.status });
    if (filters?.positionId)
      qb.andWhere('c.positionId = :positionId', { positionId: filters.positionId });
    qb.orderBy('c.startDate', 'DESC');
    return qb.getMany();
  }

  async createContract(companyId: number, data: Partial<EmployeeContract>) {
    const sanitized = this.sanitizeContractDates(data);
    const resolved = await this.resolveContractPosition(companyId, data);
    const contract = this.contractRepo.create({ ...sanitized, ...resolved, companyId });
    return this.contractRepo.save(contract);
  }

  async updateContract(companyId: number, id: string, data: Partial<EmployeeContract>) {
    const contract = await this.contractRepo.findOneBy({ id, companyId });
    if (!contract) throw new NotFoundException(`Contrato #${id} no encontrado`);
    Object.assign(contract, this.sanitizeContractDates(data), await this.resolveContractPosition(companyId, data));
    return this.contractRepo.save(contract);
  }

  private sanitizeContractDates(
    data: Partial<EmployeeContract>,
  ): Partial<EmployeeContract> {
    const result = { ...data };
    if ((result.startDate as any) === '' || result.startDate == null) {
      result.startDate = undefined;
    }
    if ((result.endDate as any) === '' || result.endDate == null) {
      result.endDate = null;
    }
    return result;
  }

  private async resolveContractPosition(
    companyId: number,
    data: Partial<EmployeeContract>,
  ): Promise<Partial<EmployeeContract>> {
    if (data.positionId === undefined) return {};
    if (!data.positionId) return { positionId: null };

    const position = await this.positionRepo.findOneBy({
      id: data.positionId,
      companyId,
    });
    if (!position) {
      throw new NotFoundException(`Cargo ${data.positionId} no encontrado`);
    }
    return { positionId: position.id, position: position.name };
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

  /**
   * Un trabajador solo tiene un parte de asistencia por día (UQ en BD):
   * un duplicado sumaría dos veces sus horas extra en la nómina.
   */
  private async ensureAttendanceUnique(
    companyId: number,
    employeeId: string,
    date: string,
    excludeId?: string,
  ) {
    const existing = await this.attendanceRepo.findOneBy({
      companyId,
      employeeId,
      date,
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(
        `Ya existe un parte de asistencia del trabajador para el ${date}`,
      );
    }
  }

  async createAttendance(companyId: number, data: Partial<Attendance>) {
    if (data.employeeId && data.date) {
      await this.ensureAttendanceUnique(companyId, data.employeeId, data.date);
    }
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
    const employeeId = data.employeeId ?? attendance.employeeId;
    const date = data.date ?? attendance.date;
    if (employeeId !== attendance.employeeId || date !== attendance.date) {
      await this.ensureAttendanceUnique(companyId, employeeId, date, id);
    }
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

  /**
   * Comprueba que el trabajador tenga acumulado en el submayor lo que va a
   * disfrutar (Art. 102 Ley 116). No exige el año completo: puede salir por
   * cualquiera de los períodos del Art. 105 —30, 20, 15, 10 o 7 días— siempre
   * que los tenga devengados.
   *
   * La comparación es en días laborables porque es la unidad en que se devenga
   * la provisión y en que la nómina de vacaciones la consume.
   */
  private async assertVacationBalance(
    companyId: number,
    leave: LeaveRequest,
    advanceAuthorized: boolean,
  ): Promise<void> {
    const requestedDays = overlapWorkingDays(
      leave.startDate,
      leave.endDate,
      leave.startDate,
      leave.endDate,
    );
    if (requestedDays <= 0) return;

    // Saldo al mes en que comienza el disfrute: incluye lo devengado por las
    // nóminas contabilizadas hasta ese período.
    const balances = await this.hrReportService.vacationBalances(
      companyId,
      leave.startDate.slice(0, 7),
    );
    const accruedDays = round2(balances.get(leave.employeeId)?.days || 0);
    if (requestedDays <= accruedDays) return;

    if (advanceAuthorized) return;
    throw new ConflictException(
      `${leave.employeeName} no tiene vacaciones suficientes acumuladas: ` +
        `solicita ${requestedDays} día(s) laborable(s) y tiene ${accruedDays} ` +
        'devengado(s). Puede aprobarla como adelanto de vacaciones si procede.',
    );
  }

  async setLeaveStatus(
    companyId: number,
    id: string,
    status: 'approved' | 'rejected' | 'cancelled',
    approvedBy?: string,
    advanceAuthorized?: boolean,
  ) {
    const leave = await this.leaveRepo.findOneBy({ id, companyId });
    if (!leave) throw new NotFoundException(`Solicitud #${id} no encontrada`);
    if (status === 'approved' && leave.type === 'vacation') {
      await this.assertVacationBalance(
        companyId,
        leave,
        !!advanceAuthorized,
      );
      leave.advanceAuthorized = !!advanceAuthorized;
    }
    leave.status = status;
    if (status === 'approved') {
      leave.approvedBy = approvedBy || 'Sistema';
      leave.approvedAt = new Date().toISOString().split('T')[0];
    }
    return this.leaveRepo.save(leave);
  }

  /**
   * Una licencia ya retribuida no puede borrarse: las líneas de nómina que la
   * liquidaron la referencian por `leave_request_id` y son la única fuente que
   * reconstruye los sub-rangos ya pagados. Sin ella, la misma licencia podría
   * volver a liquidarse en otro período. Para rehacerla hay que anular primero
   * la nómina, que restituye las unidades liquidadas.
   */
  async deleteLeave(companyId: number, id: string) {
    const leave = await this.leaveRepo.findOneBy({ id, companyId });
    if (!leave) throw new NotFoundException(`Solicitud #${id} no encontrada`);
    const settledLines = await this.payrollItemRepo.count({
      where: { companyId, leaveRequestId: id },
    });
    if (settledLines > 0 || Number(leave.settledUnits || 0) > 0) {
      throw new ConflictException(
        `La licencia de ${leave.employeeName} ya fue retribuida en nómina y no ` +
          'puede eliminarse: se perdería el control de doble pago. Anule la ' +
          'nómina que la liquidó si necesita rehacerla.',
      );
    }
    await this.leaveRepo.remove(leave);
    return { message: 'Solicitud eliminada' };
  }
}
