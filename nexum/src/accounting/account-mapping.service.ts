/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Account } from '../entities/account.entity';
import {
  AccountMapping,
  MappingType,
} from '../entities/account-mapping.entity';

@Injectable()
export class AccountMappingService {
  private readonly logger = new Logger(AccountMappingService.name);

  constructor(
    @InjectRepository(AccountMapping)
    private readonly mappingRepo: Repository<AccountMapping>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
  ) {}

  // Default account mappings — Nomenclador Cubano Resolución 2016.
  // Las cuentas de contrapartida deben ser subcuentas analíticas (allowsMovements=true)
  // porque los asientos no pueden registrarse en cuentas agrupadoras.
  private readonly defaultMappings: Record<MappingType, string> = {
    [MappingType.INVOICE_SALE]: '900',   // Ventas
    [MappingType.INVOICE_RECEIVABLE]: '135-0020', // Cuentas por Cobrar - Fuera del Órgano (clientes externos)
    [MappingType.INVOICE_PAYMENT]: '101', // Efectivo en Caja
    [MappingType.INVOICE_CANCELLATION]: '900', // Ventas (reverso)
    [MappingType.INVENTORY_ENTRY]: '189',   // Mercancías para la Venta
    [MappingType.INVENTORY_EXIT]: '810',    // Costo de Ventas de la Producción (mercancías: 814)
    [MappingType.INVENTORY_RETURN]: '189',  // Mercancías (reverso)
    [MappingType.INVENTORY_TRANSIT]: '434', // Materiales Recibidos de Forma Anticipada
    [MappingType.FIXED_ASSET_ACQUISITION]: '240', // Activos Fijos Tangibles
    [MappingType.FIXED_ASSET_DEPRECIATION]: '822', // Gastos Generales y de Administración (gasto de depreciación)
    [MappingType.FIXED_ASSET_DEPRECIATION_PRODUCTION]: '700-0020', // Gastos del Período — Producción en Proceso
    [MappingType.FIXED_ASSET_DEPRECIATION_ASSOCIATED]: '731', // Gastos Asociados a la Producción
    [MappingType.FIXED_ASSET_DEPRECIATION_ADMINISTRATIVE]: '822', // Gastos Generales y de Administración
    [MappingType.FIXED_ASSET_ACCUMULATED_DEPRECIATION]: '375', // Depreciación Acumulada AFT
    [MappingType.FIXED_ASSET_TRANSFER]: '696', // Operaciones entre Dependencias
    [MappingType.FIXED_ASSET_DISPOSAL_GAIN]: '950', // Otros Ingresos / Superávit por baja/venta AFT
    [MappingType.FIXED_ASSET_DISPOSAL_LOSS]: '845', // Faltantes y Pérdidas de AFT
    [MappingType.FIXED_ASSET_SALE_PROCEEDS]: '135-0020', // Cuentas por Cobrar - Fuera del Órgano (venta a crédito)
    [MappingType.PAYROLL_PROCESSING]: '731', // Gastos Asociados a la Producción (default)
    [MappingType.PAYROLL_PROCESSING_PRODUCTION]: '700-0020', // Gastos del Período — Producción en Proceso
    [MappingType.PAYROLL_PROCESSING_ASSOCIATED]: '731', // Gastos Asociados a la Producción
    [MappingType.PAYROLL_PROCESSING_ADMINISTRATIVE]: '822', // Gastos Generales y de Administración
    [MappingType.PAYROLL_PAYMENT]: '455', // Nóminas por Pagar
    [MappingType.PAYROLL_RETENTION]: '460-0020', // Retenciones por Pagar - Contribución a la Seguridad Social
    [MappingType.PAYROLL_RETENTION_INCOME_TAX]: '460-0010', // Impuesto sobre Ingresos Personales
    [MappingType.PAYROLL_RETENTION_UNION]: '460-0030', // Cuotas Sindicales
    [MappingType.PAYROLL_RETENTION_OTHER]: '460-0050', // Otras Retenciones
    [MappingType.PAYROLL_VACATION_PROVISION]: '480', // Gastos Acumulados por Pagar - Vacaciones
    [MappingType.PAYROLL_CASH]: '110', // Efectivo en Banco (pago de nómina)
    [MappingType.PURCHASE_ORDER]: '410-0020',  // Cuentas por Pagar - Fuera del Órgano (proveedores)
    [MappingType.PURCHASE_PAYMENT]: '101', // Efectivo en Caja
    [MappingType.TREASURY_CASH]: '101', // Efectivo en Caja
    [MappingType.TREASURY_BANK]: '110', // Efectivo en Banco y en Otras Instituciones
    [MappingType.TREASURY_CARD]: '112', // Efectivo en Banco - operaciones con tarjeta
    [MappingType.INVENTORY_SHORTAGE_INVESTIGATION]: '332', // Faltantes de Bienes en Investigación
    [MappingType.INVENTORY_SURPLUS_INVESTIGATION]: '555', // Sobrantes en Investigación
    [MappingType.INVENTORY_SHORTAGE_LOSS]: '850', // Gastos por Faltantes de Bienes
    [MappingType.INVENTORY_SHORTAGE_RECEIVABLE]: '335', // Cuentas por Cobrar Diversas
    [MappingType.INVENTORY_SURPLUS_INCOME]: '950', // Otros Ingresos
  };

