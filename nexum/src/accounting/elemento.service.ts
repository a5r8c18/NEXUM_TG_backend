import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Elemento } from '../entities/elemento.entity';

@Injectable()
export class ElementoService {
  constructor(
    @InjectRepository(Elemento)
    private readonly elementoRepo: Repository<Elemento>,
  ) {}

  async findAll(companyId: number, filters?: { status?: string; search?: string }) {
    const qb = this.elementoRepo.createQueryBuilder('e')
      .where('e.companyId = :companyId', { companyId });
    if (filters?.status) qb.andWhere('e.status = :status', { status: filters.status });
    if (filters?.search) {
      qb.andWhere('(e.entryNumber ILIKE :search OR e.description ILIKE :search)', 
        { search: `%${filters.search}%` });
    }
    return qb.orderBy('e.date', 'DESC').getMany();
  }

  async findOne(companyId: number, id: string) {
    const elemento = await this.elementoRepo.findOneBy({ id, companyId });
    if (!elemento) throw new NotFoundException(`Elemento #${id} no encontrado`);
    return elemento;
  }

  async create(companyId: number, data: any) {
    const elemento = this.elementoRepo.create({ ...data, companyId });
    return this.elementoRepo.save(elemento);
  }

  async update(companyId: number, id: string, data: any) {
    const elemento = await this.findOne(companyId, id);
    Object.assign(elemento, data);
    return this.elementoRepo.save(elemento);
  }

  async delete(companyId: number, id: string) {
    const elemento = await this.findOne(companyId, id);
    return this.elementoRepo.remove(elemento);
  }

  async updateStatus(companyId: number, id: string, status: string) {
    const elemento = await this.findOne(companyId, id);
    elemento.status = status as any;
    return this.elementoRepo.save(elemento);
  }

  async getStatistics(companyId: number) {
    const stats = await this.elementoRepo
      .createQueryBuilder('e')
      .select('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN e.status = :posted THEN 1 ELSE 0 END)', 'posted')
      .addSelect('SUM(CASE WHEN e.status = :draft THEN 1 ELSE 0 END)', 'draft')
      .addSelect('SUM(CASE WHEN e.status = :cancelled THEN 1 ELSE 0 END)', 'cancelled')
      .where('e.companyId = :companyId', { companyId })
      .setParameters({ posted: 'posted', draft: 'draft', cancelled: 'cancelled' })
      .getRawOne();
    return {
      total: parseInt(stats.total) || 0,
      posted: parseInt(stats.posted) || 0,
      draft: parseInt(stats.draft) || 0,
      cancelled: parseInt(stats.cancelled) || 0,
    };
  }
}
