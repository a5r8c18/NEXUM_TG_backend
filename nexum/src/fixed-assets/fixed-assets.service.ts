import { Injectable, NotFoundException, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FixedAsset } from '../entities/fixed-asset.entity';
import { VoucherService } from '../accounting/voucher.service';
import {
  mockDepreciationCatalog,
  getDepreciationRate,
} from '../shared/mock-data';

@Injectable()
export class FixedAssetsService {
  private readonly logger = new Logger(FixedAssetsService.name);

  constructor(
    @Inject(forwardRef(() => VoucherService))
    private readonly voucherService: VoucherService,
    @InjectRepository(FixedAsset)
    private readonly assetRepo: Repository<FixedAsset>,
  ) {}

  private catalog = mockDepreciationCatalog;

  async findAll(
    companyId: number,
    filters?: { status?: string; group_number?: string; search?: string },
  ) {
    const qb = this.assetRepo
      .createQueryBuilder('a')
      .where('a.company_id = :companyId', { companyId });

    if (filters?.status) {
      qb.andWhere('a.status = :status', { status: filters.status });
    }
    if (filters?.group_number) {
      qb.andWhere('a.group_number = :gn', {
        gn: parseInt(filters.group_number),
      });
    }
    if (filters?.search) {
      qb.andWhere(
        '(LOWER(a.name) LIKE :s OR LOWER(a.asset_code) LIKE :s OR LOWER(a.description) LIKE :s)',
        { s: `%${filters.search.toLowerCase()}%` },
      );
    }

    qb.orderBy('a.createdAt', 'DESC');
    const result = await qb.getMany();
    return { assets: result };
  }

  async findOne(companyId: number, id: number) {
    const asset = await this.assetRepo.findOneBy({ id, companyId });
    if (!asset) throw new NotFoundException(`Activo fijo #${id} no encontrado`);
    return { asset };
  }

  async create(
    companyId: number,
    data: {
      asset_code: string;
      name: string;
      description?: string;
      group_number: number;
      subgroup: string;
      subgroup_detail?: string;
      acquisition_value: number;
      acquisition_date: string;
      location?: string;
      responsible_person?: string;
    },
  ) {
    const depRate = getDepreciationRate(data.group_number, data.subgroup);

    const asset = new FixedAsset();
    asset.companyId = companyId;
    asset.assetCode = data.asset_code;
    asset.name = data.name;
    asset.description = data.description || '';
    asset.groupNumber = data.group_number;
    asset.subgroup = data.subgroup;
    asset.subgroupDetail = data.subgroup_detail || '';
    asset.acquisitionValue = data.acquisition_value;
    asset.acquisitionDate = data.acquisition_date;
    asset.location = data.location || '';
    asset.responsiblePerson = data.responsible_person || '';
    asset.depreciationRate = depRate ?? 0;
    asset.currentValue = data.acquisition_value;
    asset.status = 'active';
    await this.assetRepo.save(asset);

    // ── Contabilización de adquisición de activo fijo ──
    const acquisitionValue = Number(asset.acquisitionValue);
    if (acquisitionValue > 0) {
      try {
        await this.voucherService.createVoucherFromModule(
          companyId,
          'fixed-assets',
          String(asset.id),
          {
            date: asset.acquisitionDate || new Date().toISOString().split('T')[0],
            description: `Adquisición AFT: ${asset.name} (${asset.assetCode})`,
            type: 'fixed-assets',
            reference: `AFT-${asset.assetCode}`,
            createdBy: 'Sistema',
            lines: [
              {
                accountCode: '240', // Activos Fijos Tangibles
                debit: acquisitionValue,
                credit: 0,
                description: `Alta AFT ${asset.assetCode}`,
              },
              {
                accountCode: '410', // Cuentas por Pagar
                debit: 0,
                credit: acquisitionValue,
                description: `Obligación por adquisición AFT`,
              },
            ],
          },
        );
      } catch (error) {
        this.logger.error(`Error contabilización AFT ${asset.id}: ${error.message}`);
      }
    }

    return { asset };
  }

  async update(
    companyId: number,
    id: number,
    data: {
      name?: string;
      description?: string;
      location?: string;
      responsible_person?: string;
      status?: string;
    },
  ) {
    const asset = await this.assetRepo.findOneBy({ id, companyId });
    if (!asset) throw new NotFoundException(`Activo fijo #${id} no encontrado`);

    if (data.name !== undefined) asset.name = data.name;
    if (data.description !== undefined) asset.description = data.description;
    if (data.location !== undefined) asset.location = data.location;
    if (data.responsible_person !== undefined)
      asset.responsiblePerson = data.responsible_person;
    if (data.status !== undefined) asset.status = data.status;

    const saved = await this.assetRepo.save(asset);
    return { asset: saved };
  }

