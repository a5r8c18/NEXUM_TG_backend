import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { FixedAsset } from '../entities/fixed-asset.entity';
import { DepreciationHistory } from '../entities/depreciation-history.entity';
import { Supplier } from '../entities/supplier.entity';
import { VoucherService } from '../accounting/voucher.service';
import { AccountMappingService } from '../accounting/account-mapping.service';
import { MappingType } from '../entities/account-mapping.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditResource } from '../entities/audit-log.entity';
import { DepreciationCatalog } from '../entities/depreciation-catalog.entity';
import { FixedAssetInventory } from '../entities/fixed-asset-inventory.entity';
import { Employee } from '../entities/employee.entity';
import { FinanceService } from '../finance/finance.service';

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
    @InjectRepository(FixedAssetInventory)
    private readonly inventoryRepo: Repository<FixedAssetInventory>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Supplier)
    private readonly supplierRepo: Repository<Supplier>,
    @Inject(forwardRef(() => FinanceService))
    private readonly financeService: FinanceService,
    private readonly accountMappingService: AccountMappingService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
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
      employeeId?: string;
      costCenterId?: string;
      supplierId?: string;
    },
  ) {
    const depRate = await this.getDepreciationRateFromCatalog(companyId, data.groupNumber, data.subgroup);
    if (depRate == null || depRate <= 0) {
      throw new BadRequestException(
        `El subgrupo ${data.subgroup} del grupo ${data.groupNumber} no tiene una tasa de depreciación válida en el catálogo. Configure el catálogo antes de registrar el activo.`,
      );
    }

    let responsiblePerson = data.responsiblePerson || '';
    if (data.employeeId) {
      const employee = await this.employeeRepo.findOne({
        where: { id: data.employeeId, companyId },
      });
      if (employee) {
        responsiblePerson = `${employee.firstName} ${employee.lastName}`.trim();
      }
    }

    let supplierName = 'Proveedor AFT';
    let supplierNit = 'N/D';
    if (data.supplierId) {
      const supplier = await this.supplierRepo.findOne({
        where: { id: data.supplierId, companyId },
      });
      if (supplier) {
        supplierName = supplier.businessName;
        supplierNit = supplier.nit;
      }
    }

    const result = await this.dataSource.transaction(async (manager) => {
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
      asset.responsiblePerson = responsiblePerson;
      asset.employeeId = data.employeeId || null;
      asset.supplierId = data.supplierId || null;
      asset.depreciationRate = depRate;
      asset.currentValue = data.acquisitionValue;
      asset.accumulatedDepreciation = 0;
      asset.status = 'active';
      await manager.getRepository(FixedAsset).save(asset);

      // ── Registro en inventario AFT ──
      await this.upsertFixedAssetInventory(asset, undefined, manager);

      // ── Contabilización de adquisición de activo fijo ──
      const acquisitionValue = Number(asset.acquisitionValue);
      if (acquisitionValue > 0) {
        try {
          const assetAccount =
            (await this.accountMappingService.getAccountForMapping(
              companyId,
              MappingType.FIXED_ASSET_ACQUISITION,
            )) || '240';
          const payableAccount =
            (await this.accountMappingService.getAccountForMapping(
              companyId,
              MappingType.PURCHASE_ORDER,
            )) || '410';

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
                  accountCode: assetAccount, // Activos Fijos Tangibles
                  debit: acquisitionValue,
                  credit: 0,
                  description: `Alta AFT ${asset.assetCode}`,
                },
                {
                  accountCode: payableAccount, // Cuentas por Pagar
                  debit: 0,
                  credit: acquisitionValue,
                  description: `Obligación por adquisición AFT`,
                },
              ],
            },
            manager,
          );

          // ── Cuenta por Pagar asociada a la adquisición ──
          const dueDate = new Date(asset.acquisitionDate);
          dueDate.setDate(dueDate.getDate() + 30);

          await this.financeService.createPayable(companyId, {
            purchaseNumber: asset.assetCode,
            supplierName,
            supplierNit,
            supplierId: data.supplierId || undefined,
            originalAmount: acquisitionValue,
            dueDate: dueDate.toISOString().split('T')[0],
            status: 'pending',
            currency: 'CUP',
            notes: `CxP generada por adquisición AFT ${asset.assetCode} - ${asset.name}`,
          }, manager);
        } catch (error) {
          this.logger.error(`Error contabilización/finanzas AFT ${asset.id}: ${error instanceof Error ? error.message : String(error)}`);
          // El comprobante de adquisición AFT es parte de la operación; si no se
          // puede generar el borrador contable, no debe quedar registrado.
          throw new BadRequestException(`Error al contabilizar adquisición AFT: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      return { asset };
    });

    // ── Auditoría de creación ──
    await this.auditService.log({
      companyId,
      userName: 'Sistema',
      action: AuditAction.CREATE,
      resource: AuditResource.FIXED_ASSET,
      resourceId: String(result.asset.id),
      resourceName: `Alta AFT: ${result.asset.assetCode} - ${result.asset.name}`,
      oldValues: undefined,
      newValues: {
        assetCode: result.asset.assetCode,
        name: result.asset.name,
        acquisitionValue: result.asset.acquisitionValue,
        depreciationRate: result.asset.depreciationRate,
      },
    });

    return result;
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
      costCenterId?: string | null;
      employeeId?: string | null;
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
      employeeId: asset.employeeId,
    };

    if (data.name !== undefined) asset.name = data.name;
    if (data.description !== undefined) asset.description = data.description;
    if (data.location !== undefined) asset.location = data.location;
    if (data.status !== undefined) asset.status = data.status;

    if (data.employeeId !== undefined) {
      if (data.employeeId) {
        const employee = await this.employeeRepo.findOne({
          where: { id: data.employeeId, companyId },
        });
        if (employee) {
          asset.employeeId = data.employeeId;
          asset.responsiblePerson = `${employee.firstName} ${employee.lastName}`.trim();
        }
      } else {
        asset.employeeId = null;
        if (data.responsiblePerson !== undefined) {
          asset.responsiblePerson = data.responsiblePerson;
        }
      }
    } else if (data.responsiblePerson !== undefined) {
      asset.responsiblePerson = data.responsiblePerson;
    }

    if (data.costCenterId !== undefined) {
      asset.costCenterId = data.costCenterId || null;
    }

    const saved = await this.assetRepo.save(asset);

    // ── Sincronizar inventario AFT ──
    await this.upsertFixedAssetInventory(saved);

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
        employeeId: saved.employeeId,
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
      bankAccountId?: string;
      saleAmount?: number;
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
    const accumulatedDepreciation = Number(asset.accumulatedDepreciation);
    const residualLoss = currentValue; // Valor no depreciado = pérdida

    const oldStatus = asset.status;
    asset.status = 'disposed';
    asset.currentValue = 0;
    asset.accumulatedDepreciation = acquisitionValue;
    await this.assetRepo.save(asset);

    // ── Comprobante contable de baja ──
    if (acquisitionValue > 0) {
      try {
        const assetAccount =
          (await this.accountMappingService.getAccountForMapping(
            companyId,
            MappingType.FIXED_ASSET_ACQUISITION,
          )) || '240';
        const accumulatedDepreciationAccount =
          (await this.accountMappingService.getAccountForMapping(
            companyId,
            MappingType.FIXED_ASSET_ACCUMULATED_DEPRECIATION,
          )) || '375';

        const lines: Array<{
          accountCode: string;
          debit: number;
          credit: number;
          description: string;
        }> = [];

        // Débito: Depreciación Acumulada por lo ya depreciado
        if (accumulatedDepreciation > 0) {
          lines.push({
            accountCode: accumulatedDepreciationAccount,
            debit: accumulatedDepreciation,
            credit: 0,
            description: `Dep. acumulada baja AFT ${asset.assetCode}`,
          });
        }

        if (data.disposalType === 'venta') {
          const saleAmount = data.saleAmount ?? currentValue;
          const bookValue = currentValue;
          const gainOrLoss = saleAmount - bookValue;

          // Débito: Cuenta por Cobrar / Banco por el importe de venta
          const proceedsAccount = data.bankAccountId
            ? (await this.accountMappingService.getAccountForMapping(
                companyId,
                MappingType.PAYROLL_CASH,
              )) || '110'
            : (await this.accountMappingService.getAccountForMapping(
                companyId,
                MappingType.FIXED_ASSET_SALE_PROCEEDS,
              )) || '135';
          lines.push({
            accountCode: proceedsAccount,
            debit: saleAmount,
            credit: 0,
            description: `Importe venta AFT ${asset.assetCode}`,
          });

          // Ganancia o Pérdida
          if (gainOrLoss > 0) {
            const gainAccount =
              (await this.accountMappingService.getAccountForMapping(
                companyId,
                MappingType.FIXED_ASSET_DISPOSAL_GAIN,
              )) || '950';
            lines.push({
              accountCode: gainAccount,
              debit: 0,
              credit: gainOrLoss,
              description: `Ganancia venta AFT ${asset.assetCode}`,
            });
          } else if (gainOrLoss < 0) {
            const lossAccount =
              (await this.accountMappingService.getAccountForMapping(
                companyId,
                MappingType.FIXED_ASSET_DISPOSAL_LOSS,
              )) || '845';
            lines.push({
              accountCode: lossAccount,
              debit: Math.abs(gainOrLoss),
              credit: 0,
              description: `Pérdida venta AFT ${asset.assetCode}`,
            });
          }
        } else {
          // Débito: Faltantes y Pérdidas de AFT por valor residual
          if (residualLoss > 0) {
            const lossAccount =
              (await this.accountMappingService.getAccountForMapping(
                companyId,
                MappingType.FIXED_ASSET_DISPOSAL_LOSS,
              )) || '845';
            lines.push({
              accountCode: lossAccount,
              debit: residualLoss,
              credit: 0,
              description: `Pérdida AFT ${asset.assetCode} - ${data.reason}`,
            });
          }
        }

        // Crédito: Activos Fijos Tangibles por valor total de adquisición
        lines.push({
          accountCode: assetAccount,
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

    // ── Registro financiero por venta de AFT ──
    if (data.disposalType === 'venta') {
      const saleAmount = data.saleAmount ?? currentValue;
      const saleDate = new Date(disposalDate);
      const dueDate = new Date(saleDate);
      dueDate.setDate(dueDate.getDate() + 30);

      if (data.bankAccountId) {
        try {
          await this.financeService.createBankTransaction(companyId, {
            bankAccountId: data.bankAccountId,
            transactionNumber: `TXB-AFT-VENTA-${asset.assetCode}-${Date.now()}`,
            transactionDate: disposalDate,
            transactionType: 'credit',
            amount: saleAmount,
            description: `Venta de AFT ${asset.assetCode} - ${asset.name}`,
            referenceNumber: `BAJA-${asset.assetCode}`,
            category: 'fixed-asset-sale',
            counterpartyName: asset.responsiblePerson,
          });
          this.logger.log(`Transacción bancaria por venta AFT ${asset.assetCode} generada`);
        } catch (error) {
          this.logger.error(`Error transacción bancaria venta AFT ${asset.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        // Venta a crédito: generar Cuenta por Cobrar
        try {
          await this.financeService.createReceivable(companyId, {
            invoiceNumber: `AFT-VENTA-${asset.assetCode}`,
            customerName: asset.responsiblePerson || 'Cliente AFT',
            originalAmount: saleAmount,
            dueDate: dueDate.toISOString().split('T')[0],
            status: 'pending',
            currency: 'CUP',
            notes: `Cuenta por cobrar generada por venta de AFT ${asset.assetCode} - ${asset.name}`,
          });
          this.logger.log(`Cuenta por cobrar por venta AFT ${asset.assetCode} generada`);
        } catch (error) {
          this.logger.error(`Error cuenta por cobrar venta AFT ${asset.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    // ── Actualizar inventario AFT como dado de baja ──
    await this.upsertFixedAssetInventory(asset, 'disposed');

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
    const oldAccumulatedDepreciation = Number(asset.accumulatedDepreciation);

    // Ajustar valor bruto y valor contable conservando la coherencia contable.
    asset.acquisitionValue = Math.max(0, oldAcquisitionValue + revaluationDifference);
    asset.currentValue = Math.max(0, newCurrentValue);
    if (asset.currentValue === 0) {
      asset.accumulatedDepreciation = Math.min(asset.acquisitionValue, oldAccumulatedDepreciation);
    } else {
      // Recalibrar depreciación acumulada para que currentValue = acquisitionValue - accumulated.
      asset.accumulatedDepreciation = Math.min(
        asset.acquisitionValue,
        Math.max(0, asset.acquisitionValue - asset.currentValue),
      );
    }
    await this.assetRepo.save(asset);

    // ── Comprobante contable de revalorización ──
    try {
      const assetAccount =
        (await this.accountMappingService.getAccountForMapping(
          companyId,
          MappingType.FIXED_ASSET_ACQUISITION,
        )) || '240';

      const lines: Array<{
        accountCode: string;
        debit: number;
        credit: number;
        description: string;
      }> = [];

      if (revaluationDifference > 0) {
        // Superávit de revalorización
        lines.push({
          accountCode: assetAccount, // Activos Fijos Tangibles
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
          accountCode: assetAccount, // Activos Fijos Tangibles
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
      newEmployeeId?: string;
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
    const oldEmployeeId = asset.employeeId;
    const oldResponsiblePerson = asset.responsiblePerson;

    // ── Comprobante contable de salida (entidad origen) ──
    let assetAccount: string;
    let accumulatedDepreciationAccount: string = '375';
    let transferAccount: string = '699';
    try {
      const acquisitionValue = Number(asset.acquisitionValue);
      const currentValue = Number(asset.currentValue);
      const accumulatedDepreciation = acquisitionValue - currentValue;

      assetAccount =
        (await this.accountMappingService.getAccountForMapping(
          companyId,
          MappingType.FIXED_ASSET_ACQUISITION,
        )) || '240';
      accumulatedDepreciationAccount =
        (await this.accountMappingService.getAccountForMapping(
          companyId,
          MappingType.FIXED_ASSET_ACCUMULATED_DEPRECIATION,
        )) || '375';
      transferAccount =
        (await this.accountMappingService.getAccountForMapping(
          companyId,
          MappingType.FIXED_ASSET_TRANSFER,
        )) || '699';

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
              accountCode: transferAccount,
              debit: currentValue,
              credit: 0,
              description: `Cuenta puente traspaso AFT ${asset.assetCode}`,
            },
            {
              accountCode: accumulatedDepreciationAccount,
              debit: accumulatedDepreciation,
              credit: 0,
              description: `Dep. acumulada AFT ${asset.assetCode} transferida`,
            },
            {
              accountCode: assetAccount,
              debit: 0,
              credit: acquisitionValue,
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

    // ── Cambiar companyId y responsable del activo ──
    asset.companyId = data.targetCompanyId;
    if (data.newLocation) asset.location = data.newLocation;
    if (data.newEmployeeId) {
      const newEmployee = await this.employeeRepo.findOne({
        where: { id: data.newEmployeeId, companyId: data.targetCompanyId },
      });
      if (newEmployee) {
        asset.employeeId = data.newEmployeeId;
        asset.responsiblePerson = `${newEmployee.firstName} ${newEmployee.lastName}`.trim();
      }
    } else if (data.newResponsiblePerson) {
      asset.responsiblePerson = data.newResponsiblePerson;
    }
    await this.assetRepo.save(asset);

    // ── Comprobante contable de entrada (entidad destino) ──
    try {
      const acquisitionValue = Number(asset.acquisitionValue);
      const currentValue = Number(asset.currentValue);
      const accumulatedDepreciation = acquisitionValue - currentValue;

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
              accountCode: assetAccount,
              debit: acquisitionValue,
              credit: 0,
              description: `Entrada AFT ${asset.assetCode} por transferencia`,
            },
            {
              accountCode: accumulatedDepreciationAccount,
              debit: 0,
              credit: accumulatedDepreciation,
              description: `Dep. acumulada AFT ${asset.assetCode} recibida`,
            },
            {
              accountCode: transferAccount,
              debit: 0,
              credit: currentValue,
              description: `Cuenta puente traspaso AFT ${asset.assetCode}`,
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
      asset.employeeId = oldEmployeeId;
      asset.responsiblePerson = oldResponsiblePerson;
      await this.assetRepo.save(asset);
      throw new BadRequestException(`Error al generar comprobante de entrada: ${error instanceof Error ? error.message : String(error)}`);
    }

    // ── Actualizar inventario AFT en ambas entidades ──
    await this.upsertFixedAssetInventory({ ...asset, companyId: oldCompanyId, status: 'transferred' } as FixedAsset);
    await this.upsertFixedAssetInventory(asset);

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
        employeeId: oldEmployeeId,
      },
      newValues: {
        companyId: data.targetCompanyId,
        location: data.newLocation || asset.location,
        responsiblePerson: asset.responsiblePerson,
        employeeId: asset.employeeId,
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

  // ── Sincronizar Registro de Inventario de AFT ──
  private async upsertFixedAssetInventory(asset: FixedAsset, overrideStatus?: 'active' | 'disposed' | 'transferred' | 'fully_depreciated', manager?: EntityManager) {
    try {
      const inventoryRepo = manager ? manager.getRepository(FixedAssetInventory) : this.inventoryRepo;
      const existing = await inventoryRepo.findOne({
        where: { assetId: asset.id, companyId: asset.companyId },
        order: { createdAt: 'DESC' },
      });

      const acquisitionValue = Number(asset.acquisitionValue);
      const currentValue = Number(asset.currentValue);
      const accumulatedDepreciation = Number(asset.accumulatedDepreciation);
      const usefulLifeYears = asset.depreciationRate > 0 ? 100 / asset.depreciationRate : null;
      const reportDate = new Date();

      // Vida útil restante en meses, basada en el valor contable actual y la tasa.
      const annualDepreciation =
        usefulLifeYears && acquisitionValue > 0
          ? acquisitionValue / usefulLifeYears
          : 0;
      const remainingUsefulLife =
        annualDepreciation > 0
          ? Math.max(0, Math.round(currentValue / annualDepreciation * 12))
          : null;

      const inventoryData = {
        assetId: asset.id,
        companyId: asset.companyId,
        reportDate,
        assetCode: asset.assetCode,
        name: asset.name,
        groupNumber: asset.groupNumber,
        subgroup: asset.subgroup || '',
        subgroupDetail: asset.subgroupDetail || null,
        acquisitionDate: new Date(asset.acquisitionDate),
        acquisitionValue,
        depreciationRate: asset.depreciationRate,
        accumulatedDepreciation,
        currentBookValue: currentValue,
        location: asset.location || null,
        responsiblePerson: asset.responsiblePerson || null,
        status: overrideStatus || (asset.status as any) || 'active',
        usefulLifeYears: usefulLifeYears ? Math.round(usefulLifeYears) : null,
        remainingUsefulLife,
      };

      if (existing) {
        Object.assign(existing, inventoryData);
        await inventoryRepo.save(existing);
      } else {
        const record = inventoryRepo.create(inventoryData);
        await inventoryRepo.save(record);
      }
    } catch (error) {
      this.logger.error(`Error sincronizando inventario AFT ${asset.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
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
    includeProcessed: boolean = false,
  ) {
    const assets = await this.assetRepo.find({
      where: { companyId, status: 'active' },
    });

    // Idempotencia: evitar duplicar meses ya procesados salvo que se fuerce.
    const processedIds = includeProcessed
      ? new Set<number>()
      : new Set<number>(
          (
            await this.depreciationHistoryRepo.find({
              where: { companyId, year, month },
              select: ['assetId'],
            })
          ).map((h) => h.assetId),
        );

    const depreciationRecords: any[] = [];

    for (const asset of assets) {
      if (processedIds.has(asset.id)) continue;

      const acquisitionDate = new Date(asset.acquisitionDate);
      const currentDate = new Date(year, month - 1, 1);

      if (currentDate < acquisitionDate) continue;

      const acqVal = Number(asset.acquisitionValue);
      const depRate = Number(asset.depreciationRate);
      const monthlyDepreciation = (acqVal * (depRate / 100)) / 12;
      const previousAccumulated = Number(asset.accumulatedDepreciation || 0);
      const newAccumulated = Math.min(
        previousAccumulated + monthlyDepreciation,
        acqVal,
      );
      const realMonthlyDepreciation = Math.min(
        newAccumulated - previousAccumulated,
        acqVal,
      );
      const currentValue = Math.max(acqVal - newAccumulated, 0);

      if (realMonthlyDepreciation <= 0 && currentValue <= 0) continue;

      depreciationRecords.push({
        assetId: asset.id,
        assetCode: asset.assetCode,
        assetName: asset.name,
        month,
        year,
        monthlyDepreciation: realMonthlyDepreciation,
        accumulatedDepreciation: newAccumulated,
        currentValue,
        depreciationRate: depRate,
      });
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
    const newRecords = result.records;

    if (newRecords.length === 0) {
      return { message: `Depreciación ${month}/${year} ya fue procesada o no aplica`, voucher: null };
    }

    const totalDepreciation = newRecords.reduce(
      (sum, r) => sum + Number(r.monthlyDepreciation),
      0,
    );

    // Cargar activos con centro de costo para enrutar el gasto
    const assetsWithCostCenter = await this.assetRepo.find({
      where: { id: In(newRecords.map((r) => r.assetId)), companyId },
      relations: ['costCenter'],
    });
    const assetCostCenterMap = new Map(
      assetsWithCostCenter.map((a) => [a.id, a]),
    );

    let voucher: any = null;

    // ── Contabilización de depreciación mensual por centro de costo ──
    if (totalDepreciation > 0) {
      try {
        const accumulatedDepreciationAccount =
          (await this.accountMappingService.getAccountForMapping(
            companyId,
            MappingType.FIXED_ASSET_ACCUMULATED_DEPRECIATION,
          )) || '375';

        const [prodDepAccount, assocDepAccount, adminDepAccount] =
          await Promise.all([
            this.accountMappingService.getAccountForMapping(
              companyId,
              MappingType.FIXED_ASSET_DEPRECIATION_PRODUCTION,
            ),
            this.accountMappingService.getAccountForMapping(
              companyId,
              MappingType.FIXED_ASSET_DEPRECIATION_ASSOCIATED,
            ),
            this.accountMappingService.getAccountForMapping(
              companyId,
              MappingType.FIXED_ASSET_DEPRECIATION_ADMINISTRATIVE,
            ),
          ]);

        const expenseByAccountAndCC = new Map<string, { amount: number; costCenterId?: string }>();
        for (const record of newRecords) {
          const asset = assetCostCenterMap.get(record.assetId);
          const costCenterType = asset?.costCenter?.type;
          let accountCode: string;
          if (costCenterType === 'production') {
            accountCode = prodDepAccount || '700-0020';
          } else if (costCenterType === 'associated') {
            accountCode = assocDepAccount || '731';
          } else {
            accountCode = adminDepAccount || '822';
          }
          const costCenterId = asset?.costCenterId || undefined;
          const key = `${accountCode}#${costCenterId || ''}`;
          const existing = expenseByAccountAndCC.get(key) || { amount: 0, costCenterId };
          existing.amount += Number(record.monthlyDepreciation);
          expenseByAccountAndCC.set(key, existing);
        }

        const lines: any[] = [];
        for (const [accountCode, { amount, costCenterId }] of expenseByAccountAndCC.entries()) {
          lines.push({
            accountCode,
            debit: amount,
            credit: 0,
            description: `Depreciación ${month}/${year}`,
            costCenterId,
            subelement: '70100',
          });
        }

        lines.push({
          accountCode: accumulatedDepreciationAccount,
          debit: 0,
          credit: totalDepreciation,
          description: `Dep. acumulada ${month}/${year}`,
        });

        voucher = await this.voucherService.createVoucherFromModule(
          companyId,
          'fixed-assets',
          `DEP-${year}-${String(month).padStart(2, '0')}`,
          {
            date: `${year}-${String(month).padStart(2, '0')}-28`,
            description: `Depreciación mensual ${month}/${year} (${newRecords.length} activos)`,
            type: 'fixed-assets',
            reference: `DEP-${year}-${String(month).padStart(2, '0')}`,
            createdBy: 'Sistema',
            lines,
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

    // Update asset current values and persist history
    for (const record of newRecords) {
      const asset = await this.assetRepo.findOneBy({
        id: record.assetId,
        companyId,
      });
      if (asset) {
        asset.currentValue = record.currentValue;
        asset.accumulatedDepreciation = record.accumulatedDepreciation;
        await this.assetRepo.save(asset);

        const history = new DepreciationHistory();
        history.companyId = companyId;
        history.assetId = asset.id;
        history.year = year;
        history.month = month;
        history.monthlyDepreciation = record.monthlyDepreciation;
        history.accumulatedDepreciation = record.accumulatedDepreciation;
        history.currentValue = record.currentValue;
        history.depreciationRate = record.depreciationRate;
        history.voucherReference = voucher?.reference ?? `DEP-${year}-${String(month).padStart(2, '0')}`;
        history.status = 'processed';
        await this.depreciationHistoryRepo.save(history);

        await this.upsertFixedAssetInventory(asset);
      }
    }

    return {
      message: `Depreciación procesada para ${newRecords.length} activos`,
      totalDepreciation,
      voucher,
    };
  }
}
