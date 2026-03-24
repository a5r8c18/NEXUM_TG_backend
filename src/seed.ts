import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { Company } from './entities/company.entity';
import { User } from './entities/user.entity';
import { Warehouse } from './entities/warehouse.entity';
import { Inventory } from './entities/inventory.entity';

// Load .env manually
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valParts] = trimmed.split('=');
      process.env[key.trim()] = valParts.join('=').trim();
    }
  }
}

async function seed() {
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '1234',
    database: process.env.DB_NAME || 'nexum_db',
    entities: [__dirname + '/entities/*.entity{.ts,.js}'],
    synchronize: true,
  });

  await ds.initialize();
  console.log('Database connected');

  const companyRepo = ds.getRepository(Company);
  const userRepo = ds.getRepository(User);
  const warehouseRepo = ds.getRepository(Warehouse);
  const inventoryRepo = ds.getRepository(Inventory);

  // --- Companies ---
  let company1 = await companyRepo.findOneBy({ name: 'Empresa Demo S.A.' });
  if (!company1) {
    company1 = new Company();
    company1.name = 'Empresa Demo S.A.';
    company1.taxId = 'RUC-12345678';
    company1.address = 'Av. Principal 123, Ciudad';
    company1.phone = '555-0100';
    company1.email = 'contacto@empresademo.com';
    company1.isActive = true;
    company1 = await companyRepo.save(company1);
    console.log('Company created:', company1.name);
  }

  let company2 = await companyRepo.findOneBy({ name: 'Distribuidora Norte' });
  if (!company2) {
    company2 = new Company();
    company2.name = 'Distribuidora Norte';
    company2.taxId = 'RUC-87654321';
    company2.address = 'Calle Comercio 456';
    company2.phone = '555-0200';
    company2.email = 'info@distnorte.com';
    company2.isActive = true;
    company2 = await companyRepo.save(company2);
    console.log('Company created:', company2.name);
  }

  // --- Users ---
  let adminUser = await userRepo.findOneBy({ email: 'admin@nexum.com' });
  if (!adminUser) {
    adminUser = new User();
    adminUser.email = 'admin@nexum.com';
    adminUser.password = '1234';
    adminUser.firstName = 'Admin';
    adminUser.lastName = 'NEXUM';
    adminUser.role = 'admin';
    adminUser.tenantId = 'tenant-multi-1';
    adminUser.tenantName = 'Grupo Empresarial Demo';
    adminUser.tenantType = 'MULTI_COMPANY';
    adminUser.companyId = company1.id;
    await userRepo.save(adminUser);
    console.log('User created:', adminUser.email);
  }

  // --- Warehouses ---
  const existingWh = await warehouseRepo.findOneBy({
    name: 'Almacén Central',
    companyId: company1.id,
  });
  if (!existingWh) {
    const warehouses = [
      {
        name: 'Almacén Central',
        code: 'ALM-CENTRAL',
        address: 'Edificio Principal, Planta Baja',
        companyId: company1.id,
      },
      {
        name: 'Almacén Secundario',
        code: 'ALM-SEC',
        address: 'Zona Industrial, Nave 3',
        companyId: company1.id,
      },
      {
        name: 'Almacén Norte',
        code: 'ALM-NORTE',
        address: 'Sucursal Norte, Av. Libertad',
        companyId: company2.id,
      },
    ];
    for (const wh of warehouses) {
      const w = new Warehouse();
      w.name = wh.name;
      w.code = wh.code;
      w.address = wh.address;
      w.companyId = wh.companyId;
      w.isActive = true;
      await warehouseRepo.save(w);
      console.log('Warehouse created:', w.name);
    }
  }

  // --- Inventory ---
  const existingInv = await inventoryRepo.findOneBy({
    productCode: 'PROD-001',
    companyId: company1.id,
  });
  if (!existingInv) {
    const products = [
      {
        productCode: 'PROD-001',
        productName: 'Laptop HP ProBook 450',
        productUnit: 'und',
        unitPrice: 850,
        stock: 25,
        entries: 30,
        exits: 5,
        warehouse: 'Almacén Central',
        entity: 'Empresa Demo S.A.',
      },
      {
        productCode: 'PROD-002',
        productName: 'Monitor Dell 27"',
        productUnit: 'und',
        unitPrice: 320,
        stock: 40,
        entries: 50,
        exits: 10,
        warehouse: 'Almacén Central',
        entity: 'Empresa Demo S.A.',
      },
      {
        productCode: 'PROD-003',
        productName: 'Teclado Mecánico Logitech',
        productUnit: 'und',
        unitPrice: 75,
        stock: 100,
        entries: 120,
        exits: 20,
        warehouse: 'Almacén Central',
        entity: 'Empresa Demo S.A.',
      },
      {
        productCode: 'PROD-004',
        productName: 'Mouse Inalámbrico',
        productUnit: 'und',
        unitPrice: 25,
        stock: 200,
        entries: 250,
        exits: 50,
        warehouse: 'Almacén Secundario',
        entity: 'Empresa Demo S.A.',
      },
      {
        productCode: 'PROD-005',
        productName: 'Cable HDMI 2m',
        productUnit: 'und',
        unitPrice: 12,
        stock: 500,
        entries: 600,
        exits: 100,
        warehouse: 'Almacén Secundario',
        entity: 'Empresa Demo S.A.',
      },
      {
        productCode: 'PROD-006',
        productName: 'Disco SSD 1TB',
        productUnit: 'und',
        unitPrice: 95,
        stock: 15,
        entries: 20,
        exits: 5,
        stockLimit: 10,
        warehouse: 'Almacén Central',
        entity: 'Empresa Demo S.A.',
      },
      {
        productCode: 'PROD-007',
        productName: 'Memoria RAM 16GB DDR5',
        productUnit: 'und',
        unitPrice: 65,
        stock: 8,
        entries: 15,
        exits: 7,
        stockLimit: 10,
        warehouse: 'Almacén Central',
        entity: 'Empresa Demo S.A.',
      },
    ];

    for (const p of products) {
      const inv = new Inventory();
      inv.companyId = company1.id;
      inv.productCode = p.productCode;
      inv.productName = p.productName;
      inv.productUnit = p.productUnit;
      inv.unitPrice = p.unitPrice;
      inv.stock = p.stock;
      inv.entries = p.entries;
      inv.exits = p.exits;
      inv.stockLimit = (p as any).stockLimit || 0;
      inv.warehouse = p.warehouse;
      inv.entity = p.entity;
      await inventoryRepo.save(inv);
      console.log('Inventory created:', p.productName);
    }
  }

  console.log('\nSeed completed successfully!');
  await ds.destroy();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
