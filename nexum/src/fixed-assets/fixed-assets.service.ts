import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FixedAsset } from '../entities/fixed-asset.entity';
import { DepreciationHistory } from '../entities/depreciation-history.entity';
import { VoucherService } from '../accounting/voucher.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditResource } from '../entities/audit-log.entity';
import { DepreciationCatalog } from '../entities/depreciation-catalog.entity';

@Injectable()
export class FixedAssetsService {
  private readonly logger = new Logger(FixedAssetsService.name);

  constructor(
    @Inject(forwardRef(() => VoucherService))
    private readonly voucherService: VoucherService,
    @InjectRepository(FixedAsset)
    private readonly assetRepo: Repository<FixedAsset>,
    @InjectRepository(DepreciationHistory)
    private readonly depreciationHistoryRepo: Repository<DepreciationHistory>,
    @InjectRepository(DepreciationCatalog)
    private readonly catalogRepo: Repository<DepreciationCatalog>,
    private readonly auditService: AuditService,
  ) {}

  async findAll(
    companyId: number,
    filters?: { status?: string; group_number?: string; search?: string },
    pagination?: { page?: number; limit?: number },
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

    // Apply pagination if provided
    const page = pagination?.page ? parseInt(String(pagination.page)) : 1;
    const limit = pagination?.limit ? parseInt(String(pagination.limit)) : 50;
    const skip = (page - 1) * limit;

    qb.skip(skip).take(limit);

    const [assets, total] = await qb.getManyAndCount();

    return {
      assets,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(companyId: number, id: number) {
    const asset = await this.assetRepo.findOneBy({ id, companyId });
    if (!asset) throw new NotFoundException(`Activo fijo #${id} no encontrado`);
    return { asset };
  }

  async create(
    companyId: number,
    data: {
      assetCode: string;
      name: string;
      description?: string;
      groupNumber: number;
      subgroup: string;
      subgroupDetail?: string;
      acquisitionValue: number;
      acquisitionDate: string;
      location?: string;
      responsiblePerson?: string;
    },
  ) {
    const depRate = await this.getDepreciationRateFromCatalog(companyId, data.groupNumber, data.subgroup);

    const asset = new FixedAsset();
    asset.companyId = companyId;
    asset.assetCode = data.assetCode;
    asset.name = data.name;
    asset.description = data.description || '';
    asset.groupNumber = data.groupNumber;
    asset.subgroup = data.subgroup;
    asset.subgroupDetail = data.subgroupDetail || '';
    asset.acquisitionValue = data.acquisitionValue;
    asset.acquisitionDate = data.acquisitionDate;
    asset.location = data.location || '';
    asset.responsiblePerson = data.responsiblePerson || '';
    asset.depreciationRate = depRate ?? 0;
    asset.currentValue = data.acquisitionValue;
    asset.status = 'active';
    await this.assetRepo.save(asset);

    // ── Auditoría de creación ──
    await this.auditService.log({
      companyId,
      userName: 'Sistema',
      action: AuditAction.CREATE,
      resource: AuditResource.FIXED_ASSET,
      resourceId: String(asset.id),
      resourceName: `Alta AFT: ${asset.assetCode} - ${asset.name}`,
      oldValues: undefined,
      newValues: {
        assetCode: asset.assetCode,
        name: asset.name,
        acquisitionValue: asset.acquisitionValue,
        depreciationRate: asset.depreciationRate,
      },
    });

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
      responsiblePerson?: string;
      status?: string;
    },
  ) {
    const asset = await this.assetRepo.findOneBy({ id, companyId });
    if (!asset) throw new NotFoundException(`Activo fijo #${id} no encontrado`);

    const oldValues = {
      name: asset.name,
      description: asset.description,
      location: asset.location,
      responsiblePerson: asset.responsiblePerson,
      status: asset.status,
    };

    if (data.name !== undefined) asset.name = data.name;
    if (data.description !== undefined) asset.description = data.description;
    if (data.location !== undefined) asset.location = data.location;
    if (data.responsiblePerson !== undefined)
      asset.responsiblePerson = data.responsiblePerson;
    if (data.status !== undefined) asset.status = data.status;

    const saved = await this.assetRepo.save(asset);

    // ── Auditoría de actualización ──
    await this.auditService.log({
      companyId,
      userName: 'Sistema',
      action: AuditAction.UPDATE,
      resource: AuditResource.FIXED_ASSET,
      resourceId: String(asset.id),
      resourceName: `Actualización AFT: ${asset.assetCode} - ${asset.name}`,
      oldValues,
      newValues: {
        name: saved.name,
        description: saved.description,
        location: saved.location,
        responsiblePerson: saved.responsiblePerson,
        status: saved.status,
      },
    });

    return { asset: saved };
  }

  async remove(companyId: number, id: number) {
    const asset = await this.assetRepo.findOneBy({ id, companyId });
    if (!asset) throw new NotFoundException(`Activo fijo #${id} no encontrado`);

    // ── Auditoría de eliminación ──
    await this.auditService.log({
      companyId,
      userName: 'Sistema',
      action: AuditAction.DELETE,
      resource: AuditResource.FIXED_ASSET,
      resourceId: String(asset.id),
      resourceName: `Eliminación AFT: ${asset.assetCode} - ${asset.name}`,
      oldValues: {
        assetCode: asset.assetCode,
        name: asset.name,
        acquisitionValue: asset.acquisitionValue,
        currentValue: asset.currentValue,
        status: asset.status,
      },
      newValues: undefined,
    });

    await this.assetRepo.softRemove(asset);
    return { message: 'Activo fijo eliminado correctamente' };
  }

  // ── Baja de Activo Fijo (NCC Cuba - Res. 235-2005 MFP) ──
  // Genera comprobante contable:
  //   Débito  375 (Depreciación Acumulada AFT)     → por depreciación acumulada
  //   Débito  845 (Faltantes y Pérdidas de AFT)    → por valor residual (pérdida)
  //   Crédito 240 (Activos Fijos Tangibles)         → por valor de adquisición
  async disposeAsset(
    companyId: number,
    id: number,
    data: {
      reason: string;
      disposalType: 'deterioro' | 'obsolescencia' | 'rotura' | 'faltante' | 'venta' | 'donacion';
      disposalDate?: string;
    },
    userName?: string,
  ) {
    const asset = await this.assetRepo.findOneBy({ id, companyId });
    if (!asset) throw new NotFoundException(`Activo fijo #${id} no encontrado`);
    if (asset.status === 'disposed') {
      throw new BadRequestException(`El activo ${asset.assetCode} ya fue dado de baja`);
    }

    const disposalDate = data.disposalDate || new Date().toISOString().split('T')[0];
    const acquisitionValue = Number(asset.acquisitionValue);
    const currentValue = Number(asset.currentValue);
    const accumulatedDepreciation = acquisitionValue - currentValue;
    const residualLoss = currentValue; // Valor no depreciado = pérdida

    const oldStatus = asset.status;
    asset.status = 'disposed';
    asset.currentValue = 0;
    await this.assetRepo.save(asset);

    // ── Comprobante contable de baja ──
    if (acquisitionValue > 0) {
      try {
        const lines: Array<{
          accountCode: string;
          debit: number;
          credit: number;
          description: string;
        }> = [];

        // Débito: Depreciación Acumulada (375) por lo ya depreciado
        if (accumulatedDepreciation > 0) {
          lines.push({
            accountCode: '375',
            debit: accumulatedDepreciation,
            credit: 0,
            description: `Dep. acumulada baja AFT ${asset.assetCode}`,
          });
        }

        // Débito: Faltantes y Pérdidas (845) por valor residual
        if (residualLoss > 0) {
          const lossAccount = data.disposalType === 'venta' ? '350' : '845';
          lines.push({
            accountCode: lossAccount,
            debit: residualLoss,
            credit: 0,
            description: `${data.disposalType === 'venta' ? 'Venta' : 'Pérdida'} AFT ${asset.assetCode} - ${data.reason}`,
          });
        }

        // Crédito: Activos Fijos Tangibles (240) por valor total de adquisición
        lines.push({
          accountCode: '240',
          debit: 0,
          credit: acquisitionValue,
          description: `Baja AFT ${asset.assetCode}: ${asset.name}`,
        });

        await this.voucherService.createVoucherFromModule(
          companyId,
          'fixed-assets',
          String(asset.id),
          {
            date: disposalDate,
            description: `Baja de AFT: ${asset.name} (${asset.assetCode}) - ${data.disposalType}: ${data.reason}`,
            type: 'fixed-assets',
            reference: `BAJA-${asset.assetCode}`,
            createdBy: userName || 'Sistema',
            lines,
          },
        );
        this.logger.log(`Comprobante de baja AFT ${asset.assetCode} generado`);
      } catch (error) {
        this.logger.error(`Error contabilización baja AFT ${asset.id}: ${error instanceof Error ? error.message : String(error)}`);
        // Revert asset status if accounting fails
        asset.status = oldStatus;
        asset.currentValue = currentValue;
        await this.assetRepo.save(asset);
        throw new BadRequestException(`Error al generar comprobante contable: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // ── Auditoría de la baja ──
    await this.auditService.log({
      companyId,
      userName: userName || 'System',
      action: AuditAction.DELETE,
      resource: AuditResource.FIXED_ASSET,
      resourceId: String(asset.id),
      resourceName: `Baja AFT: ${asset.assetCode} - ${asset.name}`,
      oldValues: {
        status: oldStatus,
        currentValue: currentValue,
        acquisitionValue: acquisitionValue,
      },
      newValues: {
        status: 'disposed',
        currentValue: 0,
        disposalType: data.disposalType,
        disposalDate,
        reason: data.reason,
        accumulatedDepreciation,
        residualLoss,
      },
      success: true,
    });

    return {
      asset,
      accounting: {
        accumulatedDepreciation,
        residualLoss,
        acquisitionValue,
        disposalType: data.disposalType,
        disposalDate,
      },
    };
  }

  // ── Revalorización de Activo Fijo (NCC Cuba - Res. 340) ──
  // Ajusta el valor contable del activo basado en tasación o valor de mercado
  // Genera comprobante contable:
  //   Si valor nuevo > valor actual: Superávit de revalorización (cuenta 846)
  //   Si valor nuevo < valor actual: Déficit de revalorización (cuenta 845)
  async revalueAsset(
    companyId: number,
    id: number,
    data: {
      newValue: number;
      reason: string;
      revaluationDate: string;
      appraisalReference?: string;
    },
    userName?: string,
  ) {
    const asset = await this.assetRepo.findOneBy({ id, companyId });
    if (!asset) throw new NotFoundException(`Activo fijo #${id} no encontrado`);
    if (asset.status === 'disposed') {
      throw new BadRequestException(`El activo ${asset.assetCode} ya fue dado de baja`);
    }

    const oldCurrentValue = Number(asset.currentValue);
    const newCurrentValue = Number(data.newValue);
    const revaluationDifference = newCurrentValue - oldCurrentValue;

    if (revaluationDifference === 0) {
      throw new BadRequestException('El nuevo valor debe ser diferente al valor actual');
    }

    const oldAcquisitionValue = Number(asset.acquisitionValue);
    asset.currentValue = newCurrentValue;
    await this.assetRepo.save(asset);

    // ── Comprobante contable de revalorización ──
    try {
      const lines: Array<{
        accountCode: string;
        debit: number;
        credit: number;
        description: string;
      }> = [];

      if (revaluationDifference > 0) {
        // Superávit de revalorización
        lines.push({
          accountCode: '240', // Activos Fijos Tangibles
          debit: revaluationDifference,
          credit: 0,
          description: `Revalorización AFT ${asset.assetCode} - ${data.reason}`,
        });
        lines.push({
          accountCode: '846', // Superávit de Revalorización de AFT
          debit: 0,
          credit: revaluationDifference,
          description: `Superávit revalorización AFT ${asset.assetCode}`,
        });
      } else {
        // Déficit de revalorización (pérdida)
        const deficit = Math.abs(revaluationDifference);
        lines.push({
          accountCode: '845', // Faltantes y Pérdidas de AFT
          debit: deficit,
          credit: 0,
          description: `Déficit revalorización AFT ${asset.assetCode} - ${data.reason}`,
        });
        lines.push({
          accountCode: '240', // Activos Fijos Tangibles
          debit: 0,
          credit: deficit,
          description: `Reducción valor AFT ${asset.assetCode}`,
        });
      }

      await this.voucherService.createVoucherFromModule(
        companyId,
        'fixed-assets',
        String(asset.id),
        {
          date: data.revaluationDate,
          description: `Revalorización AFT: ${asset.name} (${asset.assetCode}) - ${data.reason}`,
          type: 'fixed-assets',
          reference: `REV-${asset.assetCode}`,
          createdBy: userName || 'Sistema',
          lines,
        },
      );
      this.logger.log(`Comprobante de revalorización AFT ${asset.assetCode} generado`);
    } catch (error) {
      this.logger.error(`Error contabilización revalorización AFT ${asset.id}: ${error instanceof Error ? error.message : String(error)}`);
      // Revert asset value if accounting fails
      asset.currentValue = oldCurrentValue;
      await this.assetRepo.save(asset);
      throw new BadRequestException(`Error al generar comprobante contable: ${error instanceof Error ? error.message : String(error)}`);
    }

    // ── Auditoría de la revalorización ──
    await this.auditService.log({
      companyId,
      userName: userName || 'System',
      action: AuditAction.UPDATE,
      resource: AuditResource.FIXED_ASSET,
      resourceId: String(asset.id),
      resourceName: `Revalorización AFT: ${asset.assetCode} - ${asset.name}`,
      oldValues: {
        currentValue: oldCurrentValue,
        acquisitionValue: oldAcquisitionValue,
      },
      newValues: {
        currentValue: newCurrentValue,
        acquisitionValue: oldAcquisitionValue,
        revaluationDifference,
        reason: data.reason,
        appraisalReference: data.appraisalReference,
      },
    });

    return {
      asset,
      revaluation: {
        oldValue: oldCurrentValue,
        newValue: newCurrentValue,
        difference: revaluationDifference,
        type: revaluationDifference > 0 ? 'surplus' : 'deficit',
      },
    };
  }

  // ── Transferencia de Activo Fijo entre Entidades (NCC Cuba - Res. 340) ──
  // Transfiere un activo fijo de una entidad a otra
  // Genera comprobantes contables:
  //   Entidad origen: Salida de AFT (crédito cuenta 240)
  //   Entidad destino: Entrada de AFT (débito cuenta 240)
  async transferAsset(
    companyId: number,
    id: number,
    data: {
      targetCompanyId: number;
      reason: string;
      transferDate: string;
      newLocation?: string;
      newResponsiblePerson?: string;
    },
    userName?: string,
  ) {
    const asset = await this.assetRepo.findOneBy({ id, companyId });
    if (!asset) throw new NotFoundException(`Activo fijo #${id} no encontrado`);
    if (asset.status === 'disposed') {
      throw new BadRequestException(`El activo ${asset.assetCode} ya fue dado de baja`);
    }
    if (data.targetCompanyId === companyId) {
      throw new BadRequestException('No se puede transferir un activo a la misma entidad');
    }

    const oldCompanyId = asset.companyId;
    const oldLocation = asset.location;
    const oldResponsiblePerson = asset.responsiblePerson;

    // ── Comprobante contable de salida (entidad origen) ──
    try {
      const currentValue = Number(asset.currentValue);
      await this.voucherService.createVoucherFromModule(
        companyId,
        'fixed-assets',
        String(asset.id),
        {
          date: data.transferDate,
          description: `Transferencia AFT: ${asset.name} (${asset.assetCode}) a entidad ${data.targetCompanyId} - ${data.reason}`,
          type: 'fixed-assets',
          reference: `TRN-OUT-${asset.assetCode}`,
          createdBy: userName || 'Sistema',
          lines: [
            {
              accountCode: '240', // Activos Fijos Tangibles
              debit: 0,
              credit: currentValue,
              description: `Salida AFT ${asset.assetCode} por transferencia`,
            },
          ],
        },
      );
      this.logger.log(`Comprobante de salida AFT ${asset.assetCode} generado`);
    } catch (error) {
      this.logger.error(`Error contabilización salida AFT ${asset.id}: ${error instanceof Error ? error.message : String(error)}`);
      throw new BadRequestException(`Error al generar comprobante de salida: ${error instanceof Error ? error.message : String(error)}`);
    }

    // ── Cambiar companyId del activo ──
    asset.companyId = data.targetCompanyId;
    if (data.newLocation) asset.location = data.newLocation;
    if (data.newResponsiblePerson) asset.responsiblePerson = data.newResponsiblePerson;
    await this.assetRepo.save(asset);

    // ── Comprobante contable de entrada (entidad destino) ──
    try {
      const currentValue = Number(asset.currentValue);
      await this.voucherService.createVoucherFromModule(
        data.targetCompanyId,
        'fixed-assets',
        String(asset.id),
        {
          date: data.transferDate,
          description: `Recepción AFT por transferencia: ${asset.name} (${asset.assetCode}) desde entidad ${companyId} - ${data.reason}`,
          type: 'fixed-assets',
          reference: `TRN-IN-${asset.assetCode}`,
          createdBy: userName || 'Sistema',
          lines: [
            {
              accountCode: '240', // Activos Fijos Tangibles
              debit: currentValue,
              credit: 0,
              description: `Entrada AFT ${asset.assetCode} por transferencia`,
            },
          ],
        },
      );
      this.logger.log(`Comprobante de entrada AFT ${asset.assetCode} generado`);
    } catch (error) {
      this.logger.error(`Error contabilización entrada AFT ${asset.id}: ${error instanceof Error ? error.message : String(error)}`);
      // Revert companyId if accounting fails
      asset.companyId = oldCompanyId;
      if (data.newLocation) asset.location = oldLocation;
      if (data.newResponsiblePerson) asset.responsiblePerson = oldResponsiblePerson;
      await this.assetRepo.save(asset);
      throw new BadRequestException(`Error al generar comprobante de entrada: ${error instanceof Error ? error.message : String(error)}`);
    }

    // ── Auditoría de la transferencia ──
    await this.auditService.log({
      companyId: oldCompanyId,
      userName: userName || 'System',
      action: AuditAction.UPDATE,
      resource: AuditResource.FIXED_ASSET,
      resourceId: String(asset.id),
      resourceName: `Transferencia AFT: ${asset.assetCode} - ${asset.name}`,
      oldValues: {
        companyId: oldCompanyId,
        location: oldLocation,
        responsiblePerson: oldResponsiblePerson,
      },
      newValues: {
        companyId: data.targetCompanyId,
        location: data.newLocation || asset.location,
        responsiblePerson: data.newResponsiblePerson || asset.responsiblePerson,
        reason: data.reason,
      },
    });

    return {
      asset,
      transfer: {
        fromCompanyId: oldCompanyId,
        toCompanyId: data.targetCompanyId,
        transferDate: data.transferDate,
        reason: data.reason,
      },
    };
  }

  async getDepreciationCatalog(companyId: number) {
    const catalog = await this.catalogRepo.find({
      where: { companyId, isActive: true },
      order: { groupNumber: 'ASC', subgroupName: 'ASC' },
    });
    return { catalog };
  }

  private async getDepreciationRateFromCatalog(
    companyId: number,
    groupNumber: number,
    subgroup: string,
  ): Promise<number> {
    const entry = await this.catalogRepo.findOne({
      where: { companyId, groupNumber, subgroupName: subgroup, isActive: true },
    });
    return entry ? Number(entry.depreciationRate) : 0;
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

  async getAccumulatedDepreciationReport(companyId: number, year: number, month: number) {
    const assets = await this.assetRepo.find({ where: { companyId } });
    const report: any[] = [];

    for (const asset of assets) {
      const acquisitionDate = new Date(asset.acquisitionDate);
      const reportDate = new Date(year, month - 1, 1);

      if (reportDate >= acquisitionDate) {
        const monthsElapsed = Math.max(
          0,
          (reportDate.getFullYear() - acquisitionDate.getFullYear()) * 12 +
            (reportDate.getMonth() - acquisitionDate.getMonth()),
        );

        const acqVal = Number(asset.acquisitionValue);
        const depRate = Number(asset.depreciationRate);
        const monthlyDepreciation = (acqVal * (depRate / 100)) / 12;
        const accumulatedDepreciation = Math.min(
          monthlyDepreciation * monthsElapsed,
          acqVal,
        );
        const currentValue = Math.max(acqVal - accumulatedDepreciation, 0);

        report.push({
          assetCode: asset.assetCode,
          name: asset.name,
          groupNumber: asset.groupNumber,
          subgroup: asset.subgroup,
          acquisitionDate: asset.acquisitionDate,
          acquisitionValue: acqVal,
          depreciationRate: depRate,
          monthlyDepreciation,
          monthsElapsed,
          accumulatedDepreciation,
          currentValue,
          status: asset.status,
        });
      }
    }

    // Group by depreciation group for summary
    const catalogEntries = await this.catalogRepo.find({
      where: { companyId, isActive: true },
      order: { groupNumber: 'ASC' },
    });

    // Agrupar catálogo por grupo
    const groupsMap = new Map<number, string>();
    for (const entry of catalogEntries) {
      if (!groupsMap.has(entry.groupNumber)) {
        groupsMap.set(entry.groupNumber, entry.groupName);
      }
    }

    const summary = Array.from(groupsMap.entries()).map(([groupNum, groupName]) => {
      const groupAssets = report.filter((r: any) => r.groupNumber === groupNum);
      const totalAcquisition = groupAssets.reduce((sum: number, a: any) => sum + a.acquisitionValue, 0);
      const totalAccumulated = groupAssets.reduce((sum: number, a: any) => sum + a.accumulatedDepreciation, 0);
      const totalCurrent = groupAssets.reduce((sum: number, a: any) => sum + a.currentValue, 0);

      return {
        groupNumber: groupNum,
        groupName: groupName,
        assetCount: groupAssets.length,
        totalAcquisitionValue: totalAcquisition,
        totalAccumulatedDepreciation: totalAccumulated,
        totalCurrentValue: totalCurrent,
      };
    });

    return {
      year,
      month,
      reportDate: `${year}-${String(month).padStart(2, '0')}-01`,
      details: report,
      summary,
      totals: {
        totalAssets: report.length,
        totalAcquisitionValue: report.reduce((sum, a) => sum + a.acquisitionValue, 0),
        totalAccumulatedDepreciation: report.reduce((sum, a) => sum + a.accumulatedDepreciation, 0),
        totalCurrentValue: report.reduce((sum, a) => sum + a.currentValue, 0),
      },
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
        this.logger.error(`Error contabilización depreciación: ${error instanceof Error ? error.message : String(error)}`);
        throw new BadRequestException(
          `Error al generar comprobante contable de depreciación: ${error instanceof Error ? error.message : String(error)}`,
        );
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
