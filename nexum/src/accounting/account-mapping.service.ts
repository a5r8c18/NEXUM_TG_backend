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
    [MappingType.INVOICE_PAYMENT]: '101', // Efectivo en Caja
    [MappingType.INVOICE_CANCELLATION]: '900', // Ventas (reverso)
    [MappingType.INVENTORY_ENTRY]: '189', // Mercancías para la Venta
    [MappingType.INVENTORY_EXIT]: '810',  // Costo de Ventas de Mercancías
    [MappingType.INVENTORY_RETURN]: '189', // Mercancías (reverso)
    [MappingType.FIXED_ASSET_ACQUISITION]: '240', // Activos Fijos Tangibles
    [MappingType.FIXED_ASSET_DEPRECIATION]: '840', // Gasto de Depreciación
    [MappingType.PAYROLL_PROCESSING]: '731', // Gastos de Fuerza de Trabajo
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
    const accountNames: Record<string, string> = {
      '1100': 'Caja y Bancos',
      '1200': 'Cuentas por Cobrar',
      '1400': 'Activos Fijos',
      '1401': 'Depreciación Acumulada',
      '1830': 'Inventario de Mercancías',
      '2110': 'Salarios por Pagar',
      '2120': 'Impuestos Retenidos',
      '2100': 'Obligaciones Laborales',
      '4010': 'Cuentas por Pagar',
      '4050': 'Cuentas por Pagar Transitorio',
      '4100': 'Ventas',
      '4200': 'Descuentos',
      '5100': 'Gastos de Personal',
      '8100': 'Costo de Ventas',
      '8220': 'Gasto de Depreciación',
    };

    return accountNames[accountCode] || `Cuenta ${accountCode}`;
  }
}
