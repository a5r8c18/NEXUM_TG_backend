import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Employee } from '../entities/employee.entity';
import { Department } from '../entities/department.entity';
import { CostCenter } from '../entities/cost-center.entity';
import { JobPosition } from '../entities/job-position.entity';
import { EmployeeSalaryHistory } from '../entities/employee-salary-history.entity';

@Injectable()
export class HrService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(CostCenter)
    private readonly costCenterRepo: Repository<CostCenter>,
    @InjectRepository(JobPosition)
    private readonly positionRepo: Repository<JobPosition>,
    @InjectRepository(EmployeeSalaryHistory)
    private readonly salaryHistoryRepo: Repository<EmployeeSalaryHistory>,
  ) {}

  // ── Employees ──

  async findAllEmployees(companyId: number, filters?: {
    status?: string;
    departmentId?: string;
    positionId?: string;
    search?: string;
    contractType?: string;
  }) {
    const qb = this.employeeRepo.createQueryBuilder('e')
      .where('e.companyId = :companyId', { companyId });

    if (filters?.status) qb.andWhere('e.status = :status', { status: filters.status });
    if (filters?.departmentId) qb.andWhere('e.departmentId = :departmentId', { departmentId: filters.departmentId });
    if (filters?.positionId) qb.andWhere('e.positionId = :positionId', { positionId: filters.positionId });
    if (filters?.contractType) qb.andWhere('e.contractType = :contractType', { contractType: filters.contractType });
    if (filters?.search) {
      qb.andWhere('(e.firstName ILIKE :search OR e.lastName ILIKE :search OR e.employeeCode ILIKE :search)', { search: `%${filters.search}%` });
    }

    qb.orderBy('e.lastName', 'ASC');
    return qb.getMany();
  }

  async findOneEmployee(companyId: number, id: string) {
    const emp = await this.employeeRepo.findOneBy({ id, companyId });
    if (!emp) throw new NotFoundException(`Empleado #${id} no encontrado`);
    return emp;
  }

  async createEmployee(companyId: number, data: Partial<Employee>) {
    const resolved = await this.resolveDepartmentAndCostCenter(companyId, data);
    Object.assign(resolved, await this.resolvePosition(companyId, data));

    const count = await this.employeeRepo.count({ where: { companyId } });
    const emp = this.employeeRepo.create({
      ...data,
      ...resolved,
      companyId,
      employeeCode: data.employeeCode || `EMP-${String(count + 1).padStart(4, '0')}`,
    });
    return this.employeeRepo.save(emp);
  }

  async updateEmployee(companyId: number, id: string, data: Partial<Employee>) {
    const emp = await this.findOneEmployee(companyId, id);
    const previousSalary = Number(emp.salary) || 0;
    const resolved = await this.resolveDepartmentAndCostCenter(companyId, data);
    Object.assign(resolved, await this.resolvePosition(companyId, data));
    Object.assign(emp, data, resolved);
    const saved = await this.employeeRepo.save(emp);

    // Registrar historial si el salario cambió.
    if (data.salary !== undefined && Number(data.salary) !== previousSalary) {
      await this.salaryHistoryRepo.save(
        this.salaryHistoryRepo.create({
          companyId,
          employeeId: id,
          previousSalary,
          newSalary: Number(data.salary),
          effectiveDate: new Date().toISOString().split('T')[0],
          changedBy: (data as any).changedBy || null,
          reason: (data as any).salaryChangeReason || null,
        }),
      );
    }

    return saved;
  }

  async getSalaryHistory(companyId: number, employeeId: string) {
    return this.salaryHistoryRepo.find({
      where: { companyId, employeeId },
      order: { effectiveDate: 'DESC', createdAt: 'DESC' },
    });
  }

  async deleteEmployee(companyId: number, id: string) {
    const emp = await this.findOneEmployee(companyId, id);
    await this.employeeRepo.remove(emp);
    return { message: 'Empleado eliminado correctamente' };
  }

  async getEmployeeStatistics(companyId: number) {
    const employees = await this.employeeRepo.find({ where: { companyId } });
    return {
      total: employees.length,
      active: employees.filter(e => e.status === 'active').length,
      inactive: employees.filter(e => e.status === 'inactive').length,
      onLeave: employees.filter(e => e.status === 'on_leave').length,
      byContract: {
        trialPeriod: employees.filter(e => e.contractType === 'trial_period').length,
        workExecution: employees.filter(e => e.contractType === 'work_execution').length,
      },
      byActivity: {
        direct: employees.filter(e => e.activity === 'direct').length,
        indirect: employees.filter(e => e.activity === 'indirect').length,
      },
      totalPayroll: employees.filter(e => e.status === 'active').reduce((sum, e) => sum + Number(e.salary), 0),
    };
  }

  // ── Departments ──

  async findAllDepartments(companyId: number) {
    const departments = await this.departmentRepo.find({
      where: { companyId },
      order: { name: 'ASC' },
    });

    // Contar empleados activos o de licencia por departamento.
    const counts = await this.employeeRepo
      .createQueryBuilder('e')
      .select('e.departmentId', 'departmentId')
      .addSelect('COUNT(*)', 'count')
      .where('e.companyId = :companyId', { companyId })
      .andWhere('e.departmentId IS NOT NULL')
      .andWhere('e.status != :inactive', { inactive: 'inactive' })
      .groupBy('e.departmentId')
      .getRawMany();

    const countMap = new Map<string, number>(
      counts.map((c) => [c.departmentId, Number(c.count)]),
    );
    for (const dept of departments) {
      dept.employeeCount = countMap.get(dept.id) || 0;
    }

    return departments;
  }

  async createDepartment(companyId: number, data: Partial<Department>) {
    const dept = this.departmentRepo.create({ ...data, companyId });
    return this.departmentRepo.save(dept);
  }

  async updateDepartment(companyId: number, id: string, data: Partial<Department>) {
    const dept = await this.departmentRepo.findOneBy({ id, companyId });
    if (!dept) throw new NotFoundException(`Departamento #${id} no encontrado`);
    Object.assign(dept, data);
    return this.departmentRepo.save(dept);
  }

  async deleteDepartment(companyId: number, id: string) {
    const dept = await this.departmentRepo.findOneBy({ id, companyId });
    if (!dept) throw new NotFoundException(`Departamento #${id} no encontrado`);
    await this.departmentRepo.remove(dept);
    return { message: 'Departamento eliminado correctamente' };
  }

  // ── Cargos ──

  async findAllPositions(companyId: number, filters?: { isActive?: boolean }) {
    const where: any = { companyId };
    if (filters?.isActive !== undefined) where.isActive = filters.isActive;

    const positions = await this.positionRepo.find({
      where,
      order: { name: 'ASC' },
    });

    // Ocupación real del cargo, excluyendo bajas definitivas.
    const counts = await this.employeeRepo
      .createQueryBuilder('e')
      .select('e.positionId', 'positionId')
      .addSelect('COUNT(*)', 'count')
      .where('e.companyId = :companyId', { companyId })
      .andWhere('e.positionId IS NOT NULL')
      .andWhere('e.status != :inactive', { inactive: 'inactive' })
      .groupBy('e.positionId')
      .getRawMany();

    const countMap = new Map<string, number>(
      counts.map((c) => [c.positionId, Number(c.count)]),
    );
    for (const position of positions) {
      position.employeeCount = countMap.get(position.id) || 0;
    }

    return positions;
  }

  async createPosition(companyId: number, data: Partial<JobPosition>) {
    const name = (data.name || '').trim();
    if (!name) throw new BadRequestException('El nombre del cargo es obligatorio');
    await this.assertPositionNameIsFree(companyId, name);

    const processed = this.processPositionData(data);
    const position = this.positionRepo.create({
      ...data,
      ...processed,
      name,
      companyId,
      ...(await this.resolvePositionDepartment(companyId, data)),
    });
    return this.positionRepo.save(position);
  }

  async updatePosition(companyId: number, id: string, data: Partial<JobPosition>) {
    const position = await this.positionRepo.findOneBy({ id, companyId });
    if (!position) throw new NotFoundException(`Cargo #${id} no encontrado`);

    if (data.name !== undefined) {
      const name = (data.name || '').trim();
      if (!name) throw new BadRequestException('El nombre del cargo es obligatorio');
      await this.assertPositionNameIsFree(companyId, name, id);
      data.name = name;
    }
    const processed = this.processPositionData(data);

    Object.assign(
      position,
      data,
      processed,
      await this.resolvePositionDepartment(companyId, data),
    );
    const saved = await this.positionRepo.save(position);

    // La denominación viaja denormalizada en fichas y contratos: al renombrar el
    // cargo hay que propagarla para que los listados no queden desfasados.
    if (data.name !== undefined) {
      await this.employeeRepo.update(
        { companyId, positionId: id },
        { position: saved.name },
      );
    }

    return saved;
  }

  async deletePosition(companyId: number, id: string) {
    const position = await this.positionRepo.findOneBy({ id, companyId });
    if (!position) throw new NotFoundException(`Cargo #${id} no encontrado`);

    const inUse = await this.employeeRepo.count({
      where: { companyId, positionId: id },
    });
    if (inUse > 0) {
      throw new ConflictException(
        `No se puede eliminar: ${inUse} trabajador(es) ocupan este cargo. Desactívelo en su lugar.`,
      );
    }

    await this.positionRepo.remove(position);
    return { message: 'Cargo eliminado correctamente' };
  }

  private processPositionData(data: Partial<JobPosition>): Partial<JobPosition> {
    const baseSalary = data.baseSalary !== undefined ? Number(data.baseSalary) : (data as any).baseSalary;
    const workingHours = data.workingHours !== undefined ? Number(data.workingHours) : (data as any).workingHours;
    const timeBank = data.timeBank !== undefined ? Number(data.timeBank) : (data as any).timeBank;
    const timeUnit = data.timeUnit || 'hours';
    const salaryRate =
      timeBank && Number(timeBank) > 0
        ? Number((Number(baseSalary || 0) / Number(timeBank)).toFixed(4))
        : 0;

    return {
      baseSalary: Number(baseSalary) || 0,
      workingHours: Number(workingHours) || 0,
      timeBank: Number(timeBank) || 0,
      timeUnit: timeUnit as 'hours' | 'days',
      salaryRate,
      paymentConcept: data.paymentConcept ?? null,
    };
  }

  private async assertPositionNameIsFree(
    companyId: number,
    name: string,
    excludeId?: string,
  ) {
    const existing = await this.positionRepo.findOne({
      where: excludeId
        ? { companyId, name, id: Not(excludeId) }
        : { companyId, name },
    });
    if (existing) {
      throw new ConflictException(`Ya existe un cargo llamado "${name}"`);
    }
  }

  private async resolvePositionDepartment(
    companyId: number,
    data: Partial<JobPosition>,
  ): Promise<Partial<JobPosition>> {
    if (data.departmentId === undefined) return {};
    if (!data.departmentId) return { departmentId: null, departmentName: null };

    const department = await this.departmentRepo.findOneBy({
      id: data.departmentId,
      companyId,
    });
    if (!department) {
      throw new NotFoundException(`Departamento ${data.departmentId} no encontrado`);
    }
    return { departmentId: department.id, departmentName: department.name };
  }

  /**
   * Enlaza la ficha con el catálogo de cargos y arrastra la denominación. Se
   * admite seguir enviando solo el texto "position" para no romper integraciones
   * anteriores al catálogo.
   */
  private async resolvePosition(
    companyId: number,
    data: Partial<Employee>,
  ): Promise<Partial<Employee>> {
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

  /**
   * Resuelve el centro de costo y el departamento para un empleado siguiendo la
   * cadena contable cubana: departamento -> centro de costo -> cuenta de gasto.
   * Si se envía departmentId sin costCenterId, hereda el centro del departamento.
   * Si el centro de costo no tiene expenseAccountCode, se emite una advertencia.
   */
  private async resolveDepartmentAndCostCenter(
    companyId: number,
    data: Partial<Employee>,
  ): Promise<Partial<Employee>> {
    const resolved: Partial<Employee> = {};
    let departmentId = data.departmentId;
    let costCenterId = data.costCenterId;
    let costCenter: CostCenter | null = null;

    if (departmentId) {
      const department = await this.departmentRepo.findOneBy({ id: departmentId, companyId });
      if (department) {
        resolved.departmentName = department.name;
        if (!costCenterId && department.costCenterId) {
          costCenterId = department.costCenterId;
          resolved.costCenterId = costCenterId;
        }
      } else {
        throw new NotFoundException(`Departamento ${departmentId} no encontrado`);
      }
    }

    if (costCenterId) {
      costCenter = await this.costCenterRepo.findOneBy({ id: costCenterId, companyId });
      if (!costCenter) {
        throw new NotFoundException(`Centro de costo ${costCenterId} no encontrado`);
      }
      if (!costCenter.expenseAccountCode) {
        // Advertencia controlada; no interrumpimos la creación del empleado.
        console.warn(
          `Centro de costo ${costCenter.id} no tiene cuenta de gasto asignada; la nómina usará mapeos por defecto.`,
        );
      }
      if (!resolved.departmentName && !departmentId) {
        resolved.costCenterId = costCenterId;
      }
    }

    return resolved;
  }
}