  async findAll(companyId: number) {
    const mappings = await this.mappingRepo.find({
      where: { companyId, isActive: true },
      order: { mappingType: 'ASC' },
    });
    return { mappings };
  }

  async findOne(companyId: number, id: number) {
    const mapping = await this.mappingRepo.findOne({
      where: { id, companyId },
    });

    if (!mapping) {
      throw new NotFoundException(`Account mapping #${id} not found`);
    }

    return { mapping };
  }

  async create(
    companyId: number,
    data: {
      mappingType: MappingType;
      accountCode: string;
      accountName: string;
      description?: string;
      metadata?: Record<string, any>;
    },
  ) {
    // Check if mapping already exists for this type
    const existing = await this.mappingRepo.findOne({
      where: { companyId, mappingType: data.mappingType },
    });

    if (existing) {
      // Update existing mapping
      existing.accountCode = data.accountCode;
      existing.accountName = data.accountName;
      existing.description = data.description;
      existing.metadata = data.metadata;
      existing.isActive = true;
      await this.mappingRepo.save(existing);
      return { mapping: existing };
    }

    // Create new mapping
    const mapping = await this.mappingRepo.save({
      companyId,
      mappingType: data.mappingType,
      accountCode: data.accountCode,
      accountName: data.accountName,
      description: data.description,
      metadata: data.metadata,
    });

    return { mapping };
  }

  async update(
    companyId: number,
    id: number,
    data: {
      accountCode?: string;
      accountName?: string;
      description?: string;
      isActive?: boolean;
      metadata?: Record<string, any>;
    },
  ) {
    const mapping = await this.mappingRepo.findOne({
      where: { id, companyId },
    });

    if (!mapping) {
      throw new NotFoundException(`Account mapping #${id} not found`);
    }

    Object.assign(mapping, data);
    await this.mappingRepo.save(mapping);

    return { mapping };
  }

  async remove(companyId: number, id: number) {
    const mapping = await this.mappingRepo.findOne({
      where: { id, companyId },
    });

    if (!mapping) {
      throw new NotFoundException(`Account mapping #${id} not found`);
    }

    // Soft delete by setting isActive to false
    mapping.isActive = false;
    await this.mappingRepo.save(mapping);

    return { message: 'Account mapping deactivated successfully' };
  }

  async getAccountForMapping(
    companyId: number,
    mappingType: MappingType,
  ): Promise<string> {
    // Try to find custom mapping
    const mapping = await this.mappingRepo.findOne({
      where: { companyId, mappingType, isActive: true },
    });

    if (mapping) {
      return mapping.accountCode;
    }

    // Return default mapping
    return this.defaultMappings[mappingType];
  }

  async getMultipleMappings(
    companyId: number,
    mappingTypes: MappingType[],
  ): Promise<Record<MappingType, string>> {
    const mappings = await this.mappingRepo.find({
      where: {
        companyId,
        mappingType: In(mappingTypes),
        isActive: true,
      },
    });

    const result: Record<MappingType, string> = {} as any;

    for (const type of mappingTypes) {
      const customMapping = mappings.find((m) => m.mappingType === type);
      result[type] = customMapping?.accountCode || this.defaultMappings[type];
    }

    return result;
  }

  async bulkCreate(
    companyId: number,
    mappings: Array<{
      mappingType: MappingType;
      accountCode: string;
      accountName: string;
      description?: string;
    }>,
  ) {
    const results: any[] = [];

    for (const mappingData of mappings) {
      try {
        const result = await this.create(companyId, mappingData);
        results.push(result);
      } catch (error) {
        // Log error but continue with other mappings
        this.logger.error(
          `Error creating mapping for ${mappingData.mappingType}: ${error}`,
        );
      }
    }

    return { mappings: results };
  }

