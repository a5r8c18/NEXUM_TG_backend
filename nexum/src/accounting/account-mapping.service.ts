/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
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
  ) {}

  // Default account mappings — Nomenclador Cubano Resolución 2016
  private readonly defaultMappings: Record<MappingType, string> = {
    [MappingType.INVOICE_SALE]: '900',   // Ventas
    [MappingType.INVOICE_RECEIVABLE]: '135', // Cuentas por Cobrar (débito venta a crédito)
    [MappingType.INVOICE_PAYMENT]: '101', // Efectivo en Caja
    [MappingType.INVOICE_CANCELLATION]: '900', // Ventas (reverso)
    [MappingType.INVENTORY_ENTRY]: '189',   // Mercancías para la Venta
    [MappingType.INVENTORY_EXIT]: '810',    // Costo de Ventas de la Producción (mercancías: 814)
    [MappingType.INVENTORY_RETURN]: '189',  // Mercancías (reverso)
    [MappingType.INVENTORY_TRANSIT]: '699', // Transitoria del Sistema Automatizado
    [MappingType.FIXED_ASSET_ACQUISITION]: '240', // Activos Fijos Tangibles
    [MappingType.FIXED_ASSET_DEPRECIATION]: '822', // Gastos Generales y de Administración (gasto de depreciación)
    [MappingType.PAYROLL_PROCESSING]: '731', // Gastos Asociados a la Producción
    [MappingType.PAYROLL_PAYMENT]: '455', // Nóminas por Pagar
    [MappingType.PURCHASE_ORDER]: '410',  // Cuentas por Pagar a Proveedores
    [MappingType.PURCHASE_PAYMENT]: '101', // Efectivo en Caja
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

  private getAccountName(accountCode: string): string {
    // Códigos del Nomenclador Cubano 2016 (ver seed-accounts-2016.ts)
    const accountNames: Record<string, string> = {
      '101': 'Efectivo en Caja',
      '110': 'Efectivo en Banco y en Otras Instituciones',
      '135': 'Cuentas por Cobrar a Corto Plazo',
      '183': 'Materias Primas y Materiales',
      '188': 'Producción Terminada',
      '189': 'Mercancías para la Venta',
      '240': 'Activos Fijos Tangibles',
      '375': 'Depreciación de Activos Fijos Tangibles',
      '410': 'Cuentas por Pagar a Corto Plazo',
      '455': 'Nóminas por Pagar',
      '699': 'Transitoria del Sistema Automatizado',
      '731': 'Gastos Asociados a la Producción',
      '810': 'Costo de Ventas de la Producción',
      '814': 'Costo de Ventas de Mercancías',
      '822': 'Gastos Generales y de Administración',
      '900': 'Ventas',
    };

    return accountNames[accountCode] || `Cuenta ${accountCode}`;
  }
}
