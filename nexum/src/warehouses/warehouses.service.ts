import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Warehouse } from '../entities/warehouse.entity';

@Injectable()
export class WarehousesService {
  constructor(
    @InjectRepository(Warehouse)
    private readonly warehouseRepo: Repository<Warehouse>,
  ) {}

  findAll(companyId: number) {
    return this.warehouseRepo.find({
      where: { companyId },
      order: { name: 'ASC' },
    });
  }

  async findOne(companyId: number, id: string) {
    const wh = await this.warehouseRepo.findOneBy({ id, companyId });
    if (!wh) throw new NotFoundException(`Almacén #${id} no encontrado`);
    return wh;
  }

  async create(
    companyId: number,
    data: { name: string; code: string; address?: string },
  ) {
    const warehouse = this.warehouseRepo.create({
      companyId,
      name: data.name,
      code: data.code,
      address: data.address || '',
      isActive: true,
    });
    return this.warehouseRepo.save(warehouse);
  }

  async update(
    companyId: number,
    id: string,
    data: {
      name?: string;
      code?: string;
      address?: string;
      isActive?: boolean;
    },
  ) {
    const wh = await this.findOne(companyId, id);
    if (data.name !== undefined) wh.name = data.name;
    if (data.code !== undefined) wh.code = data.code;
    if (data.address !== undefined) wh.address = data.address;
    if (data.isActive !== undefined) wh.isActive = data.isActive;
    return this.warehouseRepo.save(wh);
  }

  async remove(companyId: number, id: string) {
    const wh = await this.findOne(companyId, id);
    await this.warehouseRepo.remove(wh);
    return { message: 'Almacén eliminado correctamente' };
  }

  async activate(companyId: number, id: string) {
    const wh = await this.findOne(companyId, id);
    wh.isActive = true;
    return this.warehouseRepo.save(wh);
  }

  async deactivate(companyId: number, id: string) {
    const wh = await this.findOne(companyId, id);
    wh.isActive = false;
    return this.warehouseRepo.save(wh);
  }
}