  async resetToDefaults(companyId: number) {
    // Deactivate all existing mappings
    await this.mappingRepo.update({ companyId }, { isActive: false });

    // Create default mappings
    const defaultMappingsData = Object.entries(this.defaultMappings).map(
      ([type, accountCode]) => ({
        mappingType: type as MappingType,
        accountCode,
        accountName: this.getAccountName(accountCode),
        description: `Default mapping for ${type}`,
      }),
    );

    return await this.bulkCreate(companyId, defaultMappingsData);
  }

  /**
   * Valida que las cuentas predeterminadas de mapeo existan para la empresa
   * y que permitan movimientos (allowsMovements=true).
   */
  async validateDefaultMappings(companyId: number): Promise<{ ok: boolean; errors: string[] }> {
    const accountCodes = Array.from(new Set(Object.values(this.defaultMappings)));
    const accounts = await this.accountRepo.find({
      where: { companyId, code: In(accountCodes) },
      select: ['code', 'allowsMovements'],
    });
    const accountMap = new Map(accounts.map((a) => [a.code, a]));

    const errors: string[] = [];
    for (const [type, code] of Object.entries(this.defaultMappings)) {
      const account = accountMap.get(code);
      if (!account) {
        errors.push(`Mapping ${type} -> ${code}: cuenta no existe`);
      } else if (!account.allowsMovements) {
        errors.push(`Mapping ${type} -> ${code}: cuenta no permite movimientos`);
      }
    }

    if (errors.length > 0) {
      this.logger.warn(`Validación de mapeos fallida para companyId=${companyId}: ${errors.join('; ')}`);
    } else {
      this.logger.log(`Mapeos por defecto validados correctamente para companyId=${companyId}`);
    }

    return { ok: errors.length === 0, errors };
  }

  private getAccountName(accountCode: string): string {
    // Códigos del Nomenclador Cubano 2016 (ver seed-accounts-2016.ts)
    const accountNames: Record<string, string> = {
      '101': 'Efectivo en Caja',
      '110': 'Efectivo en Banco y en Otras Instituciones',
      '135': 'Cuentas por Cobrar a Corto Plazo',
      '135-0020': 'Cuentas por Cobrar - Fuera del Órgano u Organismo',
      '183': 'Materias Primas y Materiales',
      '188': 'Producción Terminada',
      '189': 'Mercancías para la Venta',
      '240': 'Activos Fijos Tangibles',
      '375': 'Depreciación de Activos Fijos Tangibles',
      '845': 'Faltantes y Pérdidas de Activos Fijos Tangibles',
      '950': 'Otros Ingresos',
      '410': 'Cuentas por Pagar a Corto Plazo',
      '410-0020': 'Cuentas por Pagar - Fuera del Órgano u Organismo',
      '434': 'Materiales Recibidos de Forma Anticipada',
      '440': 'Obligaciones con el Presupuesto del Estado',
      '455': 'Nóminas por Pagar',
      '460': 'Retenciones por Pagar',
      '460-0010': 'Impuesto sobre Ingresos Personales - Retenciones por Pagar',
      '460-0020': 'Contribución a la Seguridad Social - Retenciones por Pagar',
      '460-0030': 'Cuotas Sindicales - Retenciones por Pagar',
      '460-0050': 'Otras Retenciones por Pagar',
      '480': 'Gastos Acumulados por Pagar',
      '112': 'Efectivo en Banco y en Otras Instituciones',
      '332': 'Faltantes de Bienes en Investigación',
      '335': 'Cuentas por Cobrar Diversas - Operaciones Corrientes',
      '555': 'Sobrantes en Investigación',
      '850': 'Gastos por Faltantes de Bienes',
      '696': 'Operaciones entre Dependencias',
      '699': 'Transitoria del Sistema Automatizado',
      '700-0020': 'Gastos del Período — Producción en Proceso',
      '731': 'Gastos Asociados a la Producción',
      '810': 'Costo de Ventas de la Producción',
      '814': 'Costo de Ventas de Mercancías',
      '822': 'Gastos Generales y de Administración',
      '900': 'Ventas',
    };

    return accountNames[accountCode] || `Cuenta ${accountCode}`;
  }
}
