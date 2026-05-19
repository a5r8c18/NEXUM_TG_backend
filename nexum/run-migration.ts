import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

async function runMigration() {
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'nexum_db',
  });

  await ds.initialize();
  console.log('Connected to database');

  try {
    await ds.query(
      `ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS custodian_id UUID NULL`
    );
    console.log('✅ Column custodian_id added to warehouses');

    await ds.query(
      `ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS custodian_name VARCHAR(255) NULL`
    );
    console.log('✅ Column custodian_name added to warehouses');

    console.log('\n🎉 Warehouse custodian migration completed!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await ds.destroy();
  }
}

runMigration();
