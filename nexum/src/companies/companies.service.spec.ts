/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { CompaniesService } from './companies.service';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { getRepositoryToken } from '@nestjs/typeorm';

describe('CompaniesService', () => {
  let service: CompaniesService;
  let repository: Repository<Company>;

  const mockCompany: Company = {
    id: 2,
    name: 'Test Company',
    taxId: '123456789',
    address: 'Test Address',
    phone: '1234567890',
    email: 'company@example.com',
    logoPath: null,
    isActive: true,
    tenantId: 'tenant-single_company-1234567890',
    tenantType: 'SINGLE_COMPANY',
    createdAt: new Date(),
    updatedAt: new Date(),
    warehouses: [],
    users: [],
    userCompanies: [],
  };

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompaniesService,
        {
          provide: getRepositoryToken(Company),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<CompaniesService>(CompaniesService);
    repository = module.get<Repository<Company>>(getRepositoryToken(Company));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all companies ordered by id', async () => {
      const companies = [mockCompany];
      jest.spyOn(repository, 'find').mockResolvedValue(companies);

      const result = await service.findAll();

      expect(result).toEqual(companies);
      expect(repository.find).toHaveBeenCalledWith({ order: { id: 'ASC' } });
    });
  });

  describe('findByTenant', () => {
    it('should return companies for specific tenant', async () => {
      const tenantId = 'tenant-single_company-1234567890';
      jest.spyOn(repository, 'find').mockResolvedValue([mockCompany]);

      const result = await service.findByTenant(tenantId);

      expect(result).toEqual([mockCompany]);
      expect(repository.find).toHaveBeenCalledWith({
        where: { tenantId },
        order: { id: 'ASC' },
      });
    });
  });

  describe('findActiveCompanies', () => {
    it('should return only active companies', async () => {
      jest.spyOn(repository, 'find').mockResolvedValue([mockCompany]);

      const result = await service.findActiveCompanies();

      expect(result).toEqual([mockCompany]);
      expect(repository.find).toHaveBeenCalledWith({
        where: { isActive: true },
        order: { id: 'ASC' },
      });
    });
  });

  describe('findOne', () => {
    it('should return a company when found', async () => {
      jest.spyOn(repository, 'findOneBy').mockResolvedValue(mockCompany);

      const result = await service.findOne(mockCompany.id);

      expect(result).toEqual(mockCompany);
      expect(repository.findOneBy).toHaveBeenCalledWith({ id: mockCompany.id });
    });

    it('should throw NotFoundException when company not found', async () => {
      jest.spyOn(repository, 'findOneBy').mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(
        'Empresa no encontrada',
      );
    });
  });

  describe('create', () => {
    it('should create a new company', async () => {
      const createCompanyDto = {
        name: 'New Company',
        taxId: '987654321',
        address: 'New Address',
        phone: '0987654321',
        email: 'new@example.com',
        logo_path: 'logo.png',
        is_active: true,
        tenantId: 'tenant-new-123',
        tenantType: 'SINGLE_COMPANY',
      };

      jest.spyOn(repository, 'findOneBy').mockResolvedValue(null);
      jest.spyOn(repository, 'save').mockResolvedValue(mockCompany);

      const result = await service.create(createCompanyDto);

      expect(result).toEqual(mockCompany);
      expect(repository.findOneBy).toHaveBeenCalledWith({
        name: createCompanyDto.name,
      });
      expect(repository.save).toHaveBeenCalled();
    });

    it('should throw ConflictException when company name already exists', async () => {
      const createCompanyDto = {
        name: 'Test Company', // Same as mockCompany
        taxId: '987654321',
      };

      jest.spyOn(repository, 'findOneBy').mockResolvedValue(mockCompany);

      await expect(service.create(createCompanyDto)).rejects.toThrow(
        'Ya existe una empresa con ese nombre',
      );
    });
  });

  describe('update', () => {
    it('should update a company', async () => {
      const updateData = {
        name: 'Updated Company',
        taxId: '999999999',
        address: 'Updated Address',
      };

      const updatedCompany = { ...mockCompany, ...updateData };
      jest.spyOn(repository, 'findOneBy').mockResolvedValue(mockCompany);
      jest.spyOn(repository, 'save').mockResolvedValue(updatedCompany);

      const result = await service.update(mockCompany.id, updateData);

      expect(result).toEqual(updatedCompany);
      expect(repository.findOneBy).toHaveBeenCalledWith({ id: mockCompany.id });
      expect(repository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when company not found', async () => {
      const updateData = { name: 'Updated Company' };

      jest.spyOn(repository, 'findOneBy').mockResolvedValue(null);

      await expect(service.update(999, updateData)).rejects.toThrow(
        'Empresa no encontrada',
      );
    });

    it('should throw ConflictException when name conflicts with another company', async () => {
      const updateData = { name: 'Another Company' };
      const conflictingCompany = {
        ...mockCompany,
        id: 3,
        name: 'Another Company',
      };

      jest
        .spyOn(repository, 'findOneBy')
        .mockResolvedValueOnce(mockCompany) // First call for existing company
        .mockResolvedValueOnce(conflictingCompany); // Second call for name conflict

      await expect(service.update(mockCompany.id, updateData)).rejects.toThrow(
        'Ya existe una empresa con ese nombre',
      );
    });
  });

  describe('remove', () => {
    it('should remove a company', async () => {
      jest.spyOn(repository, 'findOneBy').mockResolvedValue(mockCompany);
      jest.spyOn(repository, 'remove').mockResolvedValue(mockCompany);

      const result = await service.remove(mockCompany.id);

      expect(result).toEqual({ message: 'Empresa eliminada correctamente' });
      expect(repository.findOneBy).toHaveBeenCalledWith({ id: mockCompany.id });
      expect(repository.remove).toHaveBeenCalledWith(mockCompany);
    });

    it('should throw NotFoundException when company not found', async () => {
      jest.spyOn(repository, 'findOneBy').mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(
        'Empresa no encontrada',
      );
    });

    it('should throw ConflictException when trying to delete main company (id=1)', async () => {
      jest.spyOn(repository, 'findOneBy').mockResolvedValue(mockCompany);

      await expect(service.remove(1)).rejects.toThrow(
        'No se puede eliminar la empresa principal',
      );
    });
  });

  describe('searchByName', () => {
    it('should search companies by name or email', async () => {
      const searchTerm = 'test';
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockCompany]),
      };

      jest
        .spyOn(repository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);

      const result = await service.searchByName(searchTerm);

      expect(result).toEqual([mockCompany]);
      expect(repository.createQueryBuilder).toHaveBeenCalledWith('company');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'company.name ILIKE :searchTerm',
        { searchTerm: `%${searchTerm}%` },
      );
      expect(mockQueryBuilder.orWhere).toHaveBeenCalledWith(
        'company.email ILIKE :searchTerm',
        { searchTerm: `%${searchTerm}%` },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'company.isActive = :isActive',
        { isActive: true },
      );
    });
  });

  describe('findActive', () => {
    it('should return active companies ordered by name', async () => {
      jest.spyOn(repository, 'find').mockResolvedValue([mockCompany]);

      const result = await service.findActive();

      expect(result).toEqual([mockCompany]);
      expect(repository.find).toHaveBeenCalledWith({
        where: { isActive: true },
        order: { name: 'ASC' },
      });
    });
  });

  describe('findByUserEmail', () => {
    it('should find companies associated with user email', async () => {
      const userEmail = 'user@example.com';
      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockCompany]),
      };

      jest
        .spyOn(repository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);

      const result = await service.findByUserEmail(userEmail);

      expect(result).toEqual([mockCompany]);
      expect(repository.createQueryBuilder).toHaveBeenCalledWith('company');
      expect(mockQueryBuilder.innerJoin).toHaveBeenCalledWith(
        'company.users',
        'user',
      );
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'user.email = :email',
        { email: userEmail },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'company.isActive = :isActive',
        { isActive: true },
      );
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'company.name',
        'ASC',
      );
    });
  });
});
