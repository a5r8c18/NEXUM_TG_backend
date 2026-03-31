import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { Company } from './entities/company.entity';
import { User, UserRole } from './entities/user.entity';
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

  // Buscar o crear Teneduria Garcia (SYSTEM OWNER)
  let teneduriaGarcia = await companyRepo.findOneBy({ name: 'Teneduria Garcia' });
  if (!teneduriaGarcia) {
    teneduriaGarcia = new Company();
    teneduriaGarcia.name = 'Teneduria Garcia';
    teneduriaGarcia.taxId = 'TAX-TG-001';
    teneduriaGarcia.address = 'Calle Principal 456';
    teneduriaGarcia.phone = '555-0300';
    teneduriaGarcia.email = 'info@teneduriagarcia.com';
    teneduriaGarcia.isActive = true;
    teneduriaGarcia.tenantId = 'tenant-owner';
    teneduriaGarcia.tenantType = 'MULTI_COMPANY';
    teneduriaGarcia = await companyRepo.save(teneduriaGarcia);
    console.log('OWNER Company created:', teneduriaGarcia.name);
  } else {
    // Ensure tenant info is set
    teneduriaGarcia.tenantId = 'tenant-owner';
    teneduriaGarcia.tenantType = 'MULTI_COMPANY';
    teneduriaGarcia = await companyRepo.save(teneduriaGarcia);
    console.log('OWNER Company updated:', teneduriaGarcia.name, 'ID:', teneduriaGarcia.id);
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

  // --- Hashing helper ---
  const bcrypt = await import('bcryptjs');
  const hashPassword = async (pw: string) => bcrypt.hash(pw, 10);

  // --- Users ---
  // SUPERADMIN: Owner of the system (Teneduria Garcia)
  let superadminUser = await userRepo.findOneBy({ email: 'admin@teneduriagarcia.com' });
  if (!superadminUser) {
    superadminUser = new User();
    superadminUser.email = 'admin@teneduriagarcia.com';
    superadminUser.password = await hashPassword('Admin1234');
    superadminUser.firstName = 'Administrador';
    superadminUser.lastName = 'Garcia';
    superadminUser.role = UserRole.SUPERADMIN;
    superadminUser.tenantId = 'tenant-owner';
    superadminUser.tenantName = 'Teneduria Garcia';
    superadminUser.tenantType = 'MULTI_COMPANY';
    superadminUser.companyId = teneduriaGarcia.id;
    await userRepo.save(superadminUser);
    console.log('SUPERADMIN created:', superadminUser.email, '(Teneduria Garcia)');
  } else {
    // Update existing to ensure superadmin role
    superadminUser.role = UserRole.SUPERADMIN;
    superadminUser.password = await hashPassword('Admin1234');
    superadminUser.companyId = teneduriaGarcia.id;
    superadminUser.tenantId = 'tenant-owner';
    superadminUser.tenantName = 'Teneduria Garcia';
    superadminUser.tenantType = 'MULTI_COMPANY';
    await userRepo.save(superadminUser);
    console.log('SUPERADMIN updated:', superadminUser.email);
  }

  // Accountant user for Teneduria Garcia (handles accounting for clients)
  let accountantUser = await userRepo.findOneBy({ email: 'contable@teneduriagarcia.com' });
  if (!accountantUser) {
    accountantUser = new User();
    accountantUser.email = 'contable@teneduriagarcia.com';
    accountantUser.password = await hashPassword('Contable1234');
    accountantUser.firstName = 'Maria';
    accountantUser.lastName = 'Contable';
    accountantUser.role = UserRole.USER;
    accountantUser.tenantId = 'tenant-owner';
    accountantUser.tenantName = 'Teneduria Garcia';
    accountantUser.tenantType = 'MULTI_COMPANY';
    accountantUser.companyId = teneduriaGarcia.id;
    await userRepo.save(accountantUser);
    console.log('Accountant user created:', accountantUser.email);
  }

  // Demo admin user for Empresa Demo
  let adminUser = await userRepo.findOneBy({ email: 'admin@nexum.com' });
  if (!adminUser) {
    adminUser = new User();
    adminUser.email = 'admin@nexum.com';
    adminUser.password = await hashPassword('1234');
    adminUser.firstName = 'Admin';
    adminUser.lastName = 'NEXUM';
    adminUser.role = UserRole.ADMIN;
    adminUser.tenantId = 'tenant-demo';
    adminUser.tenantName = 'Empresa Demo S.A.';
    adminUser.tenantType = 'MULTI_COMPANY';
    adminUser.companyId = company1.id;
    await userRepo.save(adminUser);
    console.log('Demo admin created:', adminUser.email);
  } else {
    // Update password to bcrypt hash
    adminUser.password = await hashPassword('1234');
    await userRepo.save(adminUser);
    console.log('Demo admin password updated');
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