  async remove(companyId: number, id: number) {
    const asset = await this.assetRepo.findOneBy({ id, companyId });
    if (!asset) throw new NotFoundException(`Activo fijo #${id} no encontrado`);
    await this.assetRepo.softRemove(asset);
    return { message: 'Activo fijo eliminado correctamente' };
  }

  getDepreciationCatalog() {
    return { catalog: this.catalog };
  }

  async getStatistics(companyId: number) {
    const assets = await this.assetRepo.find({ where: { companyId } });
    const active = assets.filter((a) => a.status === 'active');
    const disposed = assets.filter((a) => a.status === 'disposed');
    const totalValue = assets.reduce(
      (sum, a) => sum + Number(a.acquisitionValue),
      0,
    );
    const currentValue = assets.reduce(
      (sum, a) => sum + Number(a.currentValue),
      0,
    );

    return {
      totalAssets: assets.length,
      activeCount: active.length,
      disposedCount: disposed.length,
      totalAcquisitionValue: totalValue,
      totalCurrentValue: currentValue,
      totalDepreciation: totalValue - currentValue,
    };
  }

  async calculateMonthlyDepreciation(
    companyId: number,
    year: number,
    month: number,
  ) {
    const assets = await this.assetRepo.find({
      where: { companyId, status: 'active' },
    });
    const depreciationRecords: any[] = [];

    for (const asset of assets) {
      const acquisitionDate = new Date(asset.acquisitionDate);
      const currentDate = new Date(year, month - 1, 1);

      if (currentDate >= acquisitionDate) {
        const monthsElapsed = Math.max(
          0,
          (currentDate.getFullYear() - acquisitionDate.getFullYear()) * 12 +
            (currentDate.getMonth() - acquisitionDate.getMonth()),
        );

        const acqVal = Number(asset.acquisitionValue);
        const depRate = Number(asset.depreciationRate);
        const monthlyDepreciation = (acqVal * (depRate / 100)) / 12;
        const accumulatedDepreciation = Math.min(
          monthlyDepreciation * monthsElapsed,
          acqVal,
        );
        const currentValue = Math.max(acqVal - accumulatedDepreciation, 0);

        depreciationRecords.push({
          assetId: asset.id,
          assetCode: asset.assetCode,
          assetName: asset.name,
          month,
          year,
          monthlyDepreciation,
          accumulatedDepreciation,
          currentValue,
          depreciationRate: depRate,
        });
      }
    }

    return { records: depreciationRecords };
  }

  async calculateAnnualDepreciation(companyId: number, year: number) {
    const records: any[] = [];
    for (let month = 1; month <= 12; month++) {
      const monthResult = await this.calculateMonthlyDepreciation(
        companyId,
        year,
        month,
      );
      records.push(...monthResult.records);
    }
    return { records };
  }

  async processMonthlyDepreciation(
    companyId: number,
    year: number,
    month: number,
  ) {
    const result = await this.calculateMonthlyDepreciation(companyId, year, month);
    const records = result.records;

    if (records.length === 0) {
      return { message: 'No depreciation records for this period', voucher: null };
    }

    const totalDepreciation = records.reduce(
      (sum, r) => sum + Number(r.monthlyDepreciation),
      0,
    );

    // ── Contabilización de depreciación mensual ──
    if (totalDepreciation > 0) {
      try {
        const voucher = await this.voucherService.createVoucherFromModule(
          companyId,
          'fixed-assets',
          `DEP-${year}-${String(month).padStart(2, '0')}`,
          {
            date: `${year}-${String(month).padStart(2, '0')}-28`,
            description: `Depreciación mensual ${month}/${year} (${records.length} activos)`,
            type: 'fixed-assets',
            reference: `DEP-${year}-${String(month).padStart(2, '0')}`,
            createdBy: 'Sistema',
            lines: [
              {
                accountCode: '840', // Gasto de Depreciación
                debit: totalDepreciation,
                credit: 0,
                description: `Depreciación ${month}/${year}`,
              },
              {
                accountCode: '375', // Depreciación Acumulada AFT
                debit: 0,
                credit: totalDepreciation,
                description: `Dep. acumulada ${month}/${year}`,
              },
            ],
          },
        );
        this.logger.log(`Comprobante depreciación ${month}/${year} generado`);
      } catch (error) {
        this.logger.error(`Error contabilización depreciación: ${error.message}`);
      }
    }

    // Update asset current values
    for (const record of records) {
      const asset = await this.assetRepo.findOneBy({
        id: record.assetId,
        companyId,
      });
      if (asset) {
        asset.currentValue = record.currentValue;
        await this.assetRepo.save(asset);
      }
    }

    return {
      message: `Depreciation processed for ${records.length} assets`,
      totalDepreciation,
      voucher: null,
    };
  }
}
