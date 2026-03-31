import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserCompany } from '../entities/user-company.entity';
import { User } from '../entities/user.entity';
import { Company } from '../entities/company.entity';

@Injectable()
export class UserCompaniesService {
  constructor(
    @InjectRepository(UserCompany)
    private userCompanyRepo: Repository<UserCompany>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Company)
    private companyRepo: Repository<Company>,
  ) {}

  // Asignar empresas a un usuario
  async assignCompaniesToUser(
    userId: string,
    companyIds: number[],
    role: string = 'user'
  ): Promise<UserCompany[]> {
    // Verificar que el usuario existe
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    // Eliminar asignaciones existentes
    await this.userCompanyRepo.delete({ userId });

    // Crear nuevas asignaciones
    const assignments: UserCompany[] = [];
    
    for (const companyId of companyIds) {
      // Verificar que la empresa existe
      const company = await this.companyRepo.findOneBy({ id: companyId });
      if (!company) {
        throw new Error(`Empresa con ID ${companyId} no encontrada`);
      }

      const userCompany = new UserCompany();
      userCompany.userId = userId;
      userCompany.companyId = companyId;
      userCompany.role = role;
      userCompany.isActive = true;

      assignments.push(userCompany);
    }

    return this.userCompanyRepo.save(assignments);
  }

  // Obtener empresas asignadas a un usuario
  async getUserCompanies(userId: string): Promise<UserCompany[]> {
    return this.userCompanyRepo.find({
      where: { 
        userId, 
        isActive: true 
      },
      relations: ['company']
    });
  }

  // Obtener usuarios asignados a una empresa
  async getCompanyUsers(companyId: number): Promise<UserCompany[]> {
    return this.userCompanyRepo.find({
      where: { 
        companyId, 
        isActive: true 
      },
      relations: ['user']
    });
  }

  // Revocar acceso a una empresa
  async revokeCompanyAccess(userId: string, companyId: number): Promise<void> {
    await this.userCompanyRepo.update(
      { userId, companyId },
      { isActive: false }
    );
  }

  // Verificar si un usuario tiene acceso a una empresa
  async hasCompanyAccess(userId: string, companyId: number): Promise<boolean> {
    const assignment = await this.userCompanyRepo.findOne({
      where: { 
        userId, 
        companyId, 
        isActive: true 
      }
    });
    
    return !!assignment;
  }

  // Obtener el rol de un usuario en una empresa específica
  async getUserRoleInCompany(userId: string, companyId: number): Promise<string | null> {
    const assignment = await this.userCompanyRepo.findOne({
      where: { 
        userId, 
        companyId, 
        isActive: true 
      }
    });
    
    return assignment?.role || null;
  }
}
