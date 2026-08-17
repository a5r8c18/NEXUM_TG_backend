import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { FixedAsset } from '../entities/fixed-asset.entity';
import { FixedAssetArea } from '../entities/fixed-asset-area.entity';
import { DepreciationCatalog } from '../entities/depreciation-catalog.entity';
import { DepreciationHistory } from '../entities/depreciation-history.entity';
import { FixedAssetInventory } from '../entities/fixed-asset-inventory.entity';
import { Employee } from '../entities/employee.entity';
import { Supplier } from '../entities/supplier.entity';
import { CostCenter } from '../entities/cost-center.entity';
import { mockDepreciationCatalog } from '../shared/mock-data';
import { VoucherService } from '../accounting/voucher.service';
import { AccountMappingService } from '../accounting/account-mapping.service';
import { MappingType } from '../entities/account-mapping.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditResource } from '../entities/audit-log.entity';
import { FinanceService } from '../finance/finance.service';

@Injectable()
export class FixedAssetsService {
  private readonly logger = new Logger(FixedAssetsService.name);

  constructor(
    @Inject(forwardRef(() => VoucherService))
    private readonly voucherService: VoucherService,
    @InjectRepository(FixedAsset)
    private readonly assetRepo: Repository<FixedAsset>,
    @InjectRepository(FixedAssetArea)
    private readonly areaRepo: Repository<FixedAssetArea>,
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
    @InjectRepository(CostCenter)
    private readonly costCenterRepo: Repository<CostCenter>,
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
      acquisitionType?: 'compra' | 'donacion' | 'sobrante';
      location?: string;
      areaId?: number;
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
    if (data.costCenterId) {
      const costCenter = await this.getCostCenterWithExpenseAccount(
        companyId,
        data.costCenterId,
      );
      if (costCenter) {
        responsiblePerson = costCenter.expenseAccountCode || '';
      }
    } else if (data.employeeId) {
      const employee = await this.employeeRepo.findOne({
        where: { id: data.employeeId, companyId },
      });
      if (employee) {
        responsiblePerson = `${employee.firstName} ${employee.lastName}`.trim();
      }
    }

    const acquisitionType = data.acquisitionType || 'compra';

    let supplierName = 'Proveedor AFT';
    let supplierNit = 'N/D';
    let accountingWarning: string | null = null;
    if (data.supplierId) {
      const supplier = await this.supplierRepo.findOne({
        where: { id: data.supplierId, companyId },
      });
      if (supplier) {
        supplierName = supplier.businessName;
        supplierNit = supplier.nit;
      } else {
        accountingWarning = `Proveedor ${data.supplierId} no encontrado; se usará proveedor genérico.`;
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
      asset.acquisitionType = acquisitionType;
      asset.areaId = data.areaId || null;
      asset.location = data.location || '';
      asset.responsiblePerson = responsiblePerson;
      asset.employeeId = data.employeeId || null;
      asset.costCenterId = data.costCenterId || null;
      asset.supplierId = data.supplierId || null;
      asset.depreciationRate = depRate;
      asset.currentValue = data.acquisitionValue;
      asset.accumulatedDepreciation = 0;
      asset.status = 'active';
      if (acquisitionType === 'sobrante') {
        // El sobrante queda acreditado en 555 hasta que el usuario resuelva la
        // investigación (no se reconoce ingreso de forma automática).
        asset.investigationType = 'surplus';
        asset.investigationStatus = 'pending';
        asset.investigationAmount = data.acquisitionValue;
      }
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
          // ── Contrapartida según el concepto de alta ──
          let counterpartAccount: string;
          let counterpartDescription: string;
          if (acquisitionType === 'donacion') {
            counterpartAccount =
              (await this.accountMappingService.getAccountForMapping(
                companyId,
                MappingType.FIXED_ASSET_DONATION_RECEIVED,
              )) || '620';
            counterpartDescription = 'Donación recibida de AFT';
          } else if (acquisitionType === 'sobrante') {
            counterpartAccount =
              (await this.accountMappingService.getAccountForMapping(
                companyId,
                MappingType.INVENTORY_SURPLUS_INVESTIGATION,
              )) || '555';
            counterpartDescription = 'Sobrante de AFT en investigación';
          } else {
            counterpartAccount =
              (await this.accountMappingService.getAccountForMapping(
                companyId,
                MappingType.PURCHASE_ORDER,
              )) || '410';
            counterpartDescription = 'Obligación por compra de AFT';
          }

          await this.voucherService.createVoucherFromModule(
            companyId,
            'fixed-assets',
            String(asset.id),
            {
              date: asset.acquisitionDate || new Date().toISOString().split('T')[0],
              description: `${this.getAcquisitionTypeLabel(acquisitionType)}: ${asset.name} (${asset.assetCode})`,
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
                  accountCode: counterpartAccount,
                  debit: 0,
                  credit: acquisitionValue,
                  description: counterpartDescription,
                },
              ],
            },
            manager,
          );

          // ── Cuenta por Pagar sólo cuando el alta es por compra ──
          if (acquisitionType === 'compra') {
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
              notes: `CxP generada por compra de AFT ${asset.assetCode} - ${asset.name}`,
            }, manager);
          }
        } catch (error) {
          this.logger.error(`Error contabilización/finanzas AFT ${asset.id}: ${error instanceof Error ? error.message : String(error)}`);
          // El comprobante de adquisición AFT es parte de la operación; si no se
          // puede generar el borrador contable, no debe quedar registrado.
          throw new BadRequestException(`Error al contabilizar adquisición AFT: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      return { asset, accountingWarning };
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

    return { ...result, accountingWarning };
  }

  async update(
    companyId: number,
    id: number,
    data: {
      name?: string;
      description?: string;
      location?: string;
      areaId?: number | null;
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
    if (data.areaId !== undefined) asset.areaId = data.areaId;
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
      }
    }

    if (data.costCenterId !== undefined) {
      asset.costCenterId = data.costCenterId || null;
      if (data.costCenterId) {
        const costCenter = await this.getCostCenterWithExpenseAccount(
          companyId,
          data.costCenterId,
        );
        asset.responsiblePerson = costCenter?.expenseAccountCode || '';
      }
    } else if (data.responsiblePerson !== undefined) {
      asset.responsiblePerson = data.responsiblePerson;
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
      disposalType:
        | 'faltante'
        | 'deterioro'
        | 'venta'
        | 'devolucion_compra'
        | 'obsolescencia'
        | 'rotura'
        | 'donacion';
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
    asset.disposalType = data.disposalType;
    asset.disposalDate = disposalDate;
    asset.disposalReason = data.reason;
    if (data.disposalType === 'faltante' && residualLoss > 0) {
      // El faltante queda debitado en 332 hasta que el usuario resuelva la
      // investigación (cobro al responsable o pérdida definitiva).
      asset.investigationType = 'shortage';
      asset.investigationStatus = 'pending';
      asset.investigationAmount = residualLoss;
    }
    await this.assetRepo.save(asset);

    // ── Devolución de compra: determinar cuánto sigue debiéndose al proveedor ──
    // Si la compra ya fue pagada (total o parcialmente), la parte pagada no
    // puede reducir la CxP: nace un derecho de cobro frente al proveedor.
    let returnPayable: { id: string; apNumber: string; balance: number } | null = null;
    let returnSplit: { pendingPart: number; paidPart: number } | null = null;
    if (data.disposalType === 'devolucion_compra') {
      try {
        const payables = await this.financeService.findAllPayables(companyId);
        const payable = payables.find(
          (p) => p.purchaseNumber === asset.assetCode && p.status !== 'cancelled',
        );
        if (payable) {
          returnPayable = {
            id: payable.id,
            apNumber: payable.apNumber,
            balance: Number(payable.balanceAmount || 0),
          };
        }
      } catch (error) {
        this.logger.error(`Error consultando CxP de AFT ${asset.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

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
        } else if (data.disposalType === 'faltante') {
          // Débito: Faltantes de Bienes en Investigación por el valor neto
          if (residualLoss > 0) {
            const shortageAccount =
              (await this.accountMappingService.getAccountForMapping(
                companyId,
                MappingType.INVENTORY_SHORTAGE_INVESTIGATION,
              )) || '332';
            lines.push({
              accountCode: shortageAccount,
              debit: residualLoss,
              credit: 0,
              description: `Faltante de AFT ${asset.assetCode} en investigación`,
            });
          }
        } else if (data.disposalType === 'devolucion_compra') {
          if (residualLoss > 0) {
            // Parte aún no pagada → revierte la obligación (410).
            // Parte ya pagada → derecho de cobro al proveedor (335).
            const pendingPart = returnPayable
              ? Math.min(residualLoss, returnPayable.balance)
              : residualLoss;
            const paidPart = Math.max(0, residualLoss - pendingPart);

            if (pendingPart > 0) {
              const payableAccount =
                (await this.accountMappingService.getAccountForMapping(
                  companyId,
                  MappingType.PURCHASE_ORDER,
                )) || '410';
              lines.push({
                accountCode: payableAccount,
                debit: pendingPart,
                credit: 0,
                description: `Devolución de compra de AFT ${asset.assetCode} (obligación pendiente)`,
              });
            }
            if (paidPart > 0) {
              const receivableAccount =
                (await this.accountMappingService.getAccountForMapping(
                  companyId,
                  MappingType.INVENTORY_SHORTAGE_RECEIVABLE,
                )) || '335';
              lines.push({
                accountCode: receivableAccount,
                debit: paidPart,
                credit: 0,
                description: `Cobro al proveedor por devolución de AFT ${asset.assetCode} (importe ya pagado)`,
              });
            }
            returnSplit = { pendingPart, paidPart };
          }
        } else if (data.disposalType === 'donacion') {
          // Débito: Donaciones Entregadas por el valor neto
          if (residualLoss > 0) {
            const donationAccount =
              (await this.accountMappingService.getAccountForMapping(
                companyId,
                MappingType.FIXED_ASSET_DONATION_DELIVERED,
              )) || '626';
            lines.push({
              accountCode: donationAccount,
              debit: residualLoss,
              credit: 0,
              description: `Donación entregada de AFT ${asset.assetCode}`,
            });
          }
        } else {
          // Deterioro / obsolescencia / rotura → Faltantes y Pérdidas de AFT
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
            description: `${this.getDisposalTypeLabel(data.disposalType)}: ${asset.name} (${asset.assetCode}) - ${data.reason}`,
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
        asset.accumulatedDepreciation = accumulatedDepreciation;
        asset.disposalType = null;
        asset.disposalDate = null;
        asset.disposalReason = null;
        asset.investigationType = null;
        asset.investigationStatus = null;
        asset.investigationAmount = null;
        await this.assetRepo.save(asset);
        throw new BadRequestException(`Error al generar comprobante contable: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // ── Devolución de compra: ajustar CxP y, si ya se pagó, generar CxC ──
    if (data.disposalType === 'devolucion_compra' && returnSplit) {
      const { pendingPart, paidPart } = returnSplit;

      if (returnPayable && pendingPart > 0) {
        try {
          const newBalance = Math.max(0, returnPayable.balance - pendingPart);
          await this.financeService.updatePayable(companyId, returnPayable.id, {
            status: newBalance > 0 ? 'partial' : 'cancelled',
            balanceAmount: newBalance,
            notes: `Ajustada por devolución de compra AFT ${asset.assetCode}`,
          });
          this.logger.log(`CxP ${returnPayable.apNumber} ajustada por devolución AFT ${asset.assetCode}`);
        } catch (error) {
          this.logger.error(`Error ajustando CxP por devolución AFT ${asset.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      if (paidPart > 0) {
        try {
          const dueDate = new Date(disposalDate);
          dueDate.setDate(dueDate.getDate() + 30);
          let supplierLabel = 'Proveedor AFT';
          if (asset.supplierId) {
            const supplier = await this.supplierRepo.findOne({
              where: { id: asset.supplierId, companyId },
            });
            if (supplier) supplierLabel = supplier.businessName;
          }
          await this.financeService.createReceivable(companyId, {
            invoiceNumber: `AFT-DEVOL-${asset.assetCode}`,
            customerName: supplierLabel,
            originalAmount: paidPart,
            dueDate: dueDate.toISOString().split('T')[0],
            status: 'pending',
            currency: 'CUP',
            notes: `CxC al proveedor por devolución de AFT ${asset.assetCode} ya pagado`,
          });
          this.logger.log(`CxC por devolución AFT ${asset.assetCode} generada (${paidPart})`);
        } catch (error) {
          this.logger.error(`Error CxC por devolución AFT ${asset.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
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

    // ── Acciones que la norma deja a criterio del contador ──
    // No se automatizan: se informan para que el usuario las registre.
    const pendingActions: string[] = [];
    if (data.disposalType === 'venta') {
      pendingActions.push(
        'La venta de AFT no emite factura ni liquida impuestos automáticamente: regístrelos en Facturación/Contabilidad si corresponde.',
      );
    }
    if (data.disposalType === 'faltante' && residualLoss > 0) {
      pendingActions.push(
        'El faltante quedó en investigación (cuenta 332). Debe resolverse indicando si se cobra al responsable o se asume como pérdida.',
      );
    }
    if (data.disposalType === 'devolucion_compra' && returnSplit?.paidPart) {
      pendingActions.push(
        `Se generó una Cuenta por Cobrar al proveedor por ${returnSplit.paidPart.toFixed(2)} correspondiente al importe ya pagado.`,
      );
    }

    return {
      asset,
      accounting: {
        accumulatedDepreciation,
        residualLoss,
        acquisitionValue,
        disposalType: data.disposalType,
        disposalDate,
        purchaseReturn: returnSplit || undefined,
      },
      pendingActions,
    };
  }

  // ══════════════════════════════════════════════════════════
  // ── Actas oficiales de AFT ──
  // 'baja'      → Acta de Baja de Activo Fijo Tangible
  // 'recepcion' → Acta de Entrega/Recepción de Activo Fijo Tangible
  // ══════════════════════════════════════════════════════════
  async generateActa(companyId: number, id: number, type: string) {
    const actaType = (type || '').toLowerCase();
    if (!['baja', 'recepcion'].includes(actaType)) {
      throw new BadRequestException(
        `Tipo de acta inválido: use 'baja' o 'recepcion'`,
      );
    }

    const asset = await this.assetRepo.findOne({
      where: { id, companyId },
      relations: ['area', 'costCenter', 'company'],
    });
    if (!asset) throw new NotFoundException(`Activo fijo #${id} no encontrado`);

    if (actaType === 'baja' && asset.status !== 'disposed') {
      throw new BadRequestException(
        `El activo ${asset.assetCode} no está dado de baja: no procede el Acta de Baja`,
      );
    }

    const isBaja = actaType === 'baja';
    const title = isBaja
      ? 'ACTA DE BAJA DE ACTIVO FIJO TANGIBLE'
      : 'ACTA DE ENTREGA/RECEPCIÓN DE ACTIVO FIJO TANGIBLE';

    const acquisitionValue = Number(asset.acquisitionValue);
    const accumulated = Number(asset.accumulatedDepreciation);
    const netValue = acquisitionValue - accumulated;

    const rows: Array<[string, string]> = [
      ['Entidad:', asset.company?.name || `Empresa #${companyId}`],
      ['Código del activo:', asset.assetCode],
      ['Denominación:', asset.name],
      ['Grupo / Subgrupo:', `${asset.groupNumber} / ${asset.subgroup || 'N/D'}`],
      ['Área:', asset.area?.name || asset.location || 'N/D'],
      ['Centro de costo:', asset.costCenter?.name || 'N/D'],
      ['Cuenta de gasto:', asset.responsiblePerson || 'N/D'],
      ['Fecha de adquisición:', asset.acquisitionDate],
      ['Concepto de alta:', this.getAcquisitionTypeLabel(asset.acquisitionType)],
      ['Valor de adquisición:', acquisitionValue.toFixed(2)],
      ['Depreciación acumulada:', accumulated.toFixed(2)],
      ['Valor neto contable:', netValue.toFixed(2)],
      ['Tasa de depreciación:', `${Number(asset.depreciationRate).toFixed(2)} %`],
    ];

    if (isBaja) {
      rows.push(
        ['Concepto de baja:', this.getDisposalTypeLabel(asset.disposalType || '')],
        ['Fecha de la baja:', asset.disposalDate || 'N/D'],
        ['Motivo:', asset.disposalReason || 'N/D'],
      );
      if (asset.investigationStatus === 'pending') {
        rows.push([
          'Faltante en investigación:',
          `${Number(asset.investigationAmount || 0).toFixed(2)} (cuenta 332)`,
        ]);
      }
    } else {
      rows.push(
        ['Estado:', asset.status],
        ['Referencia de tasación:', asset.appraisalReference || 'N/D'],
      );
    }

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    page.drawText(title, { x: 50, y: height - 60, size: 13, font: bold });
    page.drawText(
      `Fecha de emisión: ${new Date().toLocaleDateString('es-CU')}`,
      { x: 50, y: height - 82, size: 9, font },
    );
    page.drawLine({
      start: { x: 50, y: height - 92 },
      end: { x: width - 50, y: height - 92 },
      thickness: 1,
    });

    let y = height - 120;
    for (const [label, value] of rows) {
      page.drawText(label, { x: 50, y, size: 10, font: bold });
      page.drawText(String(value).substring(0, 70), { x: 210, y, size: 10, font });
      y -= 20;
    }

    y -= 20;
    const legalText = isBaja
      ? 'Se hace constar que el activo fijo tangible descrito ha sido dado de baja de los registros contables de la entidad, conforme a las Normas Cubanas de Contabilidad (Res. 235/2005 MFP), quedando registrado el comprobante correspondiente.'
      : 'Se hace constar la entrega y recepción del activo fijo tangible descrito, asumiendo el receptor la responsabilidad material sobre el mismo, conforme a las Normas Cubanas de Contabilidad.';

    const wrap = (text: string, max: number): string[] => {
      const words = text.split(' ');
      const out: string[] = [];
      let line = '';
      for (const w of words) {
        if ((line + w).length > max) {
          out.push(line.trim());
          line = '';
        }
        line += `${w} `;
      }
      if (line.trim()) out.push(line.trim());
      return out;
    };

    for (const line of wrap(legalText, 95)) {
      page.drawText(line, { x: 50, y, size: 9, font });
      y -= 14;
    }

    y -= 50;
    const signWidth = 200;
    page.drawLine({ start: { x: 50, y }, end: { x: 50 + signWidth, y }, thickness: 0.8 });
    page.drawLine({
      start: { x: width - 50 - signWidth, y },
      end: { x: width - 50, y },
      thickness: 0.8,
    });
    page.drawText(isBaja ? 'Entrega (Responsable)' : 'Entrega', {
      x: 50,
      y: y - 14,
      size: 9,
      font,
    });
    page.drawText(isBaja ? 'Aprueba (Director)' : 'Recibe (Responsable)', {
      x: width - 50 - signWidth,
      y: y - 14,
      size: 9,
      font,
    });

    y -= 60;
    page.drawLine({ start: { x: 50, y }, end: { x: 50 + signWidth, y }, thickness: 0.8 });
    page.drawText('Contabilidad', { x: 50, y: y - 14, size: 9, font });

    const pdf = await pdfDoc.save();
    const fileName = `acta-${actaType}-${asset.assetCode}.pdf`;
    return { pdf, fileName };
  }

  // ══════════════════════════════════════════════════════════
  // ── Mejora capitalizable de AFT (NCC Cuba - Res. 340) ──
  // Las inversiones que aumentan la capacidad o vida útil del activo se
  // capitalizan incrementando su valor:
  //   Débito  240 (Activos Fijos Tangibles)
  //   Crédito 410 (Cuentas por Pagar) — o la cuenta de tesorería si se paga
  // ══════════════════════════════════════════════════════════
  async addImprovement(
    companyId: number,
    id: number,
    data: {
      amount: number;
      description: string;
      improvementDate: string;
      supplierId?: string;
      bankAccountId?: string;
    },
    userName?: string,
  ) {
    const asset = await this.assetRepo.findOneBy({ id, companyId });
    if (!asset) throw new NotFoundException(`Activo fijo #${id} no encontrado`);
    if (asset.status !== 'active') {
      throw new BadRequestException(
        `Solo pueden capitalizarse mejoras en activos activos (${asset.assetCode})`,
      );
    }

    const amount = Number(data.amount);
    if (amount <= 0) {
      throw new BadRequestException('El importe de la mejora debe ser mayor que 0');
    }

    const oldAcquisitionValue = Number(asset.acquisitionValue);
    const oldCurrentValue = Number(asset.currentValue);

    const assetAccount =
      (await this.accountMappingService.getAccountForMapping(
        companyId,
        MappingType.FIXED_ASSET_ACQUISITION,
      )) || '240';
    const counterpartAccount = data.bankAccountId
      ? (await this.accountMappingService.getAccountForMapping(
          companyId,
          MappingType.TREASURY_BANK,
        )) || '110'
      : (await this.accountMappingService.getAccountForMapping(
          companyId,
          MappingType.PURCHASE_ORDER,
        )) || '410';

    asset.acquisitionValue = oldAcquisitionValue + amount;
    asset.currentValue = oldCurrentValue + amount;
    await this.assetRepo.save(asset);

    try {
      await this.voucherService.createVoucherFromModule(
        companyId,
        'fixed-assets',
        String(asset.id),
        {
          date: data.improvementDate,
          description: `Mejora capitalizable AFT: ${asset.name} (${asset.assetCode}) - ${data.description}`,
          type: 'fixed-assets',
          reference: `MEJ-${asset.assetCode}`,
          createdBy: userName || 'Sistema',
          lines: [
            {
              accountCode: assetAccount,
              debit: amount,
              credit: 0,
              description: `Capitalización mejora AFT ${asset.assetCode}`,
            },
            {
              accountCode: counterpartAccount,
              debit: 0,
              credit: amount,
              description: data.bankAccountId
                ? `Pago de mejora AFT ${asset.assetCode}`
                : `Obligación por mejora AFT ${asset.assetCode}`,
            },
          ],
        },
      );
    } catch (error) {
      this.logger.error(`Error contabilización mejora AFT ${asset.id}: ${error instanceof Error ? error.message : String(error)}`);
      asset.acquisitionValue = oldAcquisitionValue;
      asset.currentValue = oldCurrentValue;
      await this.assetRepo.save(asset);
      throw new BadRequestException(`Error al generar comprobante contable: ${error instanceof Error ? error.message : String(error)}`);
    }

    // ── Finanzas: CxP si no se paga de inmediato, o movimiento bancario ──
    if (data.bankAccountId) {
      try {
        await this.financeService.createBankTransaction(companyId, {
          bankAccountId: data.bankAccountId,
          transactionNumber: `TXB-AFT-MEJ-${asset.assetCode}-${Date.now()}`,
          transactionDate: data.improvementDate,
          transactionType: 'debit',
          amount,
          description: `Mejora capitalizable AFT ${asset.assetCode}`,
          referenceNumber: `MEJ-${asset.assetCode}`,
          category: 'fixed-asset-improvement',
        });
      } catch (error) {
        this.logger.error(`Error transacción bancaria mejora AFT ${asset.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      try {
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
        const dueDate = new Date(data.improvementDate);
        dueDate.setDate(dueDate.getDate() + 30);
        await this.financeService.createPayable(companyId, {
          purchaseNumber: `MEJ-${asset.assetCode}`,
          supplierName,
          supplierNit,
          supplierId: data.supplierId || undefined,
          originalAmount: amount,
          dueDate: dueDate.toISOString().split('T')[0],
          status: 'pending',
          currency: 'CUP',
          notes: `CxP por mejora capitalizable de AFT ${asset.assetCode}`,
        });
      } catch (error) {
        this.logger.error(`Error CxP mejora AFT ${asset.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    await this.upsertFixedAssetInventory(asset);

    await this.auditService.log({
      companyId,
      userName: userName || 'System',
      action: AuditAction.UPDATE,
      resource: AuditResource.FIXED_ASSET,
      resourceId: String(asset.id),
      resourceName: `Mejora capitalizable AFT: ${asset.assetCode}`,
      oldValues: { acquisitionValue: oldAcquisitionValue, currentValue: oldCurrentValue },
      newValues: {
        acquisitionValue: asset.acquisitionValue,
        currentValue: asset.currentValue,
        amount,
        description: data.description,
        improvementDate: data.improvementDate,
      },
    });

    return {
      asset,
      improvement: {
        amount,
        newAcquisitionValue: Number(asset.acquisitionValue),
        newCurrentValue: Number(asset.currentValue),
        improvementDate: data.improvementDate,
      },
    };
  }

  // ══════════════════════════════════════════════════════════
  // ── Resolución de Faltantes / Sobrantes en Investigación ──
  // (NCC Cuba - Res. 235-2005 MFP)
  //
  // Esta operación NO es automática: el saldo permanece en 332 (faltante) o
  // 555 (sobrante) hasta que el usuario registre el resultado de la
  // investigación, que es una decisión administrativa.
  //
  //  Faltante → responsable: Débito 335 (CxC Diversas) / Crédito 332
  //  Faltante → pérdida:     Débito 845 (Pérdidas de AFT) / Crédito 332
  //  Sobrante → ingreso:     Débito 555 / Crédito 950 (Otros Ingresos)
  // ══════════════════════════════════════════════════════════
  async findPendingInvestigations(companyId: number) {
    const assets = await this.assetRepo.find({
      where: { companyId, investigationStatus: 'pending' },
      order: { updatedAt: 'DESC' },
    });
    return {
      investigations: assets.map((a) => ({
        assetId: a.id,
        assetCode: a.assetCode,
        name: a.name,
        type: a.investigationType,
        amount: Number(a.investigationAmount || 0),
        responsiblePerson: a.responsiblePerson,
        date: a.investigationType === 'shortage' ? a.disposalDate : a.acquisitionDate,
        reason: a.disposalReason,
      })),
    };
  }

  async resolveInvestigation(
    companyId: number,
    id: number,
    data: {
      resolution: 'responsible' | 'loss' | 'income';
      resolutionDate?: string;
      notes?: string;
      responsibleName?: string;
      amount?: number;
    },
    userName?: string,
  ) {
    const asset = await this.assetRepo.findOneBy({ id, companyId });
    if (!asset) throw new NotFoundException(`Activo fijo #${id} no encontrado`);
    if (asset.investigationStatus !== 'pending') {
      throw new BadRequestException(
        `El activo ${asset.assetCode} no tiene una investigación pendiente`,
      );
    }

    const pendingAmount = Number(asset.investigationAmount || 0);
    const amount = data.amount != null ? Number(data.amount) : pendingAmount;
    if (amount <= 0) {
      throw new BadRequestException('El importe a resolver debe ser mayor que 0');
    }
    if (amount > pendingAmount) {
      throw new BadRequestException(
        `El importe a resolver (${amount}) excede el saldo en investigación (${pendingAmount})`,
      );
    }

    const isShortage = asset.investigationType === 'shortage';
    if (isShortage && data.resolution === 'income') {
      throw new BadRequestException(
        'Un faltante solo puede resolverse como cobro al responsable o como pérdida',
      );
    }
    if (!isShortage && data.resolution !== 'income') {
      throw new BadRequestException(
        'Un sobrante solo puede resolverse reconociendo el ingreso',
      );
    }

    const resolutionDate = data.resolutionDate || new Date().toISOString().split('T')[0];

    const shortageAccount =
      (await this.accountMappingService.getAccountForMapping(
        companyId,
        MappingType.INVENTORY_SHORTAGE_INVESTIGATION,
      )) || '332';
    const surplusAccount =
      (await this.accountMappingService.getAccountForMapping(
        companyId,
        MappingType.INVENTORY_SURPLUS_INVESTIGATION,
      )) || '555';

    const lines: Array<{
      accountCode: string;
      debit: number;
      credit: number;
      description: string;
    }> = [];
    let description: string;

    if (data.resolution === 'responsible') {
      const receivableAccount =
        (await this.accountMappingService.getAccountForMapping(
          companyId,
          MappingType.INVENTORY_SHORTAGE_RECEIVABLE,
        )) || '335';
      lines.push({
        accountCode: receivableAccount,
        debit: amount,
        credit: 0,
        description: `Faltante AFT ${asset.assetCode} a cargo del responsable`,
      });
      lines.push({
        accountCode: shortageAccount,
        debit: 0,
        credit: amount,
        description: `Cierre faltante en investigación AFT ${asset.assetCode}`,
      });
      description = `Resolución faltante AFT ${asset.assetCode}: cobro al responsable`;
    } else if (data.resolution === 'loss') {
      const lossAccount =
        (await this.accountMappingService.getAccountForMapping(
          companyId,
          MappingType.FIXED_ASSET_DISPOSAL_LOSS,
        )) || '845';
      lines.push({
        accountCode: lossAccount,
        debit: amount,
        credit: 0,
        description: `Pérdida definitiva por faltante AFT ${asset.assetCode}`,
      });
      lines.push({
        accountCode: shortageAccount,
        debit: 0,
        credit: amount,
        description: `Cierre faltante en investigación AFT ${asset.assetCode}`,
      });
      description = `Resolución faltante AFT ${asset.assetCode}: pérdida definitiva`;
    } else {
      const incomeAccount =
        (await this.accountMappingService.getAccountForMapping(
          companyId,
          MappingType.INVENTORY_SURPLUS_INCOME,
        )) || '950';
      lines.push({
        accountCode: surplusAccount,
        debit: amount,
        credit: 0,
        description: `Cierre sobrante en investigación AFT ${asset.assetCode}`,
      });
      lines.push({
        accountCode: incomeAccount,
        debit: 0,
        credit: amount,
        description: `Ingreso por sobrante de AFT ${asset.assetCode}`,
      });
      description = `Resolución sobrante AFT ${asset.assetCode}: reconocimiento de ingreso`;
    }

    await this.voucherService.createVoucherFromModule(
      companyId,
      'fixed-assets',
      String(asset.id),
      {
        date: resolutionDate,
        description: `${description}${data.notes ? ` - ${data.notes}` : ''}`,
        type: 'fixed-assets',
        reference: `INV-${asset.assetCode}`,
        createdBy: userName || 'Sistema',
        lines,
      },
    );

    // ── Cuenta por Cobrar al responsable ──
    if (data.resolution === 'responsible') {
      try {
        const dueDate = new Date(resolutionDate);
        dueDate.setDate(dueDate.getDate() + 30);
        await this.financeService.createReceivable(companyId, {
          invoiceNumber: `AFT-FALTANTE-${asset.assetCode}`,
          customerName:
            data.responsibleName || asset.responsiblePerson || 'Responsable AFT',
          originalAmount: amount,
          dueDate: dueDate.toISOString().split('T')[0],
          status: 'pending',
          currency: 'CUP',
          notes: `CxC por faltante de AFT ${asset.assetCode} - ${asset.name}`,
        });
      } catch (error) {
        this.logger.error(`Error CxC por faltante AFT ${asset.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const remaining = pendingAmount - amount;
    asset.investigationAmount = remaining > 0 ? remaining : null;
    asset.investigationStatus = remaining > 0 ? 'pending' : 'resolved';
    asset.investigationResolution = data.resolution;
    asset.investigationResolvedAt = remaining > 0 ? null : resolutionDate;
    await this.assetRepo.save(asset);

    await this.auditService.log({
      companyId,
      userName: userName || 'System',
      action: AuditAction.UPDATE,
      resource: AuditResource.FIXED_ASSET,
      resourceId: String(asset.id),
      resourceName: `Resolución investigación AFT: ${asset.assetCode}`,
      oldValues: { investigationStatus: 'pending', investigationAmount: pendingAmount },
      newValues: {
        investigationStatus: asset.investigationStatus,
        investigationResolution: data.resolution,
        amount,
        resolutionDate,
        notes: data.notes,
      },
    });

    return {
      asset,
      resolution: {
        type: asset.investigationType,
        resolution: data.resolution,
        amount,
        remaining: remaining > 0 ? remaining : 0,
        resolutionDate,
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
    if (data.appraisalReference) {
      asset.appraisalReference = data.appraisalReference;
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

      // Cuenta patrimonial 613 Revalorización de AFT (mixta): se acredita el
      // superávit y se debita el déficit, conforme al Nomenclador Cubano.
      const revaluationAccount =
        (await this.accountMappingService.getAccountForMapping(
          companyId,
          MappingType.FIXED_ASSET_REVALUATION,
        )) || '613';

      if (revaluationDifference > 0) {
        // Superávit de revalorización
        lines.push({
          accountCode: assetAccount, // Activos Fijos Tangibles
          debit: revaluationDifference,
          credit: 0,
          description: `Revalorización AFT ${asset.assetCode} - ${data.reason}`,
        });
        lines.push({
          accountCode: revaluationAccount,
          debit: 0,
          credit: revaluationDifference,
          description: `Superávit revalorización AFT ${asset.assetCode}`,
        });
      } else {
        // Déficit de revalorización
        const deficit = Math.abs(revaluationDifference);
        lines.push({
          accountCode: revaluationAccount,
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
    let transferAccount: string = '696';
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
        )) || '696';

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
    let entries = await this.catalogRepo.find({
      where: { companyId, isActive: true },
      order: { groupNumber: 'ASC', subgroupName: 'ASC' },
    });

    if (entries.length === 0) {
      for (const group of mockDepreciationCatalog as any[]) {
        for (const sub of group.subgroups) {
          const entry = this.catalogRepo.create({
            companyId,
            groupNumber: group.group_number,
            groupName: group.group_name,
            subgroupName: sub.name,
            depreciationRate: sub.rate,
            usefulLifeYears: sub.rate > 0 ? Math.round(100 / sub.rate) : null,
            description: sub.detail || null,
            isActive: true,
          });
          await this.catalogRepo.save(entry);
        }
      }
      entries = await this.catalogRepo.find({
        where: { companyId, isActive: true },
        order: { groupNumber: 'ASC', subgroupName: 'ASC' },
      });
    }

    const grouped = new Map<number, { group_number: number; group_name: string; subgroups: any[] }>();
    for (const entry of entries) {
      if (!grouped.has(entry.groupNumber)) {
        grouped.set(entry.groupNumber, {
          group_number: entry.groupNumber,
          group_name: entry.groupName,
          subgroups: [],
        });
      }
      grouped.get(entry.groupNumber)!.subgroups.push({
        name: entry.subgroupName,
        rate: Number(entry.depreciationRate),
      });
    }

    return { catalog: Array.from(grouped.values()) };
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

  private getAcquisitionTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      compra: 'Compra de AFT',
      donacion: 'Alta de AFT por donación',
      sobrante: 'Alta de AFT por sobrante',
    };
    return labels[type] || 'Alta de AFT';
  }

  private getDisposalTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      faltante: 'Baja de AFT por faltante',
      deterioro: 'Baja de AFT por deterioro',
      venta: 'Venta de AFT',
      devolucion_compra: 'Devolución de compra de AFT',
      obsolescencia: 'Baja de AFT por obsolescencia',
      rotura: 'Baja de AFT por rotura',
      donacion: 'Baja de AFT por donación entregada',
    };
    return labels[type] || 'Baja de AFT';
  }

  private async getCostCenterWithExpenseAccount(
    companyId: number,
    costCenterId: string,
  ): Promise<CostCenter | null> {
    return this.costCenterRepo.findOneBy({ id: costCenterId, companyId });
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

  // ══════════════════════════════════════════════════════════
  // ── FIXED ASSET AREAS ──
  // ══════════════════════════════════════════════════════════

  async findAllAreas(companyId: number) {
    return this.areaRepo.find({
      where: { companyId },
      order: { name: 'ASC' },
    });
  }

  async createArea(companyId: number, data: { name: string; description?: string }) {
    const area = this.areaRepo.create({
      ...data,
      companyId,
      isActive: true,
    });
    return this.areaRepo.save(area);
  }

  async updateArea(companyId: number, id: number, data: { name?: string; description?: string; isActive?: boolean }) {
    const area = await this.areaRepo.findOneBy({ id, companyId });
    if (!area) throw new NotFoundException(`Área #${id} no encontrada`);
    Object.assign(area, data);
    return this.areaRepo.save(area);
  }

  async deleteArea(companyId: number, id: number) {
    const area = await this.areaRepo.findOneBy({ id, companyId });
    if (!area) throw new NotFoundException(`Área #${id} no encontrada`);
    return this.areaRepo.remove(area);
  }
}
