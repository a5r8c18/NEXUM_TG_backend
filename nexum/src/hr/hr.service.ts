import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from '../entities/employee.entity';
import { Department } from '../entities/department.entity';

@Injectable()
export class HrService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
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
    const count = await this.employeeRepo.count({ where: { companyId } });
    const emp = this.employeeRepo.create({
      ...data,
      companyId,
      employeeCode: data.employeeCode || `EMP-${String(count + 1).padStart(4, '0')}`,
    });
    return this.employeeRepo.save(emp);
  }

  async updateEmployee(companyId: number, id: string, data: Partial<Employee>) {
    const emp = await this.findOneEmployee(companyId, id);
    Object.assign(emp, data);
    return this.employeeRepo.save(emp);
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
    return this.departmentRepo.find({
      where: { companyId },
      order: { name: 'ASC' },
    });
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
}
