import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataSource } from 'typeorm';
import { Inventory } from '../entities/inventory.entity';
import { InventoryWarehouse } from '../entities/inventory-warehouse.entity';
import { Warehouse } from '../entities/warehouse.entity';

async function migrateInventoryToWarehouse() {
  console.log('🔄 Iniciando migración de inventario a sistema por almacén...');
  
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);
  
  try {
    // Obtener todos los warehouses existentes
    const warehouseRepo = dataSource.getRepository(Warehouse);
    const inventoryRepo = dataSource.getRepository(Inventory);
    const inventoryWarehouseRepo = dataSource.getRepository(InventoryWarehouse);
    
    const warehouses = await warehouseRepo.find();
    console.log(`📦 Encontrados ${warehouses.length} almacenes`);
    
    // Obtener todo el inventario existente
    const inventories = await inventoryRepo.find({
      relations: ['company']
    });
    console.log(`📋 Encontrados ${inventories.length} registros de inventario`);
    
    let migratedCount = 0;
    let skippedCount = 0;
    
    for (const inventory of inventories) {
      // Si el inventario ya tiene un warehouse asignado, crear registro específico
      if (inventory.warehouse) {
        // Buscar el warehouse por nombre
        const warehouse = warehouses.find(w => 
          w.companyId === inventory.companyId && 
          (w.name === inventory.warehouse || w.id === inventory.warehouse)
        );
        
        if (warehouse) {
          // Verificar si ya existe el registro en inventory_warehouse
          const existing = await inventoryWarehouseRepo.findOne({
            where: {
              companyId: inventory.companyId,
              productCode: inventory.productCode,
              warehouseId: warehouse.id
            }
          });
          
          if (!existing) {
            await inventoryWarehouseRepo.save({
              companyId: inventory.companyId,
              productCode: inventory.productCode,
              productName: inventory.productName,
              productDescription: inventory.productDescription,
              productUnit: inventory.productUnit,
              unitPrice: inventory.unitPrice,
              warehouseId: warehouse.id,
              warehouseName: warehouse.name,
              entity: inventory.entity,
              location: null,
              entries: inventory.entries,
              exits: inventory.exits,
              stock: inventory.stock,
              stockLimit: inventory.stockLimit,
              isActive: true,
            });
            migratedCount++;
            console.log(`✅ Migrado: ${inventory.productCode} → ${warehouse.name}`);
          } else {
            skippedCount++;
            console.log(`⏭️  Ya existe: ${inventory.productCode} → ${warehouse.name}`);
          }
        } else {
          // Si no se encuentra el warehouse, crear uno por defecto
          const defaultWarehouseId = `WH-${inventory.companyId}-DEFAULT`;
          const existing = await inventoryWarehouseRepo.findOne({
            where: {
              companyId: inventory.companyId,
              productCode: inventory.productCode,
              warehouseId: defaultWarehouseId
            }
          });
          
          if (!existing) {
            await inventoryWarehouseRepo.save({
              companyId: inventory.companyId,
              productCode: inventory.productCode,
              productName: inventory.productName,
              productDescription: inventory.productDescription,
              productUnit: inventory.productUnit,
              unitPrice: inventory.unitPrice,
              warehouseId: defaultWarehouseId,
              warehouseName: 'Almacén por Defecto',
              entity: inventory.entity,
              location: null,
              entries: inventory.entries,
              exits: inventory.exits,
              stock: inventory.stock,
              stockLimit: inventory.stockLimit,
              isActive: true,
            });
            migratedCount++;
            console.log(`✅ Migrado (default): ${inventory.productCode} → Almacén por Defecto`);
          } else {
            skippedCount++;
            console.log(`⏭️  Ya existe (default): ${inventory.productCode}`);
          }
        }
      } else {
        // Si no tiene warehouse asignado, crear para todos los warehouses de la empresa
        const companyWarehouses = warehouses.filter(w => w.companyId === inventory.companyId);
        
        for (const warehouse of companyWarehouses) {
          const existing = await inventoryWarehouseRepo.findOne({
            where: {
              companyId: inventory.companyId,
              productCode: inventory.productCode,
              warehouseId: warehouse.id
            }
          });
          
          if (!existing) {
            await inventoryWarehouseRepo.save({
              companyId: inventory.companyId,
              productCode: inventory.productCode,
              productName: inventory.productName,
              productDescription: inventory.productDescription,
              productUnit: inventory.productUnit,
              unitPrice: inventory.unitPrice,
              warehouseId: warehouse.id,
              warehouseName: warehouse.name,
              entity: inventory.entity,
              location: null,
              entries: Math.floor(inventory.entries / companyWarehouses.length), // Distribuir entradas
              exits: Math.floor(inventory.exits / companyWarehouses.length), // Distribuir salidas
              stock: Math.floor(inventory.stock / companyWarehouses.length), // Distribuir stock
              stockLimit: inventory.stockLimit,
              isActive: true,
            });
            migratedCount++;
            console.log(`✅ Migrado (distribuido): ${inventory.productCode} → ${warehouse.name}`);
          } else {
            skippedCount++;
            console.log(`⏭️  Ya existe: ${inventory.productCode} → ${warehouse.name}`);
          }
        }
      }
    }
    
    console.log(`\n📊 Resumen de Migración:`);
    console.log(`✅ Registros migrados: ${migratedCount}`);
    console.log(`⏭️  Registros omitidos: ${skippedCount}`);
    console.log(`📦 Total warehouses: ${warehouses.length}`);
    console.log(`📋 Total inventario original: ${inventories.length}`);
    console.log(`📈 Total registros nuevos: ${await inventoryWarehouseRepo.count()}`);
    
    console.log('\n🎯 Migración completada exitosamente!');
    
  } catch (error) {
    console.error('❌ Error durante la migración:', error);
    throw error;
  } finally {
    await app.close();
  }
}

// Ejecutar la migración
migrateInventoryToWarehouse()
  .then(() => {
    console.log('✅ Proceso de migración finalizado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error en el proceso de migración:', error);
    process.exit(1);
  });
