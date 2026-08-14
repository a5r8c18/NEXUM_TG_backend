import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from '../entities/employee.entity';
import { Department } from '../entities/department.entity';
import { CostCenter } from '../entities/cost-center.entity';
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
    @InjectRepository(EmployeeSalaryHistory)
    private readonly salaryHistoryRepo: Repository<EmployeeSalaryHistory>,
  ) {}

  // ── Employees ──

  async findAllEmployees(companyId: number, filters?: {
    status?: string;
    departmentId?: string;
    search?: string;
    contractType?: string;
  }) {
    const qb = this.employeeRepo.createQueryBuilder('e')
      .where('e.companyId = :companyId', { companyId });

    if (filters?.status) qb.andWhere('e.status = :status', { status: filters.status });
    if (filters?.departmentId) qb.andWhere('e.departmentId = :departmentId', { departmentId: filters.departmentId });
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
        fullTime: employees.filter(e => e.contractType === 'full_time').length,
        partTime: employees.filter(e => e.contractType === 'part_time').length,
        contractor: employees.filter(e => e.contractType === 'contractor').length,
        intern: employees.filter(e => e.contractType === 'intern').length,
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
